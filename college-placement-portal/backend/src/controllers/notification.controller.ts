// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth.middleware';
import { enqueueAndSend, getNotificationsForUser, sendPlacementResultEmailWebhook, sendWhatsApp } from '../services/notification.service';

const prisma = new PrismaClient();
const DEFAULT_NOTIFICATION_TEMPLATES: Record<string, string> = {
    APPLICATION_CONFIRMATION: 'Hello {student_name}, your application for {role} at {company_name} has been submitted. We\'ll update you about OA/Interview dates. - TPCC',
    OA_SCHEDULED: 'Hello {student_name}, OA for {company_name} ({role}) is scheduled on {date}. Check portal. - TPCC',
    INTERVIEW_SCHEDULED: 'Hello {student_name}, your interview for {company_name} ({role}) is scheduled on {date}. - TPCC',
    RESULT_DECLARED: 'Hello {student_name}, result for {company_name} ({role}) is declared. Your status: {status}. - TPCC',
    PLACED_STUDENT_CONGRATS: 'We\'re thrilled to share this, {student_name}! 🎉 You are placed at {company_name} for the role of {role}. Please check the portal for next steps. - TPCC'
};

// Any authenticated user: see their own notifications
export const getMyNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const notifications = await getNotificationsForUser(userId);
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
};

