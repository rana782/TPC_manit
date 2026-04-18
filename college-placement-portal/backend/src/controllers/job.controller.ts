// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middlewares/auth.middleware';
import { z } from 'zod';
import { normalizeCompanyName } from '../utils/companyNormalizer';
import prisma from '../lib/prisma';

function unlinkUploadRelative(relPath: string | null | undefined) {
    if (!relPath || typeof relPath !== 'string' || !relPath.startsWith('/uploads/')) return;
    const name = path.basename(relPath);
    const full = path.resolve(__dirname, '../../uploads', name);
    try {
        fs.unlinkSync(full);
    } catch {
        /* ignore missing file */
    }
}

function normalizeShortlistDocTitle(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const t = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
    return t.length > 0 ? t : null;
}

/** When stage dates change, sorted order may change — remap indices by stage id. */
async function remapApplicationsAfterStageOrderChange(
    jobId: string,
    oldStagesOrdered: { id: string }[],
    newStagesOrdered: { id: string }[]
) {
    const apps = await prisma.jobApplication.findMany({ where: { jobId }, select: { id: true, currentStageIndex: true } });
    const updates: { id: string; currentStageIndex: number }[] = [];
    for (const app of apps) {
        const k = app.currentStageIndex ?? 0;
        if (k < 0) continue;
        if (k >= oldStagesOrdered.length) {
            updates.push({
                id: app.id,
                currentStageIndex: newStagesOrdered.length ? Math.min(k, newStagesOrdered.length - 1) : -1
            });
            continue;
        }
        const sid = oldStagesOrdered[k].id;
        const newIdx = newStagesOrdered.findIndex((s) => s.id === sid);
        if (newIdx === -1) {
            updates.push({ id: app.id, currentStageIndex: -1 });
        } else {
            updates.push({ id: app.id, currentStageIndex: newIdx });
        }
    }
    if (updates.length === 0) return;
    await prisma.$transaction(
        updates.map((u) => prisma.jobApplication.update({ where: { id: u.id }, data: { currentStageIndex: u.currentStageIndex } }))
    );
}

/** After deleting one stage, shift applicant indices. */
async function remapApplicationsAfterStageDelete(
    jobId: string,
    deletedIndex: number,
    oldLen: number,
    newStagesOrdered: { id: string }[]
) {
    if (newStagesOrdered.length === 0) {
        await prisma.jobApplication.updateMany({ where: { jobId }, data: { currentStageIndex: -1 } });
        return;
    }
    const apps = await prisma.jobApplication.findMany({ where: { jobId }, select: { id: true, currentStageIndex: true } });
    const updates: { id: string; currentStageIndex: number }[] = [];
    for (const app of apps) {
        const k = app.currentStageIndex ?? 0;
        if (k < 0) continue;
        if (k >= oldLen) {
            updates.push({ id: app.id, currentStageIndex: Math.max(0, newStagesOrdered.length - 1) });
            continue;
        }
        if (k < deletedIndex) {
            updates.push({ id: app.id, currentStageIndex: k });
        } else if (k === deletedIndex) {
            const newIdx = deletedIndex === 0 ? 0 : deletedIndex - 1;
            updates.push({ id: app.id, currentStageIndex: Math.min(newIdx, newStagesOrdered.length - 1) });
        } else {
            updates.push({ id: app.id, currentStageIndex: k - 1 });
        }
    }
    if (updates.length === 0) return;
    await prisma.$transaction(
        updates.map((u) => prisma.jobApplication.update({ where: { id: u.id }, data: { currentStageIndex: u.currentStageIndex } }))
    );
}

/** Coordinators may manage any job; SPOCs only their own postings. */
function canManageJobPlacement(role: string | undefined, jobPostedById: string, userId: string | undefined): boolean {
    if (role === 'COORDINATOR') return true;
    return Boolean(userId && jobPostedById === userId);
}

function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** Consistent ordering when multiple stages share the same calendar day */
const STAGE_ORDER_BY = [{ scheduledDate: 'asc' as const }, { createdAt: 'asc' as const }];

const baseJobSchema = z.object({
    role: z.string().min(2),
    companyName: z.string().min(2),
    description: z.string().min(10),
    jobType: z.string().optional().default("Full-Time"),
    ctc: z.string().optional(),
    cgpaMin: z.coerce.number().optional().default(0),
    requiredProfileFields: z.string().optional(), // Expected stringified JSON array
    eligibleBranches: z.string().optional(),      // Expected stringified JSON array
    customQuestions: z.string().optional(),       // Expected stringified JSON array
    blockPlaced: z.coerce.boolean().optional().default(true),
    status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
    applicationDeadline: z.string().refine((date) => !isNaN(Date.parse(date)), { message: "Invalid date format" })
});

const createJobSchema = baseJobSchema.extend({
    status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional().default('DRAFT'),
}).refine(
    (data) => {
        const deadline = new Date(data.applicationDeadline);
        deadline.setHours(0, 0, 0, 0);
        return deadline > startOfToday();
    },
    { message: "Application deadline must be after today's date", path: ["applicationDeadline"] }
);

const updateJobSchema = baseJobSchema.refine(
    (data) => {
        const deadline = new Date(data.applicationDeadline);
        deadline.setHours(0, 0, 0, 0);
        return deadline > startOfToday();
    },
    { message: "Application deadline must be after today's date", path: ["applicationDeadline"] }
);

const safeJsonParse = (str?: string, defaultVal: any = []) => {
    try {
        return str ? JSON.parse(str) : defaultVal;
    } catch {
        return defaultVal;
    }
};

