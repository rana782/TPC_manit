// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth.middleware';
import { enqueueAndSend, getNotificationsForUser } from '../services/notification.service';

const prisma = new PrismaClient();

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
