import { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

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
import { getResumeTextForAtsWithMeta } from './ats.controller';
import { getUploadNanonetsBudgetMs } from '../services/document.service';
import { getRecommendedCompanyRoleDetails, getRecommendedCompanyRoleDetailsDebug } from '../services/companyRecommendation.service';
import prisma from '../lib/prisma';

const DB_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(`${label} timed out after ${ms}ms`);
            (err as any).code = 'DB_TIMEOUT';
            reject(err);
        }, ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

const BRANCH_OPTIONS = ['CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'] as const;
const COURSE_OPTIONS = ['BTech', 'MTech', 'MCA', 'Dual Degree'] as const;
const currentYear = new Date().getFullYear();

// Profile update schema
const profileSchema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    branch: z.union([z.enum(BRANCH_OPTIONS), z.literal('')]).optional(),
    course: z.union([z.enum(COURSE_OPTIONS), z.literal('')]).optional(),
    scholarNo: z.string().regex(/^[0-9]{10}$/, 'Scholar number must contain exactly 10 digits').optional().or(z.literal('')),
    phone: z.string().optional(),
    dob: z.string().optional(), // ISO date string
    // Academic
    tenthPct: z.number().min(0, 'Percentage must be between 0 and 100').max(100, 'Percentage must be between 0 and 100').optional(),
    tenthYear: z.number().int().optional(),
    twelfthPct: z.number().min(0, 'Percentage must be between 0 and 100').max(100, 'Percentage must be between 0 and 100').optional(),
    twelfthYear: z.number().int().optional(),
    semester: z.number().int().min(1, 'Current semester must be between 1 and 10').max(10, 'Current semester must be between 1 and 10').optional(),
    cgpa: z.number().min(0, 'CGPA must be between 0 and 10').max(10, 'CGPA must be between 0 and 10').optional(),
    sgpa: z.number().min(0, 'SGPA must be between 0 and 10').max(10, 'SGPA must be between 0 and 10').optional(),
    backlogs: z.number().int().min(0).max(50).optional(),
    // Links
    linkedin: z.string().url().optional().or(z.literal('')),
    naukri: z.string().url().optional().or(z.literal('')),
    leetcode: z.string().url().optional().or(z.literal('')),
    codechef: z.string().url().optional().or(z.literal('')),
    codeforces: z.string().url().optional().or(z.literal('')),
    // Address
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().regex(/^[0-9]{6}$/, 'Pincode must be a 6 digit number').optional().or(z.literal('')),
})
    .refine(
        (data) => {
            const tenth = data.tenthYear;
            const twelfth = data.twelfthYear;
            if (tenth == null || twelfth == null) return true;
            return tenth < currentYear && twelfth < currentYear;
        },
        { message: 'Year cannot be in the future' }
    )
    .refine(
        (data) => {
            const tenth = data.tenthYear;
            const twelfth = data.twelfthYear;
            if (tenth == null || twelfth == null) return true;
            return twelfth - tenth >= 2;
        },
        { message: 'Gap between 10th and 12th must be at least 2 years' }
    );

const internshipSchema = z.object({
    company: z.string().min(1),
    role: z.string().min(1),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string().optional(),
}).refine(
    (data) => {
        if (!data.endDate || !data.startDate) return true;
        return new Date(data.endDate) > new Date(data.startDate);
    },
    { message: 'Internship end date must be after start date', path: ['endDate'] }
);

const certificationSchema = z.object({
    title: z.string().min(1),
    organization: z.string().min(1),
    issueDate: z.string(),
});

