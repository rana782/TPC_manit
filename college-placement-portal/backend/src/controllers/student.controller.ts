import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import path from 'path';

const prisma = new PrismaClient();

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

// GET /api/student/profile
export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({
            where: { userId },
            include: {
                internships: true,
                certifications: true,
                resumes: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
                documents: true,
            },
        });

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

        const parsed = profileSchema.safeParse(req.body);
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

        res.status(201).json({ success: true, data: resume });
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

        res.json({ success: true, data: resumes });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/student/resume/:id
export const deleteResume = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Profile not found' }); return; }

        const resume = await prisma.resume.findFirst({
            where: { id: req.params.id, studentId: student.id },
        });
        if (!resume) { res.status(404).json({ success: false, message: 'Resume not found' }); return; }

        await prisma.resume.delete({ where: { id: resume.id } });
        res.json({ success: true, message: 'Resume deleted' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
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