export const createJob = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const role = req.user?.role;

        // Ensure only verfied SPOCs can create jobs
        if (role === 'SPOC') {
            if (!req.user?.isVerified) {
                return res.status(403).json({ success: false, message: 'Forbidden. Your SPOC account must be verified by admin first.' });
            }
            if (!req.user?.permJobCreate) {
                return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to create jobs.' });
            }
        }

        const parsed = createJobSchema.safeParse(req.body);
        if (!parsed.success) {
            const firstMsg = parsed.error.errors[0]?.message || 'Invalid input';
            return res.status(400).json({ success: false, message: firstMsg, errors: parsed.error.issues });
        }

        const data = parsed.data;

        // Handle uploaded files
        let jdPath = undefined;
        let jnfPath = undefined;
        if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
            const files = req.files as Record<string, Express.Multer.File[]>;
            if (files['jd'] && files['jd'].length > 0) jdPath = `/uploads/${files['jd'][0].filename}`;
            if (files['jnf'] && files['jnf'].length > 0) jnfPath = `/uploads/${files['jnf'][0].filename}`;
        }

        const job = await prisma.job.create({
            data: {
                role: data.role,
                companyName: data.companyName,
                description: data.description,
                jobType: data.jobType,
                ctc: data.ctc,
                cgpaMin: data.cgpaMin,
                requiredProfileFields: data.requiredProfileFields || "[]",
                eligibleBranches: data.eligibleBranches || "[]",
                customQuestions: data.customQuestions || "[]",
                blockPlaced: data.blockPlaced,
                status: data.status,
                jdPath,
                jnfPath,
                applicationDeadline: new Date(data.applicationDeadline),
                postedById: userId
            }
        });

        res.status(201).json({ success: true, job });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to create job post' });
    }
};

export const listJobs = async (req: AuthRequest, res: Response) => {
    try {
        const role = req.user?.role;
        const userId = req.user?.id;
        const todayStart = startOfToday();

        const where: any = {};
        if (role === 'STUDENT') {
            where.applicationDeadline = { gte: todayStart };
            where.status = 'PUBLISHED';
        } else if (role === 'SPOC') {
            // SPOCs can only manage/view their own postings.
            where.postedById = userId;
        }

        const jobs = await prisma.job.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        const jobIds = jobs.map((j) => j.id);
        const applicationCounts = jobIds.length > 0
            ? await prisma.jobApplication.groupBy({
                by: ['jobId'],
                where: {
                    jobId: { in: jobIds },
                    status: { notIn: ['WITHDRAWN', 'REJECTED'] }
                },
                _count: { _all: true }
            })
            : [];
        const appCountByJobId = new Map(applicationCounts.map((row) => [row.jobId, row._count._all]));
        const jobsWithCounts = jobs.map((job) => ({
            ...job,
            _count: { applications: appCountByJobId.get(job.id) ?? 0 }
        }));
        const uniqueCompanyNames = [...new Set(
            jobsWithCounts
                .map((j) => (typeof j.companyName === 'string' ? j.companyName.trim() : ''))
                .filter((name) => name.length > 0)
        )];
        const normalizedKeys = [...new Set(uniqueCompanyNames.map((name) => normalizeCompanyName(name)).filter(Boolean))];
        const companyRows = normalizedKeys.length > 0
            ? await prisma.companyProfile.findMany({
                where: { normalizedName: { in: normalizedKeys } },
                select: {
                    companyName: true,
                    normalizedName: true,
                    rating: true,
                    reviewCount: true,
                    logoUrl: true,
                    highlyRatedFor: true,
                    criticallyRatedFor: true
                }
            })
            : [];
        const profileByNormalized = new Map(companyRows.map((r) => [r.normalizedName, r]));
        const profileByLowerName = new Map(companyRows.map((r) => [r.companyName.trim().toLowerCase(), r]));
        const jobsWithCompanyProfile = jobsWithCounts.map((job) => {
            const normalized = normalizeCompanyName(job.companyName || '');
            const byNorm = normalized ? profileByNormalized.get(normalized) : null;
            const byLower = profileByLowerName.get((job.companyName || '').trim().toLowerCase());
            const profile = byNorm || byLower || null;
            return {
                ...job,
                companyProfile: profile
                    ? {
                        found: true,
                        rating: profile.rating ?? null,
                        reviews: profile.reviewCount ?? null,
                        logoUrl: profile.logoUrl ?? null,
                        highlyRatedFor: profile.highlyRatedFor ?? [],
                        criticallyRatedFor: profile.criticallyRatedFor ?? []
                    }
                    : {
                        found: false,
                        rating: null,
                        reviews: null,
                        logoUrl: null,
                        highlyRatedFor: [],
                        criticallyRatedFor: []
                    }
            };
        });
        if (role === 'STUDENT') {
            console.log('[listJobs][student]', {
                userId: req.user?.id,
                filters: where,
                jobsReturned: jobs.length
            });
        }
        res.json({ success: true, jobs: jobsWithCompanyProfile });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
    }
};

