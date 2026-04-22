// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { enqueueAndSend, sendWhatsApp } from '../services/notification.service';
import { getResumeTextForAtsWithMeta, getJobTextForAts, buildResumeInputForAtsParser } from './ats.controller';
import { getATSAnalysis, parseResumeWithLlm } from '../services/atsAnalysis.service';
import prisma from '../lib/prisma';
import { normalizeTpcBranch } from '../utils/tpcBranches';
const MIN_RESUME_TEXT_LENGTH = 50;
const ATS_DEBUG = String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';
const ATS_TIMEOUT_MS = Number(process.env.ATS_TIMEOUT_MS || 12000);

/** Job CSV / UI may use "department" while Student model uses `branch`. */
const PROFILE_FIELD_ALIASES: Record<string, string> = {
    department: 'branch',
    dept: 'branch',
    scholarNumber: 'scholarNo',
};

function getStudentFieldForJob(student: Record<string, unknown>, field: string): unknown {
    if (field === 'resume') return undefined;
    const key = PROFILE_FIELD_ALIASES[field] ?? field;
    return student[key];
}

function branchIsEligible(studentBranch: string | null | undefined, eligibleBranches: string[]): boolean {
    if (!eligibleBranches.length) return true;
    const sb = (studentBranch || '').trim();
    if (!sb) return false;
    const nStudent = normalizeTpcBranch(sb);
    const eligibleNorm = new Set(eligibleBranches.map((e) => normalizeTpcBranch(e)));
    return eligibleNorm.has(nStudent);
}

/** DB/UI may store JSON arrays as strings; invalid or non-array JSON must not crash apply (e.g. "null", "{}"). */
function parseJsonStringArray(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map((x) => String(x));
    if (typeof raw !== 'string' || raw.trim() === '') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x));
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { fields?: unknown }).fields)) {
            return ((parsed as { fields: unknown[] }).fields).map((x) => String(x));
        }
    } catch {
        /* ignore */
    }
    return [];
}

function safeJsonStringify(value: unknown, label: string): string {
    try {
        return JSON.stringify(value ?? {});
    } catch (e) {
        console.error(`[applyForJob] ${label} JSON.stringify failed:`, e);
        return '{}';
    }
}

function toFiniteNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

const defaultAtsResult = {
    score: 0,
    matchScore: 0,
    semanticScore: 0,
    skillScore: 0,
    explanation: 'ATS score pending or unavailable.',
    matchedKeywords: [] as string[],
    skillsMatched: [] as string[],
    skillsMissing: [] as string[],
    suggestions: [] as string[]
};

