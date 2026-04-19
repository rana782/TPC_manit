import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { publishLinkedInAnnouncement, DEFAULT_LINKEDIN_TEMPLATE } from '../services/linkedin.service';
import prisma from '../lib/prisma';

// POST /api/announcements/job/:job_id/publish
export const publishAnnouncement = async (req: AuthRequest, res: Response) => {
    try {
        const { job_id } = req.params;
        const actorUserId = req.user?.id;
        const actorRole = req.user?.role;
        if (!actorUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // SPOC can only publish for jobs posted by themselves; coordinator can publish any job.
        if (actorRole === 'SPOC') {
            const job = await prisma.job.findUnique({
                where: { id: job_id },
                select: { postedById: true }
            });
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
            if (job.postedById !== actorUserId) {
                return res.status(403).json({ success: false, message: 'Forbidden. You can publish only your posted jobs.' });
            }
        }
        const postTemplate =
            typeof req.body?.post_template === 'string' ? req.body.post_template : undefined;

        const result = await publishLinkedInAnnouncement(job_id, actorUserId, postTemplate);

        return res.status(201).json({
            success: true,
            message: result.log.zapStatus === 'SUCCESS'
                ? 'Announcement published to LinkedIn via Zapier.'
                : result.log.zapStatus === 'MOCKED'
                    ? 'Announcement logged (Zapier disabled/mocked).'
                    : typeof result.log?.responseBody === 'string' &&
                        result.log.responseBody.toLowerCase().includes('duplicate content prevented')
                        ? result.log.responseBody
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

// GET /api/announcements/linkedin/template
export const getLinkedInTemplate = async (req: AuthRequest, res: Response) => {
    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'LINKEDIN_POST_TEMPLATE' } });
        return res.json({
            success: true,
            template: setting?.value?.trim() ? setting.value : DEFAULT_LINKEDIN_TEMPLATE,
            source: setting ? 'DB' : 'DEFAULT',
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch LinkedIn template' });
    }
};

// PUT /api/announcements/linkedin/template
export const updateLinkedInTemplate = async (req: AuthRequest, res: Response) => {
    try {
        if (req.body?.resetToDefault === true) {
            await prisma.systemSetting.deleteMany({ where: { key: 'LINKEDIN_POST_TEMPLATE' } });
            return res.json({
                success: true,
                message: 'LinkedIn template reset to default',
                template: DEFAULT_LINKEDIN_TEMPLATE,
                source: 'DEFAULT',
            });
        }

        const raw = req.body?.templateText;
        if (typeof raw !== 'string' || !raw.trim()) {
            return res.status(400).json({ success: false, message: 'templateText is required' });
        }

        const setting = await prisma.systemSetting.upsert({
            where: { key: 'LINKEDIN_POST_TEMPLATE' },
            create: { key: 'LINKEDIN_POST_TEMPLATE', value: raw.trim() },
            update: { value: raw.trim() },
        });

        return res.json({
            success: true,
            message: 'LinkedIn template updated successfully',
            setting,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update LinkedIn template' });
    }
};
