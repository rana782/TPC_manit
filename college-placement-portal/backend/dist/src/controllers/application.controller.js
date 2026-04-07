"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyApplications = exports.withdrawApplication = exports.applyForJob = void 0;
const client_1 = require("@prisma/client");
const notification_service_1 = require("../services/notification.service");
const ats_controller_1 = require("./ats.controller");
const atsAnalysis_service_1 = require("../services/atsAnalysis.service");
const prisma = new client_1.PrismaClient();
const MIN_RESUME_TEXT_LENGTH = 50;
const ATS_DEBUG = String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';
const ATS_TIMEOUT_MS = Number(process.env.ATS_TIMEOUT_MS || 12000);
/** Job CSV / UI may use "department" while Student model uses `branch`. */
const PROFILE_FIELD_ALIASES = {
    department: 'branch',
    dept: 'branch',
    scholarNumber: 'scholarNo',
};
function getStudentFieldForJob(student, field) {
    var _a;
    if (field === 'resume')
        return undefined;
    const key = (_a = PROFILE_FIELD_ALIASES[field]) !== null && _a !== void 0 ? _a : field;
    return student[key];
}
/** Eligible branch codes vs common full names saved on profiles / seeds. */
const BRANCH_CODE_ALIASES = {
    CSE: ['CSE', 'Computer Science', 'CS', 'COMPUTER SCIENCE'],
    ECE: ['ECE', 'Electronics', 'Electronics and Communication', 'Electronics & Communication'],
    EE: ['EE', 'Electrical', 'Electrical Engineering'],
    MDS: ['MDS'],
    Mech: ['Mech', 'Mechanical', 'Mechanical Engineering'],
    Civil: ['Civil', 'Civil Engineering'],
    MME: ['MME'],
    Chem: ['Chem', 'Chemical', 'Chemical Engineering'],
};
function branchIsEligible(studentBranch, eligibleBranches) {
    if (!eligibleBranches.length)
        return true;
    const sb = (studentBranch || '').trim();
    if (!sb)
        return false;
    if (eligibleBranches.includes(sb))
        return true;
    const lower = sb.toLowerCase();
    return eligibleBranches.some((code) => {
        var _a;
        const aliases = BRANCH_CODE_ALIASES[code];
        return (_a = aliases === null || aliases === void 0 ? void 0 : aliases.some((a) => a.toLowerCase() === lower)) !== null && _a !== void 0 ? _a : false;
    });
}
/** DB/UI may store JSON arrays as strings; invalid or non-array JSON must not crash apply (e.g. "null", "{}"). */
function parseJsonStringArray(raw) {
    if (Array.isArray(raw))
        return raw.map((x) => String(x));
    if (typeof raw !== 'string' || raw.trim() === '')
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
            return parsed.map((x) => String(x));
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.fields)) {
            return (parsed.fields).map((x) => String(x));
        }
    }
    catch (_a) {
        /* ignore */
    }
    return [];
}
function safeJsonStringify(value, label) {
    try {
        return JSON.stringify(value !== null && value !== void 0 ? value : {});
    }
    catch (e) {
        console.error(`[applyForJob] ${label} JSON.stringify failed:`, e);
        return '{}';
    }
}
const defaultAtsResult = {
    score: 0,
    matchScore: 0,
    semanticScore: 0,
    skillScore: 0,
    explanation: 'ATS score pending or unavailable.',
    matchedKeywords: [],
    skillsMatched: [],
    skillsMissing: [],
    suggestions: []
};
const applyForJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { jobId, resumeId } = req.body;
        if (!jobId || !resumeId) {
            return res.status(400).json({ success: false, message: 'Both jobId and resumeId are required' });
        }
        // Validate Job existence and deadline
        const job = yield prisma.job.findUnique({ where: { id: jobId } });
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        if (job.applicationDeadline &&
            !Number.isNaN(new Date(job.applicationDeadline).getTime()) &&
            new Date() > new Date(job.applicationDeadline)) {
            return res.status(400).json({ success: false, message: 'Job application deadline has passed' });
        }
        // Retrieve Student profile and validate they own the resume
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found. Please create one to apply.' });
        }
        const resume = yield prisma.resume.findFirst({
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
        const existingApps = yield prisma.jobApplication.findMany({
            where: { studentId: student.id, jobId: job.id },
            orderBy: { appliedAt: 'desc' }
        });
        const activeExisting = existingApps.find((app) => String(app.status || '').toUpperCase() !== 'WITHDRAWN');
        const reusableWithdrawn = existingApps.find((app) => String(app.status || '').toUpperCase() === 'WITHDRAWN');
        if (activeExisting) {
            return res.status(400).json({ success: false, message: 'You have already applied for this job' });
        }
        // Enforce Eligibility
        if (job.cgpaMin !== null && job.cgpaMin > (student.cgpa || 0)) {
            return res.status(400).json({ success: false, message: `Your CGPA (${student.cgpa || 0}) does not meet the minimum requirement of ${job.cgpaMin}.` });
        }
        const eligibleBranches = parseJsonStringArray(job.eligibleBranches);
        if (eligibleBranches.length > 0 && !branchIsEligible(student.branch, eligibleBranches)) {
            return res.status(400).json({ success: false, message: `Your branch (${student.branch || 'not set'}) is not eligible for this job.` });
        }
        // Store Custom Answers into extraAnswers column
        const customAnswers = req.body.answers || {};
        // Enforce & Extract Required Profile Fields (always a string[] — never iterate non-arrays)
        const requiredFields = parseJsonStringArray(job.requiredProfileFields);
        const applicationDataSnapshot = {};
        const missingFields = [];
        const stu = student;
        for (const field of requiredFields) {
            if (field === 'resume') {
                applicationDataSnapshot['resume'] = resume.fileUrl;
            }
            else {
                const val = getStudentFieldForJob(stu, field);
                if (val === undefined || val === null || val === '') {
                    missingFields.push(field);
                }
                else {
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
        // Create or reuse (WITHDRAWN) application first. ATS runs as non-blocking secondary process.
        let application;
        let applyMessage = 'Successfully applied to job!';
        if (reusableWithdrawn) {
            application = yield prisma.jobApplication.update({
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
        }
        else {
            application = yield prisma.jobApplication.create({
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
        void (() => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const resumeText = yield (0, ats_controller_1.getResumeTextForAts)(resume);
                const jobText = `${job.role}\n${job.description || ''}`;
                console.log('Resume Length:', (resumeText === null || resumeText === void 0 ? void 0 : resumeText.length) || 0);
                console.log('JD Length:', (jobText === null || jobText === void 0 ? void 0 : jobText.length) || 0);
                if (!resumeText || !jobText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
                    throw new Error('Uploaded resume PDF could not be parsed');
                }
                const parsedResume = yield (0, atsAnalysis_service_1.parseResumeWithLlm)(resumeText);
                const atsPromise = (0, atsAnalysis_service_1.getATSAnalysis)(parsedResume.normalizedText, jobText);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`ATS timeout after ${ATS_TIMEOUT_MS}ms`)), ATS_TIMEOUT_MS);
                });
                const atsResult = yield Promise.race([atsPromise, timeoutPromise]);
                console.log('ATS Output:', atsResult);
                yield prisma.jobApplication.update({
                    where: { id: application.id },
                    data: {
                        atsScore: (_a = atsResult === null || atsResult === void 0 ? void 0 : atsResult.score) !== null && _a !== void 0 ? _a : 0,
                        atsExplanation: (atsResult === null || atsResult === void 0 ? void 0 : atsResult.explanation) || defaultAtsResult.explanation,
                        atsMatchedKeywords: JSON.stringify((atsResult === null || atsResult === void 0 ? void 0 : atsResult.matchedKeywords) || []),
                        semanticScore: (_b = atsResult === null || atsResult === void 0 ? void 0 : atsResult.semanticScore) !== null && _b !== void 0 ? _b : 0,
                        skillScore: (_c = atsResult === null || atsResult === void 0 ? void 0 : atsResult.skillScore) !== null && _c !== void 0 ? _c : 0,
                        skillsMatched: JSON.stringify((atsResult === null || atsResult === void 0 ? void 0 : atsResult.skillsMatched) || []),
                        skillsMissing: JSON.stringify((atsResult === null || atsResult === void 0 ? void 0 : atsResult.skillsMissing) || []),
                        suggestions: JSON.stringify((atsResult === null || atsResult === void 0 ? void 0 : atsResult.suggestions) || [])
                    }
                });
            }
            catch (e) {
                console.warn('[ATS] Async scoring failed, continuing with default scores:', e);
            }
        }))();
        // Notification trigger: student applied to a job
        (0, notification_service_1.enqueueAndSend)(userId, 'APPLICATION_SUBMITTED', `Your application to ${job.role} at ${job.companyName} has been submitted successfully!`).catch(() => { });
        // WhatsApp / Zapier trigger
        (0, notification_service_1.sendWhatsApp)(userId, job.id, 'APPLICATION_CONFIRMATION', {
            company_name: job.companyName,
            role: job.role
        }).catch(() => { });
        res.status(201).json({
            success: true,
            message: applyMessage,
            application,
            atsScore: (_b = application.atsScore) !== null && _b !== void 0 ? _b : null,
            matchScore: (_c = application.atsScore) !== null && _c !== void 0 ? _c : null,
            semanticScore: (_d = application.semanticScore) !== null && _d !== void 0 ? _d : 0,
            skillScore: (_e = application.skillScore) !== null && _e !== void 0 ? _e : 0,
            skillsMatched: (() => { try {
                return JSON.parse(application.skillsMatched || '[]');
            }
            catch (_a) {
                return [];
            } })(),
            skillsMissing: (() => { try {
                return JSON.parse(application.skillsMissing || '[]');
            }
            catch (_a) {
                return [];
            } })(),
            matchedSkills: (() => { try {
                return JSON.parse(application.skillsMatched || '[]');
            }
            catch (_a) {
                return [];
            } })(),
            missingSkills: (() => { try {
                return JSON.parse(application.skillsMissing || '[]');
            }
            catch (_a) {
                return [];
            } })(),
            suggestions: (() => { try {
                return JSON.parse(application.suggestions || '[]');
            }
            catch (_a) {
                return [];
            } })(),
        });
    }
    catch (error) {
        console.error("Job Apply Error:", error);
        const devHint = process.env.NODE_ENV !== 'production' && error instanceof Error
            ? ` (${error.message})`
            : '';
        const prismaCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        const message = prismaCode === 'P2002'
            ? 'You have already applied for this job'
            : `Failed to process job application${devHint}`;
        res.status(prismaCode === 'P2002' ? 400 : 500).json({ success: false, message });
    }
});
exports.applyForJob = applyForJob;
const withdrawApplication = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { id } = req.params;
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student)
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        const application = yield prisma.jobApplication.findUnique({
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
        const updated = yield prisma.jobApplication.update({
            where: { id: application.id },
            data: { status: 'WITHDRAWN' }
        });
        return res.json({
            success: true,
            message: 'Application withdrawn successfully',
            application: updated
        });
    }
    catch (error) {
        console.error('Withdraw application error:', error);
        return res.status(500).json({ success: false, message: 'Failed to withdraw application' });
    }
});
exports.withdrawApplication = withdrawApplication;
const getMyApplications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        }
        const applications = yield prisma.jobApplication.findMany({
            where: { studentId: student.id },
            include: {
                job: {
                    select: {
                        id: true,
                        role: true,
                        companyName: true,
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
        const safeStatus = (s) => (s ? String(s).toUpperCase() : '');
        // Dashboard stats for student cards
        const jobsOffered = applications.filter((a) => {
            const s = safeStatus(a.status);
            return s.includes('ACCEPT') || s.includes('OFFER') || s === 'SELECTED';
        }).length;
        const shortlisted = applications.filter((a) => {
            const s = safeStatus(a.status);
            return s.includes('SHORTLIST');
        }).length;
        // Structured application timeline (ordered, detailed stages)
        const buildTimeline = (job, application) => {
            var _a, _b;
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
            if (status.includes('REVIEW'))
                currentIndex = 3;
            if (status.includes('SHORTLIST'))
                currentIndex = 4;
            if (status.includes('ACCEPT') || status.includes('OFFER') || status === 'SELECTED')
                currentIndex = 9;
            if (status.includes('REJECT'))
                currentIndex = 9;
            const stages = Array.isArray(job === null || job === void 0 ? void 0 : job.stages) ? job.stages : [];
            const lastStage = stages.length ? stages[stages.length - 1] : null;
            const toISO = (d) => {
                if (!d)
                    return null;
                const dt = d instanceof Date ? d : new Date(d);
                return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
            };
            const jobPostedDate = toISO(job === null || job === void 0 ? void 0 : job.createdAt);
            // Map scheduled job stages onto the detailed timeline
            const underReviewDate = toISO((_a = stages[0]) === null || _a === void 0 ? void 0 : _a.scheduledDate);
            const shortlistedDate = toISO((_b = stages[1]) === null || _b === void 0 ? void 0 : _b.scheduledDate);
            const interviewScheduledIdx = stages.findIndex((s) => String((s === null || s === void 0 ? void 0 : s.name) || '').toUpperCase().includes('INTERVIEW'));
            const interviewScheduledStage = interviewScheduledIdx >= 0 ? stages[interviewScheduledIdx] : stages[2];
            const interviewCompletedStage = interviewScheduledIdx >= 0 ? stages[interviewScheduledIdx + 1] : stages[3];
            const interviewScheduledDate = toISO(interviewScheduledStage === null || interviewScheduledStage === void 0 ? void 0 : interviewScheduledStage.scheduledDate);
            const interviewCompletedDate = toISO(interviewCompletedStage === null || interviewCompletedStage === void 0 ? void 0 : interviewCompletedStage.scheduledDate);
            const appliedDate = toISO(application === null || application === void 0 ? void 0 : application.appliedAt);
            const selectedDate = toISO(lastStage === null || lastStage === void 0 ? void 0 : lastStage.scheduledDate) || appliedDate;
            const offeredDate = toISO(lastStage === null || lastStage === void 0 ? void 0 : lastStage.scheduledDate) || appliedDate;
            const finalDate = status.includes('REJECT')
                ? (toISO(lastStage === null || lastStage === void 0 ? void 0 : lastStage.scheduledDate) || appliedDate)
                : (toISO(lastStage === null || lastStage === void 0 ? void 0 : lastStage.scheduledDate) || appliedDate);
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
            return stageDefs.map((def, idx) => {
                var _a;
                const marker = idx < currentIndex ? 'completed' : idx === currentIndex ? 'current' : 'pending';
                const date = (_a = dateByIndex[idx]) !== null && _a !== void 0 ? _a : null;
                return Object.assign({ stage: def.stage, date, status: marker }, (idx === 9 ? { outcome: finalOutcome } : {}));
            });
        };
        const applicationsWithTimeline = applications.map((a) => {
            const skillsMatched = (() => { try {
                return JSON.parse(a.skillsMatched || '[]');
            }
            catch (_a) {
                return [];
            } })();
            const skillsMissing = (() => { try {
                return JSON.parse(a.skillsMissing || '[]');
            }
            catch (_a) {
                return [];
            } })();
            const suggestions = (() => { try {
                return JSON.parse(a.suggestions || '[]');
            }
            catch (_a) {
                return [];
            } })();
            return Object.assign(Object.assign({}, a), { matchedSkills: skillsMatched, missingSkills: skillsMissing, suggestions, timeline: buildTimeline(a.job, a) });
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch applications' });
    }
});
exports.getMyApplications = getMyApplications;
