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
exports.updateSettings = exports.getSettings = exports.getNotificationLogs = exports.sendTemplateNotification = exports.getMyNotifications = void 0;
const client_1 = require("@prisma/client");
const notification_service_1 = require("../services/notification.service");
const prisma = new client_1.PrismaClient();
// Any authenticated user: see their own notifications
const getMyNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const notifications = yield (0, notification_service_1.getNotificationsForUser)(userId);
        res.json({ success: true, notifications });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
});
exports.getMyNotifications = getMyNotifications;
// SPOC/COORDINATOR: send a custom notification to any userId
const sendTemplateNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, type, message } = req.body;
        if (!userId || !message) {
            return res.status(400).json({ success: false, message: 'userId and message are required' });
        }
        const user = yield prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ success: false, message: 'Target user not found' });
        // Fire and don't await so the API responds immediately
        (0, notification_service_1.enqueueAndSend)(userId, type || 'CUSTOM', message).catch(console.error);
        res.status(202).json({ success: true, message: 'Notification queued for delivery' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to queue notification' });
    }
});
exports.sendTemplateNotification = sendTemplateNotification;
// Admin: Get recent Notification Logs
const getNotificationLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const logs = yield prisma.notificationLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                user: { select: { email: true, student: { select: { firstName: true, lastName: true } } } },
                job: { select: { companyName: true, role: true } }
            }
        });
        res.json({ success: true, logs });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
});
exports.getNotificationLogs = getNotificationLogs;
// Admin: Get WhatsApp Settings
const getSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let setting = yield prisma.systemSetting.findUnique({ where: { key: 'WHATSAPP_ENABLED' } });
        if (!setting) {
            // Default to env if not in DB yet
            setting = yield prisma.systemSetting.create({
                data: { key: 'WHATSAPP_ENABLED', value: process.env.WHATSAPP_ENABLED || 'false' }
            });
        }
        res.json({ success: true, setting });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
});
exports.getSettings = getSettings;
// Admin: Update WhatsApp Settings
const updateSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { whatsappEnabled } = req.body;
        const setting = yield prisma.systemSetting.upsert({
            where: { key: 'WHATSAPP_ENABLED' },
            create: { key: 'WHATSAPP_ENABLED', value: String(whatsappEnabled) },
            update: { value: String(whatsappEnabled) }
        });
        res.json({ success: true, message: 'Settings updated successfully', setting });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
});
exports.updateSettings = updateSettings;
