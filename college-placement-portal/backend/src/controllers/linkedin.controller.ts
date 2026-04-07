import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth.middleware';
import { publishLinkedInAnnouncement } from '../services/linkedin.service';

const prisma = new PrismaClient();

// POST /api/announcements/job/:job_id/publish
export const publishAnnouncement = async (req: AuthRequest, res: Response) => {
    try {
        const { job_id } = req.params;
        const coordinatorId = req.user?.id;
        if (!coordinatorId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const result = await publishLinkedInAnnouncement(job_id, coordinatorId);

        return res.status(201).json({
            success: true,
            message: result.log.zapStatus === 'SUCCESS'
                ? 'Announcement published to LinkedIn via Zapier.'
                : result.log.zapStatus === 'MOCKED'
                    ? 'Announcement logged (Zapier disabled/mocked).'
                    : 'Announcement attempted but Zapier returned an error.',
            log: result.log
        });
    } catch (error: any) {
        console.error('[LINKEDIN-CONTROLLER] Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to publish announcement' });
    }
};

// GET /api/announcements/linkedin/logs
export const getLinkedInLogs = async (req: AuthRequest, res: Response) => {
    try {
        const logs = await prisma.placementAnnouncementLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                postedBy: { select: { email: true } },
                job: { select: { role: true, companyName: true } }
            }
        });
        return res.json({ success: true, logs });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch LinkedIn announcement logs' });
    }
};

// GET /api/announcements/linkedin/settings
export const getLinkedInSettings = async (req: AuthRequest, res: Response) => {
    try {
        let setting = await prisma.systemSetting.findUnique({ where: { key: 'ZAPIER_LINKEDIN_ENABLED' } });
        if (!setting) {
            setting = await prisma.systemSetting.create({
                data: { key: 'ZAPIER_LINKEDIN_ENABLED', value: process.env.ZAPIER_LINKEDIN_ENABLED || 'false' }
            });
        }
        return res.json({ success: true, setting });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch LinkedIn settings' });
    }
};

// PATCH /api/announcements/linkedin/settings
export const updateLinkedInSettings = async (req: AuthRequest, res: Response) => {
    try {
        const { enabled } = req.body;
        const setting = await prisma.systemSetting.upsert({
            where: { key: 'ZAPIER_LINKEDIN_ENABLED' },
            create: { key: 'ZAPIER_LINKEDIN_ENABLED', value: String(enabled) },
            update: { value: String(enabled) }
        });
        return res.json({ success: true, message: 'LinkedIn settings updated', setting });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update LinkedIn settings' });
    }
};