export const getJob = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const role = req.user?.role;

        // Fetch fundamental job basic stats with stages unconditionally
        let queryArgs: any = {
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        };

        // If SPOC, densely populate the applications hook
        if (role === 'SPOC' || role === 'COORDINATOR') {
            queryArgs.include.applications = {
                where: {
                    status: { notIn: ['WITHDRAWN', 'REJECTED'] }
                },
                include: {
                    student: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            scholarNo: true,
                            branch: true,
                            isLocked: true,
                            lockedReason: true,
                            linkedin: true,
                            photoPath: true
                        }
                    }
                }
            };
        }

        const job = await prisma.job.findUnique(queryArgs);

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        const stagesOrdered = (job.stages || []).slice().sort(
            (a, b) =>
                startOfDay(new Date(a.scheduledDate)).getTime() - startOfDay(new Date(b.scheduledDate)).getTime() ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const rawStageTitles = await prisma.$queryRaw<Array<{ id: string; shortlistDocTitle: string | null }>>`
            SELECT id, "shortlistDocTitle"
            FROM "JobStage"
            WHERE "jobId" = ${id}
        `;
        const stageTitleById = new Map(rawStageTitles.map((r) => [r.id, r.shortlistDocTitle ?? null]));

        const timelineStages = stagesOrdered.map((s, i) => ({
            id: s.id,
            name: s.name,
            order: i + 1,
            scheduledDate: s.scheduledDate,
            status: s.status,
            shortlistDocPath: s.shortlistDocPath || null,
            shortlistDocTitle: stageTitleById.get(s.id) ?? null,
            notes: s.notes ?? null,
            attachmentPath: s.attachmentPath ?? null
        }));

        const groupedApplicants: Record<string, unknown[]> = {};
        stagesOrdered.forEach((s) => {
            groupedApplicants[s.id] = [];
        });

        const enrichApplication = (app: any) => {
            const n = stagesOrdered.length;
            if (n === 0) {
                return {
                    ...app,
                    currentStageId: null,
                    currentStageName: null,
                    currentStageOrder: null
                };
            }
            const rawIdx = app.currentStageIndex ?? 0;
            // Negative index = not assigned to any timeline stage (still an active applicant)
            if (rawIdx < 0) {
                return {
                    ...app,
                    currentStageIndex: -1,
                    currentStageId: null,
                    currentStageName: null,
                    currentStageOrder: null
                };
            }
            const idx = Math.min(rawIdx, n - 1);
            const st = stagesOrdered[idx];
            return {
                ...app,
                currentStageIndex: idx,
                currentStageId: st.id,
                currentStageName: st.name,
                currentStageOrder: idx + 1
            };
        };

        const rawApps = job.applications || [];
        const applicationsEnriched = rawApps.map(enrichApplication);
        for (const eapp of applicationsEnriched) {
            if (stagesOrdered.length > 0 && eapp.currentStageId) {
                const bucket = groupedApplicants[eapp.currentStageId];
                if (bucket) bucket.push(eapp);
            }
        }

        res.json({
            success: true,
            job: {
                ...job,
                applications: applicationsEnriched,
                timelineStages,
                groupedApplicants
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch job' });
    }
};

export const updateJob = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const role = req.user?.role;

        // Ownership verification
        const existingJob = await prisma.job.findUnique({ where: { id } });
        if (!existingJob) return res.status(404).json({ success: false, message: 'Job not found' });
        if (role !== 'COORDINATOR' && existingJob.postedById !== userId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not own this job posting.' });
        }

        const parsed = updateJobSchema.safeParse(req.body);
        if (!parsed.success) {
            const firstMsg = parsed.error.errors[0]?.message || 'Invalid input';
            return res.status(400).json({ success: false, message: firstMsg, errors: parsed.error.issues });
        }

        const data = parsed.data;

        // Handle uploaded files
        let jdPath = existingJob.jdPath;
        let jnfPath = existingJob.jnfPath;
        if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
            const files = req.files as Record<string, Express.Multer.File[]>;
            if (files['jd'] && files['jd'].length > 0) jdPath = `/uploads/${files['jd'][0].filename}`;
            if (files['jnf'] && files['jnf'].length > 0) jnfPath = `/uploads/${files['jnf'][0].filename}`;
        }

        const job = await prisma.job.update({
            where: { id },
            data: {
                role: data.role,
                companyName: data.companyName,
                description: data.description,
                jobType: data.jobType,
                ctc: data.ctc,
                cgpaMin: data.cgpaMin,
                requiredProfileFields: data.requiredProfileFields || "[]",
                eligibleBranches: data.eligibleBranches || "[]",
                customQuestions: data.customQuestions || "[]",
                blockPlaced: data.blockPlaced,
                status: data.status ?? existingJob.status,
                jdPath,
                jnfPath,
                applicationDeadline: new Date(data.applicationDeadline),
            }
        });

        res.json({ success: true, job });
    } catch (error: any) {
        console.error(error);
        if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Job not found' });
        res.status(500).json({ success: false, message: 'Failed to update job' });
    }
};

export const deleteJob = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const role = req.user?.role;

        // Ownership verification
        const existingJob = await prisma.job.findUnique({ where: { id } });
        if (!existingJob) return res.status(404).json({ success: false, message: 'Job not found' });
        if (role !== 'COORDINATOR' && existingJob.postedById !== userId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not own this job posting.' });
        }

        await prisma.job.delete({ where: { id } });
        res.json({ success: true, message: 'Job deleted securely' });
    } catch (error: any) {
        if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Job not found' });
        res.status(500).json({ success: false, message: 'Failed to delete job' });
    }
};

import { createObjectCsvStringifier } from 'csv-writer';