function toNumberOrUndefined(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function defaultStudentNamesFromEmail(email: string): { firstName: string; lastName: string } {
    const local = (email || 'student').split('@')[0] || 'student';
    const cleaned = local.replace(/[._-]+/g, ' ').trim() || 'student';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Student');
    if (parts.length >= 2) {
        return { firstName: cap(parts[0]), lastName: cap(parts.slice(1).join(' ')) };
    }
    const one = cap(parts[0] || 'Student');
    return { firstName: one, lastName: 'Student' };
}

// GET /api/student/profile
export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        const role = String((req as any).user?.role || '');
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const include = {
            internships: true,
            certifications: true,
            resumes: { where: { isActive: true }, orderBy: { createdAt: 'desc' } as const },
            documents: true,
        } as const;

        let student = await prisma.student.findUnique({
            where: { userId },
            include,
        });

        if (!student && role === 'STUDENT') {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true },
            });
            const { firstName, lastName } = defaultStudentNamesFromEmail(user?.email || '');
            try {
                await prisma.student.create({
                    data: {
                        userId,
                        firstName,
                        lastName,
                        backlogs: 0,
                    },
                });
            } catch (e: any) {
                if (e?.code !== 'P2002') throw e;
            }
            student = await prisma.student.findUnique({
                where: { userId },
                include,
            });
        }

        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        res.json({ success: true, data: student });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PUT /api/student/profile
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const payload = { ...(req.body || {}) } as Record<string, unknown>;
        ['tenthPct', 'twelfthPct', 'cgpa', 'sgpa', 'tenthYear', 'twelfthYear', 'semester', 'backlogs'].forEach((k) => {
            const parsedValue = toNumberOrUndefined(payload[k]);
            if (parsedValue === undefined) delete payload[k];
            else payload[k] = parsedValue;
        });
        if (payload.dob === '') delete payload.dob;

        const parsed = profileSchema.safeParse(payload);
        if (!parsed.success) {
            const firstError = parsed.error.errors[0]?.message || 'Validation error';
            res.status(400).json({ success: false, error: 'Validation error', message: firstError });
            return;
        }

        const data = parsed.data;
        const updateData: any = { ...data };
        if (data.dob) updateData.dob = new Date(data.dob);

        const student = await prisma.student.update({
            where: { userId },
            data: updateData,
        });

        res.json({ success: true, data: student });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/student/photo  (multipart/form-data with field "photo")
export const uploadPhoto = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
        if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }

        const photoPath = `/uploads/${req.file.filename}`;
        const student = await prisma.student.update({
            where: { userId },
            data: { photoPath },
        });
        res.json({ success: true, data: { photoPath: student.photoPath } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/student/resume  (multipart with field "resume")
export const uploadResume = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
        if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Student profile not found' }); return; }

        const roleName = req.body.roleName || 'General';
        const fileUrl = `/uploads/${req.file.filename}`;

        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                roleName,
                fileName: req.file.originalname,
                fileUrl,
                isActive: true,
            },
        });

        const resumeForExtract = await prisma.resume.findUnique({ where: { id: resume.id } });
        if (resumeForExtract) {
            try {
                await getResumeTextForAtsWithMeta(resumeForExtract, {
                    nanonetsBudgetMs: getUploadNanonetsBudgetMs(),
                });
            } catch (prefetchErr) {
                console.warn('[student/resume] extraction prefetch failed (non-fatal):', prefetchErr);
            }
        }

        const resumeOut = await prisma.resume.findUnique({ where: { id: resume.id } });
        res.status(201).json({ success: true, data: resumeOut ?? resume });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/student/resumes
export const getResumes = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const resumes = await prisma.resume.findMany({
            where: { studentId: student.id },
            orderBy: { createdAt: 'desc' },
        });

        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.json({ success: true, data: resumes });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/student/recommend-companies?resumeId=<id>&limit=<n>&role=<role>
export const recommendCompanies = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const resumeId = typeof req.query.resumeId === 'string' ? req.query.resumeId.trim() : '';
        if (!resumeId) {
            res.status(400).json({ success: false, message: 'resumeId is required' });
            return;
        }

        const parsedLimit = Number(req.query.limit);
        const limit = Number.isFinite(parsedLimit) ? parsedLimit : 10;
        const roleFilter = typeof req.query.role === 'string' ? req.query.role.trim() : '';

        const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }

        const debugMode = String(req.query.debug || '').trim() === '1';
        if (debugMode) {
            const result = await getRecommendedCompanyRoleDetailsDebug({
                studentId: student.id,
                resumeId,
                limit,
                roleFilter,
            });
            res.json({ success: true, data: result.recommendations, debug: result.debug });
            return;
        }

        const recommendations = await getRecommendedCompanyRoleDetails({
            studentId: student.id,
            resumeId,
            limit,
            roleFilter,
        });
        res.json({ success: true, data: recommendations });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/student/resume/:id
