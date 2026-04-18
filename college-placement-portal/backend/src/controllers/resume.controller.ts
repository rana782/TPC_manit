// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getResumeTextForAtsWithMeta } from './ats.controller';
import { getUploadNanonetsBudgetMs } from '../services/document.service';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';

export const uploadResume = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded or invalid file format' });
        }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) {
            fs.unlinkSync(req.file.path); // clean up orphaned upload
            return res.status(404).json({ success: false, message: 'Student profile not found. Please create one first.' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                fileName: req.file.originalname,
                fileUrl,
                isActive: true
            }
        });

        const resumeForExtract = await prisma.resume.findUnique({ where: { id: resume.id } });
        if (resumeForExtract) {
            try {
                await getResumeTextForAtsWithMeta(resumeForExtract, {
                    nanonetsBudgetMs: getUploadNanonetsBudgetMs(),
                });
            } catch (prefetchErr) {
                console.warn('[resume-upload] extraction prefetch failed (non-fatal):', prefetchErr);
            }
        }

        const resumeOut = await prisma.resume.findUnique({ where: { id: resume.id } });
        res.json({ success: true, resume: resumeOut ?? resume });
    } catch (error) {
        console.error(error);
        if (req.file) fs.unlinkSync(req.file.path); // Clean up if DB insert failed
        res.status(500).json({ success: false, message: 'Failed to upload resume' });
    }
};

export const listResumes = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        }

        const resumes = await prisma.resume.findMany({
            where: { studentId: student.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, resumes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to list resumes' });
    }
};

export const deleteResume = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { id } = req.params;

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        }

        const resume = await prisma.resume.findFirst({
            where: { id, studentId: student.id }
        });

        if (!resume) {
            return res.status(404).json({ success: false, message: 'Resume not found' });
        }

        // Proceed to delete from db
        await prisma.resume.delete({ where: { id: resume.id } });

        // Proceed to delete file from disk securely
        try {
            const filePath = path.join(__dirname, '../../', resume.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (fsErr) {
            console.error("Failed to delete file from disk:", fsErr);
            // non-blocking
        }

        res.json({ success: true, message: 'Resume deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete resume' });
    }
};

export const applyWithResume = async (req: AuthRequest, res: Response) => {
    return res.status(410).json({
        success: false,
        message: 'This legacy endpoint is disabled. Use POST /api/applications for the ATS-safe apply flow.'
    });
};