export const exportApplicantsCsv = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (req.user?.role === 'SPOC' && !req.user?.permExportCsv) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to export applicants.' });
        }

        const job = await prisma.job.findUnique({
            where: { id },
            include: {
                applications: {
                    where: {
                        status: { notIn: ['WITHDRAWN', 'REJECTED'] }
                    },
                    include: {
                        student: {
                            include: {
                                user: { select: { email: true } }
                            }
                        },
                        resume: { select: { fileUrl: true } }
                    }
                }
            }
        });

        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const FIELDS = [
            { id: 'Name', title: 'Name' },
            { id: 'Scholar Number', title: 'Scholar Number' },
            { id: 'Branch', title: 'Branch' },
            { id: 'Course', title: 'Course' },
            { id: 'CGPA', title: 'CGPA' },
            { id: 'Email', title: 'Email' },
            { id: 'Phone', title: 'Phone' },
            { id: 'Placement Status', title: 'Placement Status' },
            { id: 'Application Status', title: 'Application Status' },
            { id: 'ATS Score', title: 'ATS Score' },
            { id: 'Resume Url', title: 'Resume Url' }
        ];

        const records = job.applications.map(app => {
            const stu = app.student as any;
            const email = stu?.user?.email ?? '';
            return {
                'Name': `${stu.firstName || ''} ${stu.lastName || ''}`.trim(),
                'Scholar Number': stu.scholarNo ?? '',
                'Branch': stu.branch ?? '',
                'Course': stu.course ?? '',
                'CGPA': stu.cgpa ?? '',
                'Email': email,
                'Phone': stu.phone ?? '',
                'Placement Status': stu.isLocked ? 'Placed' : 'Not Placed',
                'Application Status': app.status ?? '',
                'ATS Score': app.atsScore ?? '',
                'Resume Url': app.resume?.fileUrl ?? ''
            };
        });

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'No applicants found' });
        }

        const csvStringifier = createObjectCsvStringifier({ header: FIELDS });
        const csvString = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="applicants-${job.id}.csv"`);
        res.send(csvString);
    } catch (error) {
        console.error("Export applicants error:", error);
        res.status(500).json({ success: false, message: 'Failed to export applicants test' });
    }
};

// Student read-only job details (used by JobBoard "View Details" modal)
export const getStudentJobDetails = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const now = new Date();

        const job = await prisma.job.findUnique({
            where: { id },
            include: {
                stages: { orderBy: STAGE_ORDER_BY },
            },
        });

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Only show jobs that are effectively available to students
        if (job.status !== 'PUBLISHED' || (job.applicationDeadline && now > job.applicationDeadline)) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        const applicantsCount = await prisma.jobApplication.count({
            where: {
                jobId: job.id,
                status: { not: 'WITHDRAWN' }
            },
        });

        const safeJsonArray = (val: any): any[] => {
            if (Array.isArray(val)) return val;
            if (typeof val !== 'string') return [];
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        };

        res.json({
            success: true,
            job: {
                id: job.id,
                role: job.role,
                companyName: job.companyName,
                description: job.description,
                jobType: job.jobType,
                ctc: job.ctc,
                cgpaMin: job.cgpaMin,
                eligibleBranches: safeJsonArray(job.eligibleBranches),
                requiredProfileFields: safeJsonArray(job.requiredProfileFields),
                customQuestions: safeJsonArray(job.customQuestions),
                applicationDeadline: job.applicationDeadline?.toISOString?.() ? job.applicationDeadline.toISOString() : job.applicationDeadline,
                stages: job.stages,
                // Location isn't currently a persisted Job field in the schema; keep UI fallback.
                location: null,
            },
            applicantsCount,
        });
    } catch (error) {
        console.error('[getStudentJobDetails] error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch job details' });
    }
};

import { enqueueAndSend, sendPlacementResultEmailWebhook, sendWhatsApp } from '../services/notification.service';
import { createAnnouncement } from '../services/announcement.service';
import { publishLinkedInAnnouncement } from '../services/linkedin.service';

export const addOrUpdateStage = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { name: rawName, scheduledDate, status } = req.body;
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        const notesRaw = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
        const notes = notesRaw.length > 0 ? notesRaw.slice(0, 8000) : null;
        const attachmentPath = req.file ? `/uploads/${req.file.filename}` : null;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Stage name is required' });
        }
        if (!scheduledDate) {
            return res.status(400).json({ success: false, message: 'Scheduled date is required' });
        }

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const stageDate = new Date(scheduledDate);
        const stageDay = startOfDay(stageDate);
        const deadlineDay = startOfDay(new Date(job.applicationDeadline));
        const todayDay = startOfToday();

        if (stageDay.getTime() < todayDay.getTime()) {
            return res.status(400).json({
                success: false,
                message: 'Stage scheduled date must be today or later'
            });
        }
        if (stageDay.getTime() <= deadlineDay.getTime()) {
            return res.status(400).json({
                success: false,
                message: 'Stage date must be after the application deadline'
            });
        }

        const oldStagesOrdered = [...(job.stages || [])].sort(
            (a, b) =>
                startOfDay(new Date(a.scheduledDate)).getTime() - startOfDay(new Date(b.scheduledDate)).getTime() ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        const stage = await prisma.jobStage.create({
            data: {
                jobId: job.id,
                name,
                scheduledDate: new Date(scheduledDate),
                status: status || 'PENDING',
                notes,
                attachmentPath
            }
        });

        const jobAfter = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        const newStagesOrdered = [...(jobAfter?.stages || [])].sort(
            (a, b) =>
                startOfDay(new Date(a.scheduledDate)).getTime() - startOfDay(new Date(b.scheduledDate)).getTime() ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        await remapApplicationsAfterStageOrderChange(id, oldStagesOrdered, newStagesOrdered);

        // Broadcast to all applicants
        const students = await prisma.jobApplication.findMany({
            where: { jobId: job.id },
            select: { student: { select: { userId: true } } }
        });

        students.forEach(s => {
            enqueueAndSend(s.student.userId, 'APPLICATION_STATUS_CHANGED', `New stage added for ${job.companyName}: ${name} on ${new Date(scheduledDate).toLocaleDateString()}`);

            // WhatsApp Zapier trigger
            sendWhatsApp(s.student.userId, job.id, 'OA_SCHEDULED', {
                company_name: job.companyName,
                role: job.role,
                date: new Date(scheduledDate).toLocaleDateString('en-IN')
            }).catch(() => { });
        });

        res.json({ success: true, stage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to add stage' });
    }
};

export const updateJobStage = async (req: AuthRequest, res: Response) => {
    try {
        const { id, stageId } = req.params;
        const userId = req.user?.id;

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const oldStagesOrdered = [...(job.stages || [])].sort(
            (a, b) =>
                startOfDay(new Date(a.scheduledDate)).getTime() - startOfDay(new Date(b.scheduledDate)).getTime() ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const stageIdx = oldStagesOrdered.findIndex((s) => s.id === stageId);
        if (stageIdx === -1) {
            return res.status(404).json({ success: false, message: 'Stage not found for this job' });
        }
        const existing = oldStagesOrdered[stageIdx];

        const rawName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const name = rawName || existing.name;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Stage name is required' });
        }

        const scheduledDateRaw = req.body.scheduledDate;
        if (scheduledDateRaw == null || scheduledDateRaw === '') {
            return res.status(400).json({ success: false, message: 'Scheduled date is required' });
        }
        const stageDate = new Date(scheduledDateRaw);
        const stageDay = startOfDay(stageDate);
        const deadlineDay = startOfDay(new Date(job.applicationDeadline));
        const todayDay = startOfToday();
        const existingDay = startOfDay(new Date(existing.scheduledDate));
        const dateChanged = stageDay.getTime() !== existingDay.getTime();

        if (dateChanged) {
            if (stageDay.getTime() < todayDay.getTime()) {
                return res.status(400).json({
                    success: false,
                    message: 'Stage scheduled date must be today or later'
                });
            }
            if (stageDay.getTime() <= deadlineDay.getTime()) {
                return res.status(400).json({
                    success: false,
                    message: 'Stage date must be after the application deadline'
                });
            }
        }

        const notesRaw = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
        const notes = notesRaw.length > 0 ? notesRaw.slice(0, 8000) : null;

        const status =
            typeof req.body.status === 'string' && req.body.status.trim()
                ? req.body.status.trim()
                : existing.status || 'PENDING';

        const clearAttachment =
            req.body.clearAttachment === 'true' ||
            req.body.clearAttachment === '1' ||
            req.body.clearAttachment === true;

        const data: Record<string, unknown> = {
            name,
            scheduledDate: stageDate,
            status,
            notes
        };

        if (clearAttachment) {
            data.attachmentPath = null;
            if (existing.attachmentPath) unlinkUploadRelative(existing.attachmentPath);
        } else if (req.file) {
            data.attachmentPath = `/uploads/${req.file.filename}`;
            if (existing.attachmentPath) unlinkUploadRelative(existing.attachmentPath);
        }

        const updated = await prisma.jobStage.update({
            where: { id: stageId },
            data
        });

        const jobAfter = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        const newStagesOrdered = [...(jobAfter?.stages || [])].sort(
            (a, b) =>
                startOfDay(new Date(a.scheduledDate)).getTime() - startOfDay(new Date(b.scheduledDate)).getTime() ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        await remapApplicationsAfterStageOrderChange(id, oldStagesOrdered, newStagesOrdered);

        return res.json({ success: true, stage: updated });
    } catch (error) {
        console.error('[updateJobStage]', error);
        return res.status(500).json({ success: false, message: 'Failed to update stage' });
    }
};

export const deleteJobStage = async (req: AuthRequest, res: Response) => {
    try {
        const { id, stageId } = req.params;
        const userId = req.user?.id;

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const oldStagesOrdered = [...(job.stages || [])].sort(
            (a, b) =>
                startOfDay(new Date(a.scheduledDate)).getTime() - startOfDay(new Date(b.scheduledDate)).getTime() ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const deletedIndex = oldStagesOrdered.findIndex((s) => s.id === stageId);
        if (deletedIndex === -1) {
            return res.status(404).json({ success: false, message: 'Stage not found for this job' });
        }

        const toDelete = oldStagesOrdered[deletedIndex];
        if (toDelete.attachmentPath) unlinkUploadRelative(toDelete.attachmentPath);
        if (toDelete.shortlistDocPath) unlinkUploadRelative(toDelete.shortlistDocPath);

        await prisma.jobStage.delete({ where: { id: stageId } });

        const newStagesOrdered = await prisma.jobStage.findMany({
            where: { jobId: id },
            orderBy: STAGE_ORDER_BY
        });

        await remapApplicationsAfterStageDelete(id, deletedIndex, oldStagesOrdered.length, newStagesOrdered);

        return res.json({ success: true, message: 'Stage removed' });
    } catch (error) {
        console.error('[deleteJobStage]', error);
        return res.status(500).json({ success: false, message: 'Failed to delete stage' });
    }
};

export const uploadStageShortlistDoc = async (req: AuthRequest, res: Response) => {
    try {
        const { id, stageId } = req.params;
        const userId = req.user?.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'Please upload a PDF or image file' });
        }

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const stage = await prisma.jobStage.findFirst({
            where: { id: stageId, jobId: id }
        });
        if (!stage) return res.status(404).json({ success: false, message: 'Stage not found for this job' });

        if (stage.shortlistDocPath) unlinkUploadRelative(stage.shortlistDocPath);

        const docPath = `/uploads/${file.filename}`;
        const shortlistDocTitle = normalizeShortlistDocTitle(req.body?.shortlistDocTitle);
        const updatedStage = await prisma.jobStage.update({
            where: { id: stage.id },
            data: { shortlistDocPath: docPath }
        });
        await prisma.$executeRaw`
            UPDATE "JobStage"
            SET "shortlistDocTitle" = ${shortlistDocTitle}
            WHERE id = ${stage.id}
        `;

        return res.json({ success: true, stage: updatedStage, shortlistDocPath: docPath, shortlistDocTitle });
    } catch (error) {
        console.error('[uploadStageShortlistDoc] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to upload shortlist document' });
    }
};

export const deleteStageShortlistDoc = async (req: AuthRequest, res: Response) => {
    try {
        const { id, stageId } = req.params;
        const userId = req.user?.id;

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const stage = await prisma.jobStage.findFirst({
            where: { id: stageId, jobId: id }
        });
        if (!stage) return res.status(404).json({ success: false, message: 'Stage not found for this job' });

        if (stage.shortlistDocPath) unlinkUploadRelative(stage.shortlistDocPath);

        const updatedStage = await prisma.jobStage.update({
            where: { id: stage.id },
            data: { shortlistDocPath: null }
        });
        await prisma.$executeRaw`
            UPDATE "JobStage"
            SET "shortlistDocTitle" = NULL
            WHERE id = ${stage.id}
        `;

        return res.json({ success: true, stage: updatedStage });
    } catch (error) {
        console.error('[deleteStageShortlistDoc] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to remove shortlist document' });
    }
};

export const uploadStageShortlistAndMap = async (req: AuthRequest, res: Response) => {
    try {
        const { id, stageId } = req.params;
        const userId = req.user?.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'Please upload a CSV/TXT shortlist file' });
        }

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const stageIndex = (job.stages || []).findIndex((s: any) => s.id === stageId);
        if (stageIndex < 0) {
            return res.status(404).json({ success: false, message: 'Stage not found for this job' });
        }

        const rawText = file.buffer
            ? file.buffer.toString('utf8')
            : require('fs').readFileSync(file.path, 'utf8');
        const identifiers = Array.from(
            new Set(
                rawText
                    .split(/\r?\n/)
                    .flatMap((line) => line.split(/[,\t;|]/g))
                    .map((v) => String(v || '').trim().toLowerCase())
                    .filter(Boolean)
            )
        );

        if (identifiers.length === 0) {
            return res.status(400).json({ success: false, message: 'Shortlist file is empty or unreadable' });
        }

        const apps = await prisma.jobApplication.findMany({
            where: {
                jobId: id,
                status: { notIn: ['WITHDRAWN', 'REJECTED'] }
            },
            select: {
                id: true,
                status: true,
                student: {
                    select: {
                        id: true,
                        scholarNo: true,
                        user: { select: { email: true } }
                    }
                }
            }
        });

        const matchedAppIds: string[] = [];
        const matchedTokens = new Set<string>();
        for (const app of apps) {
            const scholar = String(app.student.scholarNo || '').trim().toLowerCase();
            const email = String(app.student.user?.email || '').trim().toLowerCase();
            if (
                identifiers.includes(scholar) ||
                (email && identifiers.includes(email))
            ) {
                matchedAppIds.push(app.id);
                if (scholar) matchedTokens.add(scholar);
                if (email) matchedTokens.add(email);
            }
        }

        if (matchedAppIds.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No shortlisted identifiers matched applicants for this job'
            });
        }

        const result = await prisma.jobApplication.updateMany({
            where: {
                id: { in: matchedAppIds },
                status: { not: 'PLACED' }
            },
            data: { currentStageIndex: stageIndex }
        });

        const shortlistDocPath = `/uploads/${file.filename}`;
        await prisma.jobStage.update({
            where: { id: stageId },
            data: { shortlistDocPath }
        });

        const unmatchedIdentifiers = identifiers.filter((token) => !matchedTokens.has(token));
        return res.json({
            success: true,
            movedCount: result.count,
            stageId,
            stageIndex,
            shortlistDocPath,
            unmatchedIdentifiers
        });
    } catch (error) {
        console.error('[uploadStageShortlistAndMap] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to process shortlist upload' });
    }
};

export const advanceStage = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { selectedIds, nextStageIndex } = req.body;

        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return res.status(400).json({ success: false, message: 'selectedIds must be a non-empty array' });
        }

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!job.stages || job.stages.length === 0) {
            return res.status(400).json({ success: false, message: 'No stages found for this job' });
        }

        const uniqueSelectedIds = [...new Set(selectedIds)];
        const selectedApplications = await prisma.jobApplication.findMany({
            where: {
                jobId: id,
                studentId: { in: uniqueSelectedIds }
            },
            select: {
                id: true,
                studentId: true,
                currentStageIndex: true,
                status: true,
                student: { select: { userId: true } }
            }
        });

        if (selectedApplications.length !== uniqueSelectedIds.length) {
            return res.status(404).json({ success: false, message: 'One or more selected students do not have applications for this job' });
        }

        const currentStageSet = new Set(selectedApplications.map((app) => app.currentStageIndex ?? 0));
        if (currentStageSet.size !== 1) {
            return res.status(400).json({ success: false, message: 'Selected students must be in the same current stage' });
        }

        if (selectedApplications.some((app) => app.status === 'PLACED')) {
            return res.status(400).json({ success: false, message: 'Placed students cannot be moved to another stage' });
        }

        const currentStageIndex = selectedApplications[0].currentStageIndex ?? 0;
        const expectedNextStageIndex = currentStageIndex + 1;
        if (typeof nextStageIndex === 'number' && nextStageIndex !== expectedNextStageIndex) {
            return res.status(400).json({ success: false, message: `Invalid nextStageIndex. Expected ${expectedNextStageIndex}` });
        }
        if (expectedNextStageIndex >= job.stages.length) {
            return res.status(400).json({ success: false, message: 'Students are already at the final stage. Use declare placed.' });
        }

        const appIds = selectedApplications.map((app) => app.id);
        const updateResult = await prisma.jobApplication.updateMany({
            where: {
                id: { in: appIds },
                currentStageIndex
            },
            data: {
                currentStageIndex: expectedNextStageIndex
            }
        });

        if (updateResult.count !== selectedApplications.length) {
            return res.status(409).json({ success: false, message: 'Stage transition conflict detected. Please refresh and try again.' });
        }

        const nextStage = job.stages[expectedNextStageIndex];
        await prisma.notification.createMany({
            data: selectedApplications.map((app) => ({
                userId: app.student.userId,
                type: 'STAGE_UPDATE',
                status: 'PENDING',
                message: `You have been moved to the ${nextStage.name} round at ${job.companyName}`
            }))
        });

        return res.json({
            success: true,
            movedCount: updateResult.count,
            nextStage: {
                index: expectedNextStageIndex,
                name: nextStage.name
            }
        });
    } catch (error) {
        console.error('[advanceStage] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to move students to next stage' });
    }
};

export const regressStage = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { selectedIds, prevStageIndex } = req.body;

        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return res.status(400).json({ success: false, message: 'selectedIds must be a non-empty array' });
        }

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!job.stages || job.stages.length === 0) {
            return res.status(400).json({ success: false, message: 'No stages found for this job' });
        }

        const uniqueSelectedIds = [...new Set(selectedIds)];
        const selectedApplications = await prisma.jobApplication.findMany({
            where: {
                jobId: id,
                studentId: { in: uniqueSelectedIds }
            },
            select: {
                id: true,
                studentId: true,
                currentStageIndex: true,
                status: true,
                student: { select: { userId: true } }
            }
        });

        if (selectedApplications.length !== uniqueSelectedIds.length) {
            return res.status(404).json({ success: false, message: 'One or more selected students do not have applications for this job' });
        }

        const currentStageSet = new Set(selectedApplications.map((app) => app.currentStageIndex ?? 0));
        if (currentStageSet.size !== 1) {
            return res.status(400).json({ success: false, message: 'Selected students must be in the same current stage' });
        }

        if (selectedApplications.some((app) => app.status === 'PLACED')) {
            return res.status(400).json({ success: false, message: 'Placed students cannot be moved to another stage' });
        }

        const currentStageIndex = selectedApplications[0].currentStageIndex ?? 0;
        const expectedPrevStageIndex = currentStageIndex - 1;
        if (typeof prevStageIndex === 'number' && prevStageIndex !== expectedPrevStageIndex) {
            return res.status(400).json({ success: false, message: `Invalid prevStageIndex. Expected ${expectedPrevStageIndex}` });
        }
        if (expectedPrevStageIndex < -1) {
            return res.status(400).json({ success: false, message: 'Invalid stage transition' });
        }

        const appIds = selectedApplications.map((app) => app.id);
        const updateResult = await prisma.jobApplication.updateMany({
            where: {
                id: { in: appIds },
                currentStageIndex
            },
            data: {
                currentStageIndex: expectedPrevStageIndex
            }
        });

        if (updateResult.count !== selectedApplications.length) {
            return res.status(409).json({ success: false, message: 'Stage transition conflict detected. Please refresh and try again.' });
        }

        if (expectedPrevStageIndex >= 0) {
            const prevStage = job.stages[expectedPrevStageIndex];
            await prisma.notification.createMany({
                data: selectedApplications.map((app) => ({
                    userId: app.student.userId,
                    type: 'STAGE_UPDATE',
                    status: 'PENDING',
                    message: `You have been moved back to ${prevStage.name} at ${job.companyName}`
                }))
            });
        } else {
            await prisma.notification.createMany({
                data: selectedApplications.map((app) => ({
                    userId: app.student.userId,
                    type: 'STAGE_UPDATE',
                    status: 'PENDING',
                    message: `You have been unassigned from the active timeline stages for ${job.role} at ${job.companyName}. You remain an applicant for this role.`
                }))
            });
        }

        return res.json({
            success: true,
            movedCount: updateResult.count,
            prevStage:
                expectedPrevStageIndex >= 0
                    ? {
                          index: expectedPrevStageIndex,
                          name: job.stages[expectedPrevStageIndex].name
                      }
                    : { index: -1, name: null }
        });
    } catch (error) {
        console.error('[regressStage] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to move students to previous stage' });
    }
};

export const dropApplicants = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { studentIds } = req.body;

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'studentIds must be a non-empty array' });
        }

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const uniqueIds = [...new Set(studentIds)];
        const apps = await prisma.jobApplication.findMany({
            where: { jobId: id, studentId: { in: uniqueIds } },
            select: { id: true, status: true, studentId: true, student: { select: { userId: true } } }
        });

        if (apps.length !== uniqueIds.length) {
            return res.status(404).json({ success: false, message: 'One or more students do not have an application for this job' });
        }

        if (apps.some((a) => a.status === 'PLACED')) {
            return res.status(400).json({ success: false, message: 'Placed students cannot be removed from timeline stages' });
        }

        // Remove from timeline stages only; application stays active (still listed as an applicant).
        const result = await prisma.jobApplication.updateMany({
            where: {
                jobId: id,
                studentId: { in: uniqueIds },
                status: { not: 'PLACED' }
            },
            data: { currentStageIndex: -1 }
        });

        await prisma.notification.createMany({
            data: apps.map((app) => ({
                userId: app.student.userId,
                type: 'STAGE_UPDATE',
                status: 'PENDING',
                message: `You have been unassigned from the active timeline stages for ${job.role} at ${job.companyName}. You remain an applicant for this role.`
            }))
        });

        return res.json({ success: true, updatedCount: result.count });
    } catch (error) {
        console.error('[dropApplicants] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to drop applicants' });
    }
};

export const declareResults = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { placedStudentIds } = req.body;

        if (!Array.isArray(placedStudentIds) || placedStudentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'placedStudentIds must be a non-empty array' });
        }

        const job = await prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: STAGE_ORDER_BY } }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement(req.user?.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!job.stages || job.stages.length === 0) {
            return res.status(400).json({ success: false, message: 'Cannot declare placement without configured stages' });
        }

        const uniqueStudentIds = [...new Set(placedStudentIds)];
        const selectedApplications = await prisma.jobApplication.findMany({
            where: { jobId: id, studentId: { in: uniqueStudentIds } },
            select: {
                id: true,
                studentId: true,
                currentStageIndex: true,
                status: true,
                student: {
                    select: {
                        userId: true,
                        firstName: true,
                        lastName: true,
                        branch: true,
                        linkedin: true,
                        user: { select: { email: true } }
                    }
                }
            }
        });

        if (selectedApplications.length !== uniqueStudentIds.length) {
            return res.status(404).json({ success: false, message: 'One or more selected students do not have applications for this job' });
        }

        const alreadyPlaced = selectedApplications.filter((app) => app.status === 'PLACED');
        if (alreadyPlaced.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'One or more selected students are already declared placed for this job'
            });
        }

        const placementYear = new Date().getFullYear();
        const finalStageIndex = Math.max(0, (job.stages?.length || 1) - 1);
        await prisma.$transaction(async (tx) => {
            await tx.jobApplication.updateMany({
                where: { id: { in: selectedApplications.map((app) => app.id) } },
                data: {
                    status: 'PLACED',
                    currentStageIndex: finalStageIndex,
                }
            });

            await tx.student.updateMany({
                where: { id: { in: uniqueStudentIds } },
                data: {
                    isLocked: true,
                    lockedReason: `Placed at ${job.companyName} for ${job.role}`,
                    placementType: 'ON_CAMPUS'
                }
            });

            await tx.profileLock.updateMany({
                where: { studentId: { in: uniqueStudentIds }, isActive: true },
                data: { isActive: false }
            });
            await tx.profileLock.createMany({
                data: uniqueStudentIds.map((studentId) => ({
                    studentId,
                    profileLocked: true,
                    lockedById: userId || '',
                    reason: `Automatically locked by placement at ${job.companyName}`,
                    isActive: true
                }))
            });

            await tx.placementRecord.deleteMany({
                where: { jobId: job.id, studentId: { in: uniqueStudentIds } }
            });
            await tx.placementRecord.createMany({
                data: uniqueStudentIds.map((studentId) => ({
                    studentId,
                    jobId: job.id,
                    companyName: job.companyName,
                    role: job.role,
                    ctc: job.ctc || '',
                    placementMode: job.placementMode,
                    createdBySpocId: userId || ''
                }))
            });

            await tx.notification.createMany({
                data: selectedApplications.map((app) => ({
                    userId: app.student.userId,
                    type: 'RESULT_DECLARED',
                    status: 'PENDING',
                    message: `Congratulations! You have been placed at ${job.companyName} for the role of ${job.role}.`
                }))
            });

            await tx.alumni.deleteMany({
                where: { studentId: { in: uniqueStudentIds }, companyName: job.companyName }
            });
            await tx.alumni.createMany({
                data: selectedApplications.map((app) => ({
                    studentId: app.studentId,
                    userId: app.student.userId,
                    name: `${app.student.firstName} ${app.student.lastName}`.trim(),
                    branch: app.student.branch || 'Unknown',
                    role: job.role,
                    ctc: job.ctc || '',
                    placementYear,
                    linkedinUrl: app.student.linkedin || null,
                    companyName: job.companyName
                }))
            });
        });

        // WhatsApp automation (Zapier/Twilio webhook):
        // fire per newly placed student, similar to LinkedIn publish workflow.
        await Promise.allSettled(
            selectedApplications.map((app) =>
                sendWhatsApp(app.student.userId, job.id, 'PLACED_STUDENT_CONGRATS', {
                    company_name: job.companyName,
                    role: job.role,
                    status: 'PLACED'
                })
            )
        );

        // Email automation webhook payload for Zapier (placement result emails).
        await Promise.allSettled(
            selectedApplications.map((app) =>
                sendPlacementResultEmailWebhook({
                    userId: app.student.userId,
                    jobId: job.id,
                    studentEmail: String(app.student.user?.email || ''),
                    studentName: `${app.student.firstName} ${app.student.lastName}`.trim(),
                    companyName: job.companyName,
                    role: job.role,
                    ctc: job.ctc || 'N/A',
                    status: 'PLACED',
                    placementYear
                })
            )
        );

        res.json({ success: true, message: 'Placed students declared successfully', placedCount: uniqueStudentIds.length });
    } catch (error) {
        console.error('[declareResults] error:', error);
        res.status(500).json({ success: false, message: 'Failed to declare placed' });
    }
};