export const deleteResume = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await withTimeout(
            prisma.student.findUnique({ where: { userId } }),
            DB_TIMEOUT_MS,
            'Lookup student profile',
        );
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const resumeId = String(req.params.id || '').trim();
        if (!resumeId) {
            res.status(400).json({ success: false, message: 'Resume id is required' });
            return;
        }

        const resume = await withTimeout(
            prisma.resume.findFirst({
                where: { id: resumeId, studentId: student.id },
            }),
            DB_TIMEOUT_MS,
            'Lookup resume',
        );
        if (!resume) { res.status(404).json({ success: false, message: 'Resume not found' }); return; }

        await withTimeout(
            prisma.$transaction(
                async (tx) => {
                    await tx.jobApplication.deleteMany({ where: { resumeId: resume.id } });
                    await tx.resume.delete({ where: { id: resume.id } });
                },
                { maxWait: 5000, timeout: DB_TIMEOUT_MS },
            ),
            DB_TIMEOUT_MS + 1000,
            'Delete resume transaction',
        );

        unlinkUploadRelative(resume.fileUrl);
        res.json({ success: true, message: 'Resume deleted' });
    } catch (err: any) {
        const code = err?.code || err?.meta?.code;
        const msg =
            code === 'P2003' || code === 'P2014'
                ? 'Cannot delete this resume while it is still linked to applications. Try again or contact support.'
                : code === 'DB_TIMEOUT' || code === 'P1001'
                    ? 'Database is not responding right now. Please retry in a few seconds.'
                : err?.message || 'Failed to delete resume';
        console.error('[student/resume] delete failed', { code, message: err?.message });
        res.status(code === 'DB_TIMEOUT' || code === 'P1001' ? 504 : 500).json({ success: false, message: msg });
    }
};

// PUT /api/student/resume/:id/active  — toggle active state
export const setResumeActive = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const resume = await prisma.resume.findFirst({
            where: { id: req.params.id, studentId: student.id },
        });
        if (!resume) { res.status(404).json({ success: false, message: 'Resume not found' }); return; }

        const updated = await prisma.resume.update({
            where: { id: resume.id },
            data: { isActive: !resume.isActive },
        });
        res.json({ success: true, data: updated });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/student/document  (multipart with field "document", query ?type=AADHAAR)
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
        if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const validTypes = ['COLLEGE_ID', 'AADHAAR', 'PAN', 'OTHER'];
        const docType = (req.body.type || 'OTHER').toUpperCase();
        if (!validTypes.includes(docType)) {
            res.status(400).json({ success: false, message: `Invalid doc type. Use: ${validTypes.join(', ')}` });
            return;
        }

        const doc = await prisma.studentDocument.create({
            data: {
                studentId: student.id,
                type: docType as any,
                fileName: req.file.originalname,
                fileUrl: `/uploads/${req.file.filename}`,
            },
        });
        res.status(201).json({ success: true, data: doc });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/student/document/:id
export const deleteStudentDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const doc = await prisma.studentDocument.findFirst({
            where: { id: req.params.id, studentId: student.id },
        });
        if (!doc) { res.status(404).json({ success: false, message: 'Document not found' }); return; }

        unlinkUploadRelative(doc.fileUrl);
        await prisma.studentDocument.delete({ where: { id: doc.id } });
        res.json({ success: true, message: 'Document removed' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/student/internships
export const addInternship = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const parsed = internshipSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ success: false, message: parsed.error.errors[0].message }); return;
        }
        const { company, role, startDate, endDate, description } = parsed.data;
        const intern = await prisma.internship.create({
            data: {
                studentId: student.id,
                company,
                role,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                description,
            },
        });
        res.status(201).json({ success: true, data: intern });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/student/internships/:id
export const deleteInternship = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const intern = await prisma.internship.findFirst({ where: { id: req.params.id, studentId: student.id } });
        if (!intern) { res.status(404).json({ success: false, message: 'Internship not found' }); return; }

        await prisma.internship.delete({ where: { id: intern.id } });
        res.json({ success: true, message: 'Internship deleted' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/student/certifications
export const addCertification = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const parsed = certificationSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ success: false, message: parsed.error.errors[0].message }); return;
        }
        const { title, organization, issueDate } = parsed.data;
        const cert = await prisma.certification.create({
            data: { studentId: student.id, title, organization, issueDate: new Date(issueDate) },
        });
        res.status(201).json({ success: true, data: cert });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/student/certifications/:id
export const deleteCertification = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const cert = await prisma.certification.findFirst({ where: { id: req.params.id, studentId: student.id } });
        if (!cert) { res.status(404).json({ success: false, message: 'Certification not found' }); return; }

        await prisma.certification.delete({ where: { id: cert.id } });
        res.json({ success: true, message: 'Certification deleted' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};