// SPOC/COORDINATOR: send a custom notification to any userId
export const sendTemplateNotification = async (req: AuthRequest, res: Response) => {
    try {
        const { userId, type, message } = req.body;

        if (!userId || !message) {
            return res.status(400).json({ success: false, message: 'userId and message are required' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, message: 'Target user not found' });

        // Fire and don't await so the API responds immediately
        enqueueAndSend(userId, type || 'CUSTOM', message).catch(console.error);

        res.status(202).json({ success: true, message: 'Notification queued for delivery' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to queue notification' });
    }
};

// Admin: Get recent Notification Logs
export const getNotificationLogs = async (req: AuthRequest, res: Response) => {
    try {
        const logs = await prisma.notificationLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                user: { select: { email: true, student: { select: { firstName: true, lastName: true } } } },
                job: { select: { companyName: true, role: true } }
            }
        });
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
};

// Admin: Get WhatsApp Settings
export const getSettings = async (req: AuthRequest, res: Response) => {
    try {
        let setting = await prisma.systemSetting.findUnique({ where: { key: 'WHATSAPP_ENABLED' } });
        if (!setting) {
            // Default to env if not in DB yet
            setting = await prisma.systemSetting.create({
                data: { key: 'WHATSAPP_ENABLED', value: process.env.WHATSAPP_ENABLED || 'false' }
            });
        }
        res.json({ success: true, setting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
};

// Admin: Update WhatsApp Settings
export const updateSettings = async (req: AuthRequest, res: Response) => {
    try {
        const { whatsappEnabled } = req.body;

        const setting = await prisma.systemSetting.upsert({
            where: { key: 'WHATSAPP_ENABLED' },
            create: { key: 'WHATSAPP_ENABLED', value: String(whatsappEnabled) },
            update: { value: String(whatsappEnabled) }
        });

        res.json({ success: true, message: 'Settings updated successfully', setting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
};

// Admin: Get WhatsApp templates
export const getNotificationTemplates = async (req: AuthRequest, res: Response) => {
    try {
        const dbTemplates = await prisma.notificationTemplate.findMany({
            orderBy: { type: 'asc' }
        });
        const dbMap = new Map(dbTemplates.map((t) => [t.type, t]));

        const templates = Object.entries(DEFAULT_NOTIFICATION_TEMPLATES).map(([type, templateText]) => {
            const existing = dbMap.get(type);
            return {
                id: existing?.id || null,
                type,
                templateText: existing?.templateText || templateText,
                source: existing ? 'DB' : 'DEFAULT'
            };
        });

        const extraTemplates = dbTemplates
            .filter((t) => !Object.prototype.hasOwnProperty.call(DEFAULT_NOTIFICATION_TEMPLATES, t.type))
            .map((t) => ({
                id: t.id,
                type: t.type,
                templateText: t.templateText,
                source: 'DB'
            }));

        res.json({ success: true, templates: [...templates, ...extraTemplates] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch notification templates' });
    }
};

// Admin: Create/Update one WhatsApp template
export const upsertNotificationTemplate = async (req: AuthRequest, res: Response) => {
    try {
        const { type } = req.params;
        const rawText = req.body?.templateText;

        if (!type || typeof type !== 'string' || !type.trim()) {
            return res.status(400).json({ success: false, message: 'Template type is required' });
        }
        if (typeof rawText !== 'string' || !rawText.trim()) {
            return res.status(400).json({ success: false, message: 'templateText is required' });
        }

        const normalizedType = type.trim().toUpperCase();
        const templateText = rawText.trim();
        const template = await prisma.notificationTemplate.upsert({
            where: { type: normalizedType },
            create: { type: normalizedType, templateText },
            update: { templateText }
        });

        return res.json({
            success: true,
            message: `Template ${normalizedType} updated successfully`,
            template
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update notification template' });
    }
};

// SPOC/COORDINATOR: Publish WhatsApp message to all placed students of a job
export const publishPlacedStudentsWhatsApp = async (req: AuthRequest, res: Response) => {
    try {
        const { job_id } = req.params;
        const actorUserId = req.user?.id;
        const actorRole = req.user?.role;
        if (!actorUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const job = await prisma.job.findUnique({
            where: { id: job_id },
            include: {
                applications: {
                    where: { status: 'PLACED' },
                    include: {
                        student: {
                            select: {
                                userId: true
                            }
                        }
                    }
                }
            }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

        // SPOC can only publish for own posted jobs; coordinator can publish any
        if (actorRole === 'SPOC' && job.postedById !== actorUserId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You can publish only your posted jobs.' });
        }

        if (!job.applications.length) {
            return res.status(400).json({ success: false, message: 'No placed students found for this job.' });
        }

        const customTemplate =
            typeof req.body?.post_template === 'string' && req.body.post_template.trim()
                ? req.body.post_template.trim()
                : undefined;

        await Promise.allSettled(
            job.applications.map((app) =>
                sendWhatsApp(
                    app.student.userId,
                    job.id,
                    'PLACED_STUDENT_CONGRATS',
                    {
                        company_name: job.companyName,
                        role: job.role,
                        status: 'PLACED'
                    },
                    customTemplate
                )
            )
        );

        return res.status(201).json({
            success: true,
            message: `WhatsApp notifications triggered for ${job.applications.length} placed student(s).`,
            totalRecipients: job.applications.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to publish WhatsApp notifications' });
    }
};

// SPOC/COORDINATOR: Publish placement-result emails to all placed students of a job
export const publishPlacedStudentsEmail = async (req: AuthRequest, res: Response) => {
    try {
        const { job_id } = req.params;
        const actorUserId = req.user?.id;
        const actorRole = req.user?.role;
        if (!actorUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const job = await prisma.job.findUnique({
            where: { id: job_id },
            include: {
                applications: {
                    where: { status: 'PLACED' },
                    include: {
                        student: {
                            select: {
                                userId: true,
                                firstName: true,
                                lastName: true,
                                user: { select: { email: true } }
                            }
                        }
                    }
                }
            }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (actorRole === 'SPOC' && job.postedById !== actorUserId) {
            return res.status(403).json({ success: false, message: 'Forbidden. You can publish only your posted jobs.' });
        }
        if (!job.applications.length) {
            return res.status(400).json({ success: false, message: 'No placed students found for this job.' });
        }

        const placementYear = new Date().getFullYear();
        await Promise.allSettled(
            job.applications.map((app) =>
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

        return res.status(201).json({
            success: true,
            message: `Placement-result emails triggered for ${job.applications.length} placed student(s).`,
            totalRecipients: job.applications.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to publish placement-result emails' });
    }
};