export const applyForJob = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { jobId, resumeId } = req.body;
        if (!jobId || !resumeId) {
            return res.status(400).json({ success: false, message: 'Both jobId and resumeId are required' });
        }

        // Validate Job existence and deadline
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        if (
            job.applicationDeadline &&
            !Number.isNaN(new Date(job.applicationDeadline).getTime()) &&
            new Date() > new Date(job.applicationDeadline)
        ) {
            return res.status(400).json({ success: false, message: 'Job application deadline has passed' });
        }

        // Retrieve Student profile and validate they own the resume
        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found. Please create one to apply.' });
        }

        const resume = await prisma.resume.findFirst({
            where: { id: resumeId, studentId: student.id }
        });
        if (!resume) {
            return res.status(400).json({ success: false, message: 'Invalid resume selected' });
        }

        // Block placed / locked student profiles
        if (student.isLocked) {
            return res.status(403).json({
                success: false,
                error: 'Placed students cannot apply to jobs',
                message: 'Placed students cannot apply to jobs'
            });
        }

        // Prevent duplicate active applications, but allow reapply from WITHDRAWN.
        const existingApps = await prisma.jobApplication.findMany({
            where: { studentId: student.id, jobId: job.id },
            orderBy: { appliedAt: 'desc' }
        });
        const activeExisting = existingApps.find((app) => String(app.status || '').toUpperCase() !== 'WITHDRAWN');
        const reusableWithdrawn = existingApps.find((app) => String(app.status || '').toUpperCase() === 'WITHDRAWN');
        if (activeExisting) {
            return res.status(400).json({ success: false, message: 'You have already applied for this job' });
        }

        const eligibleBranches = parseJsonStringArray(job.eligibleBranches);
        const requiredFields = parseJsonStringArray(job.requiredProfileFields);

        if (eligibleBranches.length > 0 && !branchIsEligible(student.branch, eligibleBranches)) {
            return res.status(400).json({ success: false, message: `Your branch (${student.branch || 'not set'}) is not eligible for this job.` });
        }

        // Store Custom Answers into extraAnswers column
        const customAnswers = req.body.answers || {};

        // Enforce & Extract Required Profile Fields (always a string[] — never iterate non-arrays)
        const applicationDataSnapshot: Record<string, any> = {};
        const missingFields: string[] = [];

        const stu = student as Record<string, unknown>;
        for (const field of requiredFields) {
            if (field === 'resume') {
                applicationDataSnapshot['resume'] = resume.fileUrl;
            } else {
                const val = getStudentFieldForJob(stu, field);
                if (val === undefined || val === null || val === '') {
                    missingFields.push(field);
                } else {
                    applicationDataSnapshot[field] = val;
                }
            }
        }

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Your profile is missing required fields for this job: ${missingFields.join(', ')}. Please update your profile.`,
                missingFields
            });
        }

        // Enforce minimum CGPA after profile-field checks so "missing CGPA" isn't reported as 0.
        const studentCgpa = toFiniteNumberOrNull((student as Record<string, unknown>).cgpa);
        if (job.cgpaMin !== null && job.cgpaMin > 0) {
            if (studentCgpa === null) {
                return res.status(400).json({
                    success: false,
                    message: `Your profile CGPA is missing. Please update your profile before applying (minimum required: ${job.cgpaMin}).`,
                });
            }
            if (job.cgpaMin > studentCgpa) {
                return res.status(400).json({
                    success: false,
                    message: `Your CGPA (${studentCgpa}) does not meet the minimum requirement of ${job.cgpaMin}.`,
                });
            }
        }

        // Create or reuse (WITHDRAWN) application first. ATS runs as non-blocking secondary process.
        let application: any;
        let applyMessage = 'Successfully applied to job!';
        if (reusableWithdrawn) {
            application = await prisma.jobApplication.update({
                where: { id: reusableWithdrawn.id },
                data: {
                    resumeId: resume.id,
                    applicationData: safeJsonStringify(applicationDataSnapshot, 'applicationData'),
                    extraAnswers: safeJsonStringify(customAnswers, 'extraAnswers'),
                    status: 'APPLIED',
                    currentStageIndex: 0,
                    appliedAt: new Date(),
                    atsScore: 0,
                    atsExplanation: defaultAtsResult.explanation,
                    atsMatchedKeywords: JSON.stringify(defaultAtsResult.matchedKeywords),
                    semanticScore: 0,
                    skillScore: 0,
                    skillsMatched: JSON.stringify(defaultAtsResult.skillsMatched),
                    skillsMissing: JSON.stringify(defaultAtsResult.skillsMissing),
                    suggestions: JSON.stringify(defaultAtsResult.suggestions)
                }
            });
            applyMessage = 'Successfully reapplied to job!';
        } else {
            application = await prisma.jobApplication.create({
                data: {
                    studentId: student.id,
                    jobId: job.id,
                    resumeId: resume.id,
                    applicationData: safeJsonStringify(applicationDataSnapshot, 'applicationData'),
                    extraAnswers: safeJsonStringify(customAnswers, 'extraAnswers'),
                    status: 'APPLIED',
                    currentStageIndex: 0,
                    atsScore: 0,
                    atsExplanation: defaultAtsResult.explanation,
                    atsMatchedKeywords: JSON.stringify(defaultAtsResult.matchedKeywords),
                    semanticScore: 0,
                    skillScore: 0,
                    skillsMatched: JSON.stringify(defaultAtsResult.skillsMatched),
                    skillsMissing: JSON.stringify(defaultAtsResult.skillsMissing),
                    suggestions: JSON.stringify(defaultAtsResult.suggestions)
                }
            });
        }

        if (ATS_DEBUG) {
            console.log('[ATS_DEBUG] Applying student:', student.id);
            console.log('[ATS_DEBUG] Job ID:', job.id);
            console.log('[ATS_DEBUG] Resume URL:', resume.fileUrl);
        }

        void (async () => {
            try {
                const resumeMeta = await getResumeTextForAtsWithMeta(resume);
                const resumeText = resumeMeta.text;
                const jobText = await getJobTextForAts(job);
                const resumeForParser = buildResumeInputForAtsParser(resumeMeta);
                console.log('Resume Length:', resumeForParser?.length || 0);
                console.log('JD Length:', jobText?.length || 0);

                if (!resumeText || !jobText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
                    throw new Error('Uploaded resume PDF could not be parsed');
                }

                const parsedResume = await parseResumeWithLlm(resumeForParser);
                const atsPromise = getATSAnalysis(parsedResume.normalizedText, jobText);

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`ATS timeout after ${ATS_TIMEOUT_MS}ms`)), ATS_TIMEOUT_MS);
                });

                const atsResult = await Promise.race([atsPromise, timeoutPromise]) as any;
                console.log('ATS Output:', atsResult);

                await prisma.jobApplication.update({
                    where: { id: application.id },
                    data: {
                        atsScore: atsResult?.score ?? 0,
                        atsExplanation: atsResult?.explanation || defaultAtsResult.explanation,
                        atsMatchedKeywords: JSON.stringify(atsResult?.matchedKeywords || []),
                        semanticScore: atsResult?.semanticScore ?? 0,
                        skillScore: atsResult?.skillScore ?? 0,
                        skillsMatched: JSON.stringify(atsResult?.skillsMatched || []),
                        skillsMissing: JSON.stringify(atsResult?.skillsMissing || []),
                        suggestions: JSON.stringify(atsResult?.suggestions || [])
                    }
                });
            } catch (e) {
                console.warn('[ATS] Async scoring failed, continuing with default scores:', e);
            }
        })();

        // Notification trigger: student applied to a job
        enqueueAndSend(
            userId,
            'APPLICATION_SUBMITTED',
            `Your application to ${job.role} at ${job.companyName} has been submitted successfully!`
        ).catch(() => { });

        // WhatsApp / Zapier trigger
        sendWhatsApp(userId, job.id, 'APPLICATION_CONFIRMATION', {
            company_name: job.companyName,
            role: job.role
        }).catch(() => { });

        res.status(201).json({
            success: true,
            message: applyMessage,
            application,
            atsScore: application.atsScore ?? null,
            matchScore: application.atsScore ?? null,
            semanticScore: application.semanticScore ?? 0,
            skillScore: application.skillScore ?? 0,
            skillsMatched: (() => { try { return JSON.parse(application.skillsMatched || '[]'); } catch { return []; } })(),
            skillsMissing: (() => { try { return JSON.parse(application.skillsMissing || '[]'); } catch { return []; } })(),
            matchedSkills: (() => { try { return JSON.parse(application.skillsMatched || '[]'); } catch { return []; } })(),
            missingSkills: (() => { try { return JSON.parse(application.skillsMissing || '[]'); } catch { return []; } })(),
            suggestions: (() => { try { return JSON.parse(application.suggestions || '[]'); } catch { return []; } })(),
        });
    } catch (error) {
        console.error("Job Apply Error:", error);
        const devHint =
            process.env.NODE_ENV !== 'production' && error instanceof Error
                ? ` (${error.message})`
                : '';
        const prismaCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
        const message =
            prismaCode === 'P2002'
                ? 'You have already applied for this job'
                : `Failed to process job application${devHint}`;
        res.status(prismaCode === 'P2002' ? 400 : 500).json({ success: false, message });
    }
};

export const withdrawApplication = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { id } = req.params;
        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

        const application = await prisma.jobApplication.findUnique({
            where: { id },
            include: { job: true }
        });
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        if (application.studentId !== student.id) {
            return res.status(403).json({ success: false, message: 'Forbidden. You can withdraw only your own applications.' });
        }

        const now = new Date();
        if (now >= new Date(application.job.applicationDeadline)) {
            return res.status(400).json({ success: false, message: 'Cannot withdraw after application deadline' });
        }

        const status = String(application.status || '').toUpperCase();
        if (status === 'WITHDRAWN') {
            return res.json({ success: true, message: 'Application already withdrawn', application });
        }
        if (status !== 'APPLIED') {
            return res.status(400).json({ success: false, message: `Cannot withdraw application in ${status || 'current'} state` });
        }

        const updated = await prisma.jobApplication.update({
            where: { id: application.id },
            data: { status: 'WITHDRAWN' }
        });

        return res.json({
            success: true,
            message: 'Application withdrawn successfully',
            application: updated
        });
    } catch (error) {
        console.error('Withdraw application error:', error);
        return res.status(500).json({ success: false, message: 'Failed to withdraw application' });
    }
};

export const getMyApplications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        }

        const applications = await prisma.jobApplication.findMany({
            where: { studentId: student.id },
            include: {
                job: {
                    select: {
                        id: true,
                        role: true,
                        companyName: true,
                        jobType: true,
                        ctc: true,
                        cgpaMin: true,
                        applicationDeadline: true,
                        createdAt: true,
                        stages: {
                            orderBy: {
                                scheduledDate: 'asc'
                            }
                        }
                    }
                }
            },
            orderBy: { appliedAt: 'desc' }
        });

        const jobIds = Array.from(new Set(applications.map((a: any) => String(a.jobId || '')).filter(Boolean)));
        const stageCountsByJobId = new Map<string, Map<number, number>>();
        if (jobIds.length > 0) {
            const allJobApps = await prisma.jobApplication.findMany({
                where: {
                    jobId: { in: jobIds },
                },
                select: {
                    jobId: true,
                    currentStageIndex: true,
                    status: true,
                },
            });

            for (const row of allJobApps as any[]) {
                const status = String(row.status || '').toUpperCase();
                if (status === 'WITHDRAWN') continue;
                const jobId = String(row.jobId || '');
                const idx = Number(row.currentStageIndex ?? -1);
                if (!jobId || idx < 0) continue;
                let perJob = stageCountsByJobId.get(jobId);
                if (!perJob) {
                    perJob = new Map<number, number>();
                    stageCountsByJobId.set(jobId, perJob);
                }
                perJob.set(idx, (perJob.get(idx) || 0) + 1);
            }
        }

        const safeStatus = (s: any) => (s ? String(s).toUpperCase() : '');

        // Dashboard stats for student cards
        const jobsOffered = applications.filter((a: any) => {
            const s = safeStatus(a.status);
            return s.includes('ACCEPT') || s.includes('OFFER') || s === 'SELECTED' || s.includes('PLACED');
        }).length;

        const shortlisted = applications.filter((a: any) => {
            const s = safeStatus(a.status);
            return s.includes('SHORTLIST');
        }).length;

        // Structured application timeline (ordered, detailed stages)
        const buildTimeline = (job: any, application: any) => {
            const status = safeStatus(application.status);

            // Stage sequence (must remain in order)
            const stageDefs = [
                { stage: 'Job Posted' },
                { stage: 'Application Opened' },
                { stage: 'Applied' },
                { stage: 'Under Review' },
                { stage: 'Shortlisted' },
                { stage: 'Interview Scheduled' },
                { stage: 'Interview Completed' },
                { stage: 'Selected' },
                { stage: 'Offered' },
                { stage: 'Placed / Rejected' },
            ];

            // Infer the "current" stage from application status
            let currentIndex = 2; // Applied
            if (status.includes('REVIEW')) currentIndex = 3;
            if (status.includes('SHORTLIST')) currentIndex = 4;
            if (status.includes('ACCEPT') || status.includes('OFFER') || status === 'SELECTED' || status.includes('PLACED')) currentIndex = 9;
            if (status.includes('REJECT')) currentIndex = 9;

            const stages = Array.isArray(job?.stages) ? job.stages : [];
            const lastStage = stages.length ? stages[stages.length - 1] : null;

            const toISO = (d: any) => {
                if (!d) return null;
                const dt = d instanceof Date ? d : new Date(d);
                return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
            };

            const jobPostedDate = toISO(job?.createdAt);

            // Map scheduled job stages onto the detailed timeline
            const underReviewDate = toISO(stages[0]?.scheduledDate);
            const shortlistedDate = toISO(stages[1]?.scheduledDate);

            const interviewScheduledIdx = stages.findIndex((s: any) => String(s?.name || '').toUpperCase().includes('INTERVIEW'));
            const interviewScheduledStage = interviewScheduledIdx >= 0 ? stages[interviewScheduledIdx] : stages[2];
            const interviewCompletedStage = interviewScheduledIdx >= 0 ? stages[interviewScheduledIdx + 1] : stages[3];

            const interviewScheduledDate = toISO(interviewScheduledStage?.scheduledDate);
            const interviewCompletedDate = toISO(interviewCompletedStage?.scheduledDate);

            const appliedDate = toISO(application?.appliedAt);

            const selectedDate = toISO(lastStage?.scheduledDate) || appliedDate;
            const offeredDate = toISO(lastStage?.scheduledDate) || appliedDate;

            const finalDate = status.includes('REJECT')
                ? (toISO(lastStage?.scheduledDate) || appliedDate)
                : (toISO(lastStage?.scheduledDate) || appliedDate);

            const finalOutcome = status.includes('REJECT') ? 'Rejected' : 'Placed';

            const dateByIndex = [
                jobPostedDate,
                jobPostedDate, // Application opened uses job creation time as we don't persist a separate open date
                appliedDate,
                underReviewDate,
                shortlistedDate,
                interviewScheduledDate,
                interviewCompletedDate,
                selectedDate,
                offeredDate,
                finalDate,
            ];

            return stageDefs.map((def: any, idx: number) => {
                const marker =
                    idx < currentIndex ? 'completed' : idx === currentIndex ? 'current' : 'pending';
                const date = dateByIndex[idx] ?? null;
                return {
                    stage: def.stage,
                    date,
                    status: marker,
                    ...(idx === 9 ? { outcome: finalOutcome } : {}),
                };
            });
        };

        const applicationsWithTimeline = applications.map((a: any) => {
            const skillsMatched = (() => { try { return JSON.parse(a.skillsMatched || '[]'); } catch { return []; } })();
            const skillsMissing = (() => { try { return JSON.parse(a.skillsMissing || '[]'); } catch { return []; } })();
            const suggestions = (() => { try { return JSON.parse(a.suggestions || '[]'); } catch { return []; } })();
            const stageCounts = stageCountsByJobId.get(String(a.jobId || '')) || new Map<number, number>();
            const stagesWithCounts = Array.isArray(a.job?.stages)
                ? a.job.stages.map((s: any, idx: number) => ({
                    ...s,
                    stageCandidateCount: stageCounts.get(idx) || 0,
                }))
                : [];
            return {
                ...a,
                job: {
                    ...a.job,
                    stages: stagesWithCounts,
                },
                matchedSkills: skillsMatched,
                missingSkills: skillsMissing,
                suggestions,
                timeline: buildTimeline(a.job, a),
            };
        });

        console.log('[getMyApplications]', {
            userId,
            studentId: student.id,
            applicationsReturned: applicationsWithTimeline.length
        });

        res.json({
            success: true,
            applications: applicationsWithTimeline,
            stats: {
                appliedJobs: applicationsWithTimeline.length,
                jobsOffered,
                shortlisted,
                profileLocked: !!student.isLocked,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch applications' });
    }
};
