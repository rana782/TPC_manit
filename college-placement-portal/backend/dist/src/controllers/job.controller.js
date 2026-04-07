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
exports.declareResults = exports.advanceStage = exports.addOrUpdateStage = exports.getStudentJobDetails = exports.exportApplicantsCsv = exports.deleteJob = exports.updateJob = exports.getJob = exports.listJobs = exports.createJob = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
/** Coordinators may manage any job; SPOCs only their own postings. */
function canManageJobPlacement(role, jobPostedById, userId) {
    if (role === 'COORDINATOR')
        return true;
    return Boolean(userId && jobPostedById === userId);
}
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
const baseJobSchema = zod_1.z.object({
    role: zod_1.z.string().min(2),
    companyName: zod_1.z.string().min(2),
    description: zod_1.z.string().min(10),
    jobType: zod_1.z.string().optional().default("Full-Time"),
    ctc: zod_1.z.string().optional(),
    cgpaMin: zod_1.z.coerce.number().optional().default(0),
    requiredProfileFields: zod_1.z.string().optional(), // Expected stringified JSON array
    eligibleBranches: zod_1.z.string().optional(), // Expected stringified JSON array
    customQuestions: zod_1.z.string().optional(), // Expected stringified JSON array
    blockPlaced: zod_1.z.coerce.boolean().optional().default(true),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
    applicationDeadline: zod_1.z.string().refine((date) => !isNaN(Date.parse(date)), { message: "Invalid date format" })
});
const createJobSchema = baseJobSchema.extend({
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional().default('DRAFT'),
}).refine((data) => {
    const deadline = new Date(data.applicationDeadline);
    deadline.setHours(0, 0, 0, 0);
    return deadline > startOfToday();
}, { message: "Application deadline must be after today's date", path: ["applicationDeadline"] });
const updateJobSchema = baseJobSchema.refine((data) => {
    const deadline = new Date(data.applicationDeadline);
    deadline.setHours(0, 0, 0, 0);
    return deadline > startOfToday();
}, { message: "Application deadline must be after today's date", path: ["applicationDeadline"] });
const safeJsonParse = (str, defaultVal = []) => {
    try {
        return str ? JSON.parse(str) : defaultVal;
    }
    catch (_a) {
        return defaultVal;
    }
};
const createJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        // Ensure only verfied SPOCs can create jobs
        if (role === 'SPOC') {
            if (!((_c = req.user) === null || _c === void 0 ? void 0 : _c.isVerified)) {
                return res.status(403).json({ success: false, message: 'Forbidden. Your SPOC account must be verified by admin first.' });
            }
            if (!((_d = req.user) === null || _d === void 0 ? void 0 : _d.permJobCreate)) {
                return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to create jobs.' });
            }
        }
        const parsed = createJobSchema.safeParse(req.body);
        if (!parsed.success) {
            const firstMsg = ((_e = parsed.error.errors[0]) === null || _e === void 0 ? void 0 : _e.message) || 'Invalid input';
            return res.status(400).json({ success: false, message: firstMsg, errors: parsed.error.issues });
        }
        const data = parsed.data;
        // Handle uploaded files
        let jdPath = undefined;
        let jnfPath = undefined;
        if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
            const files = req.files;
            if (files['jd'] && files['jd'].length > 0)
                jdPath = `/uploads/${files['jd'][0].filename}`;
            if (files['jnf'] && files['jnf'].length > 0)
                jnfPath = `/uploads/${files['jnf'][0].filename}`;
        }
        const job = yield prisma.job.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to create job post' });
    }
});
exports.createJob = createJob;
const listJobs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const todayStart = startOfToday();
        const where = {};
        if (role === 'STUDENT') {
            where.applicationDeadline = { gte: todayStart };
            where.status = 'PUBLISHED';
        }
        const jobs = yield prisma.job.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: {
                        applications: {
                            where: {
                                status: { not: 'WITHDRAWN' }
                            }
                        }
                    }
                }
            }
        });
        if (role === 'STUDENT') {
            console.log('[listJobs][student]', {
                userId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.id,
                filters: where,
                jobsReturned: jobs.length
            });
        }
        res.json({ success: true, jobs });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
    }
});
exports.listJobs = listJobs;
const getJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        // Fetch fundamental job basic stats with stages unconditionally
        let queryArgs = {
            where: { id },
            include: { stages: { orderBy: { scheduledDate: 'asc' } } }
        };
        // If SPOC, densely populate the applications hook
        if (role === 'SPOC' || role === 'COORDINATOR') {
            queryArgs.include.applications = {
                where: {
                    status: { not: 'WITHDRAWN' }
                },
                include: {
                    student: {
                        select: { id: true, firstName: true, lastName: true, scholarNo: true, isLocked: true, lockedReason: true }
                    }
                }
            };
        }
        const job = yield prisma.job.findUnique(queryArgs);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        const stagesOrdered = (job.stages || []).slice().sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
        const timelineStages = stagesOrdered.map((s, i) => ({
            id: s.id,
            name: s.name,
            order: i + 1,
            scheduledDate: s.scheduledDate,
            status: s.status
        }));
        const groupedApplicants = {};
        stagesOrdered.forEach((s) => {
            groupedApplicants[s.id] = [];
        });
        const enrichApplication = (app) => {
            var _a;
            const n = stagesOrdered.length;
            if (n === 0) {
                return Object.assign(Object.assign({}, app), { currentStageId: null, currentStageName: null, currentStageOrder: null });
            }
            let idx = (_a = app.currentStageIndex) !== null && _a !== void 0 ? _a : 0;
            idx = Math.max(0, Math.min(idx, n - 1));
            const st = stagesOrdered[idx];
            return Object.assign(Object.assign({}, app), { currentStageIndex: idx, currentStageId: st.id, currentStageName: st.name, currentStageOrder: idx + 1 });
        };
        const rawApps = job.applications || [];
        const applicationsEnriched = rawApps.map(enrichApplication);
        for (const eapp of applicationsEnriched) {
            if (stagesOrdered.length > 0 && eapp.currentStageId) {
                const bucket = groupedApplicants[eapp.currentStageId];
                if (bucket)
                    bucket.push(eapp);
            }
        }
        res.json({
            success: true,
            job: Object.assign(Object.assign({}, job), { applications: applicationsEnriched, timelineStages,
                groupedApplicants })
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch job' });
    }
});
exports.getJob = getJob;
const updateJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        // Ownership verification
        const existingJob = yield prisma.job.findUnique({ where: { id } });
        if (!existingJob)
            return res.status(404).json({ success: false, message: 'Job not found' });
        if (role !== 'COORDINATOR' && existingJob.postedById !== userId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not own this job posting.' });
        }
        const parsed = updateJobSchema.safeParse(req.body);
        if (!parsed.success) {
            const firstMsg = ((_c = parsed.error.errors[0]) === null || _c === void 0 ? void 0 : _c.message) || 'Invalid input';
            return res.status(400).json({ success: false, message: firstMsg, errors: parsed.error.issues });
        }
        const data = parsed.data;
        // Handle uploaded files
        let jdPath = existingJob.jdPath;
        let jnfPath = existingJob.jnfPath;
        if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
            const files = req.files;
            if (files['jd'] && files['jd'].length > 0)
                jdPath = `/uploads/${files['jd'][0].filename}`;
            if (files['jnf'] && files['jnf'].length > 0)
                jnfPath = `/uploads/${files['jnf'][0].filename}`;
        }
        const job = yield prisma.job.update({
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
                status: (_d = data.status) !== null && _d !== void 0 ? _d : existingJob.status,
                jdPath,
                jnfPath,
                applicationDeadline: new Date(data.applicationDeadline),
            }
        });
        res.json({ success: true, job });
    }
    catch (error) {
        console.error(error);
        if (error.code === 'P2025')
            return res.status(404).json({ success: false, message: 'Job not found' });
        res.status(500).json({ success: false, message: 'Failed to update job' });
    }
});
exports.updateJob = updateJob;
const deleteJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        // Ownership verification
        const existingJob = yield prisma.job.findUnique({ where: { id } });
        if (!existingJob)
            return res.status(404).json({ success: false, message: 'Job not found' });
        if (role !== 'COORDINATOR' && existingJob.postedById !== userId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not own this job posting.' });
        }
        yield prisma.job.delete({ where: { id } });
        res.json({ success: true, message: 'Job deleted securely' });
    }
    catch (error) {
        if (error.code === 'P2025')
            return res.status(404).json({ success: false, message: 'Job not found' });
        res.status(500).json({ success: false, message: 'Failed to delete job' });
    }
});
exports.deleteJob = deleteJob;
const csv_writer_1 = require("csv-writer");
const exportApplicantsCsv = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'SPOC' && !((_c = req.user) === null || _c === void 0 ? void 0 : _c.permExportCsv)) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to export applicants.' });
        }
        const job = yield prisma.job.findUnique({
            where: { id },
            include: {
                applications: {
                    where: {
                        status: { not: 'WITHDRAWN' }
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
        if (!job)
            return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement((_d = req.user) === null || _d === void 0 ? void 0 : _d.role, job.postedById, userId)) {
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
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
            const stu = app.student;
            const email = (_b = (_a = stu === null || stu === void 0 ? void 0 : stu.user) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : '';
            return {
                'Name': `${stu.firstName || ''} ${stu.lastName || ''}`.trim(),
                'Scholar Number': (_c = stu.scholarNo) !== null && _c !== void 0 ? _c : '',
                'Branch': (_d = stu.branch) !== null && _d !== void 0 ? _d : '',
                'Course': (_e = stu.course) !== null && _e !== void 0 ? _e : '',
                'CGPA': (_f = stu.cgpa) !== null && _f !== void 0 ? _f : '',
                'Email': email,
                'Phone': (_g = stu.phone) !== null && _g !== void 0 ? _g : '',
                'Placement Status': stu.isLocked ? 'Placed' : 'Not Placed',
                'Application Status': (_h = app.status) !== null && _h !== void 0 ? _h : '',
                'ATS Score': (_j = app.atsScore) !== null && _j !== void 0 ? _j : '',
                'Resume Url': (_l = (_k = app.resume) === null || _k === void 0 ? void 0 : _k.fileUrl) !== null && _l !== void 0 ? _l : ''
            };
        });
        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'No applicants found' });
        }
        const csvStringifier = (0, csv_writer_1.createObjectCsvStringifier)({ header: FIELDS });
        const csvString = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="applicants-${job.id}.csv"`);
        res.send(csvString);
    }
    catch (error) {
        console.error("Export applicants error:", error);
        res.status(500).json({ success: false, message: 'Failed to export applicants test' });
    }
});
exports.exportApplicantsCsv = exportApplicantsCsv;
// Student read-only job details (used by JobBoard "View Details" modal)
const getStudentJobDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const now = new Date();
        const job = yield prisma.job.findUnique({
            where: { id },
            include: {
                stages: { orderBy: { scheduledDate: 'asc' } },
            },
        });
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        // Only show jobs that are effectively available to students
        if (job.status !== 'PUBLISHED' || (job.applicationDeadline && now > job.applicationDeadline)) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        const applicantsCount = yield prisma.jobApplication.count({
            where: {
                jobId: job.id,
                status: { not: 'WITHDRAWN' }
            },
        });
        const safeJsonArray = (val) => {
            if (Array.isArray(val))
                return val;
            if (typeof val !== 'string')
                return [];
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch (_a) {
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
                applicationDeadline: ((_b = (_a = job.applicationDeadline) === null || _a === void 0 ? void 0 : _a.toISOString) === null || _b === void 0 ? void 0 : _b.call(_a)) ? job.applicationDeadline.toISOString() : job.applicationDeadline,
                stages: job.stages,
                // Location isn't currently a persisted Job field in the schema; keep UI fallback.
                location: null,
            },
            applicantsCount,
        });
    }
    catch (error) {
        console.error('[getStudentJobDetails] error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch job details' });
    }
});
exports.getStudentJobDetails = getStudentJobDetails;
const notification_service_1 = require("../services/notification.service");
const addOrUpdateStage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { name, scheduledDate, status } = req.body;
        const job = yield prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: { scheduledDate: 'asc' } } }
        });
        if (!job)
            return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement((_b = req.user) === null || _b === void 0 ? void 0 : _b.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const stageDate = new Date(scheduledDate);
        const deadline = new Date(job.applicationDeadline);
        if (stageDate <= deadline) {
            return res.status(400).json({ success: false, message: 'Timeline stages must occur sequentially and after application deadline' });
        }
        const existingStages = job.stages || [];
        if (existingStages.length > 0) {
            const lastDate = new Date(existingStages[existingStages.length - 1].scheduledDate);
            if (stageDate <= lastDate) {
                return res.status(400).json({ success: false, message: 'Timeline stages must occur sequentially and after application deadline' });
            }
        }
        const stage = yield prisma.jobStage.create({
            data: {
                jobId: job.id,
                name,
                scheduledDate: new Date(scheduledDate),
                status: status || 'PENDING'
            }
        });
        // Broadcast to all applicants
        const students = yield prisma.jobApplication.findMany({
            where: { jobId: job.id },
            select: { student: { select: { userId: true } } }
        });
        students.forEach(s => {
            (0, notification_service_1.enqueueAndSend)(s.student.userId, 'APPLICATION_STATUS_CHANGED', `New stage added for ${job.companyName}: ${name} on ${new Date(scheduledDate).toLocaleDateString()}`);
            // WhatsApp Zapier trigger
            (0, notification_service_1.sendWhatsApp)(s.student.userId, job.id, 'OA_SCHEDULED', {
                company_name: job.companyName,
                role: job.role,
                date: new Date(scheduledDate).toLocaleDateString('en-IN')
            }).catch(() => { });
        });
        res.json({ success: true, stage });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to add stage' });
    }
});
exports.addOrUpdateStage = addOrUpdateStage;
const advanceStage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { selectedIds, nextStageIndex } = req.body;
        if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
            return res.status(400).json({ success: false, message: 'selectedIds must be a non-empty array' });
        }
        const job = yield prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: { scheduledDate: 'asc' } } }
        });
        if (!job)
            return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement((_b = req.user) === null || _b === void 0 ? void 0 : _b.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!job.stages || job.stages.length === 0) {
            return res.status(400).json({ success: false, message: 'No stages found for this job' });
        }
        const uniqueSelectedIds = [...new Set(selectedIds)];
        const selectedApplications = yield prisma.jobApplication.findMany({
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
        const currentStageSet = new Set(selectedApplications.map((app) => { var _a; return (_a = app.currentStageIndex) !== null && _a !== void 0 ? _a : 0; }));
        if (currentStageSet.size !== 1) {
            return res.status(400).json({ success: false, message: 'Selected students must be in the same current stage' });
        }
        if (selectedApplications.some((app) => app.status === 'PLACED')) {
            return res.status(400).json({ success: false, message: 'Placed students cannot be moved to another stage' });
        }
        const currentStageIndex = (_c = selectedApplications[0].currentStageIndex) !== null && _c !== void 0 ? _c : 0;
        const expectedNextStageIndex = currentStageIndex + 1;
        if (typeof nextStageIndex === 'number' && nextStageIndex !== expectedNextStageIndex) {
            return res.status(400).json({ success: false, message: `Invalid nextStageIndex. Expected ${expectedNextStageIndex}` });
        }
        if (expectedNextStageIndex >= job.stages.length) {
            return res.status(400).json({ success: false, message: 'Students are already at the final stage. Use declare placed.' });
        }
        const appIds = selectedApplications.map((app) => app.id);
        const updateResult = yield prisma.jobApplication.updateMany({
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
        yield prisma.notification.createMany({
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
    }
    catch (error) {
        console.error('[advanceStage] error:', error);
        return res.status(500).json({ success: false, message: 'Failed to move students to next stage' });
    }
});
exports.advanceStage = advanceStage;
const declareResults = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { placedStudentIds } = req.body;
        if (!Array.isArray(placedStudentIds) || placedStudentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'placedStudentIds must be a non-empty array' });
        }
        const job = yield prisma.job.findUnique({
            where: { id },
            include: { stages: { orderBy: { scheduledDate: 'asc' } } }
        });
        if (!job)
            return res.status(404).json({ success: false, message: 'Job not found' });
        if (!canManageJobPlacement((_b = req.user) === null || _b === void 0 ? void 0 : _b.role, job.postedById, userId)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (!job.stages || job.stages.length === 0) {
            return res.status(400).json({ success: false, message: 'Cannot declare placement without configured stages' });
        }
        const uniqueStudentIds = [...new Set(placedStudentIds)];
        const selectedApplications = yield prisma.jobApplication.findMany({
            where: { jobId: id, studentId: { in: uniqueStudentIds } },
            select: {
                id: true,
                studentId: true,
                currentStageIndex: true,
                status: true,
                student: { select: { userId: true, firstName: true, lastName: true, branch: true, linkedin: true } }
            }
        });
        if (selectedApplications.length !== uniqueStudentIds.length) {
            return res.status(404).json({ success: false, message: 'One or more selected students do not have applications for this job' });
        }
        const finalStageIndex = job.stages.length - 1;
        const invalidForPlacement = selectedApplications.filter((app) => { var _a; return ((_a = app.currentStageIndex) !== null && _a !== void 0 ? _a : 0) !== finalStageIndex; });
        if (invalidForPlacement.length > 0) {
            return res.status(400).json({ success: false, message: 'Declare placed is allowed only for students in final stage' });
        }
        const placementYear = new Date().getFullYear();
        yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            yield tx.jobApplication.updateMany({
                where: { id: { in: selectedApplications.map((app) => app.id) } },
                data: { status: 'PLACED' }
            });
            yield tx.student.updateMany({
                where: { id: { in: uniqueStudentIds } },
                data: {
                    isLocked: true,
                    lockedReason: `Placed at ${job.companyName} for ${job.role}`,
                    placementType: 'ON_CAMPUS'
                }
            });
            yield tx.profileLock.updateMany({
                where: { studentId: { in: uniqueStudentIds }, isActive: true },
                data: { isActive: false }
            });
            yield tx.profileLock.createMany({
                data: uniqueStudentIds.map((studentId) => ({
                    studentId,
                    profileLocked: true,
                    lockedById: userId || '',
                    reason: `Automatically locked by placement at ${job.companyName}`,
                    isActive: true
                }))
            });
            yield tx.placementRecord.deleteMany({
                where: { jobId: job.id, studentId: { in: uniqueStudentIds } }
            });
            yield tx.placementRecord.createMany({
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
            yield tx.notification.createMany({
                data: selectedApplications.map((app) => ({
                    userId: app.student.userId,
                    type: 'RESULT_DECLARED',
                    status: 'PENDING',
                    message: `Congratulations! You have been placed at ${job.companyName} for the role of ${job.role}.`
                }))
            });
            yield tx.alumni.deleteMany({
                where: { studentId: { in: uniqueStudentIds }, companyName: job.companyName }
            });
            yield tx.alumni.createMany({
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
        }));
        res.json({ success: true, message: 'Placed students declared successfully', placedCount: uniqueStudentIds.length });
    }
    catch (error) {
        console.error('[declareResults] error:', error);
        res.status(500).json({ success: false, message: 'Failed to declare placed' });
    }
});
exports.declareResults = declareResults;
