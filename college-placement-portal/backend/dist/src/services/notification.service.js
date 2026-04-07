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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueAndSend = exports.getNotificationsForUser = exports.sendWhatsApp = void 0;
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
// In-memory fallback defaults
const DEFAULT_TEMPLATES = {
    'APPLICATION_CONFIRMATION': 'Hello {student_name}, your application for {role} at {company_name} has been submitted. We\'ll update you about OA/Interview dates. - TPCC',
    'OA_SCHEDULED': 'Hello {student_name}, OA for {company_name} ({role}) is scheduled on {date}. Check portal. - TPCC',
    'INTERVIEW_SCHEDULED': 'Hello {student_name}, your interview for {company_name} ({role}) is scheduled on {date}. - TPCC',
    'RESULT_DECLARED': 'Hello {student_name}, result for {company_name} ({role}) is declared. Your status: {status}. - TPCC'
};
const sendWhatsApp = (studentUserId, jobId, templateType, extraParams) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Find user & phone
        const studentUser = yield prisma.user.findUnique({
            where: { id: studentUserId },
            include: { student: true }
        });
        if (!studentUser || !studentUser.student) {
            console.warn(`[NOTIFICATIONS] Student details missing for user ${studentUserId}`);
            return;
        }
        const phone = studentUser.student.phone;
        const studentName = `${studentUser.student.firstName} ${studentUser.student.lastName}`.trim();
        // 1. Resolve Template
        let text = DEFAULT_TEMPLATES[templateType] || 'Notification from CRC Placement Cell.';
        try {
            const dbTemplate = yield prisma.notificationTemplate.findUnique({ where: { type: templateType } });
            if (dbTemplate) {
                text = dbTemplate.templateText;
            }
        }
        catch (dbErr) {
            // DB might be down, fallback to memory
        }
        // 2. Token Replacements
        const mergedParams = Object.assign({ student_name: studentName }, extraParams);
        for (const [key, val] of Object.entries(mergedParams)) {
            text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
        }
        // 3. Resolve Admin Toggle Setting 
        let isEnabled = process.env.WHATSAPP_ENABLED === 'true';
        try {
            const setting = yield prisma.systemSetting.findUnique({ where: { key: 'WHATSAPP_ENABLED' } });
            if (setting)
                isEnabled = setting.value === 'true';
        }
        catch (dbErr) {
            // DB might be down, fallback to env
        }
        // 4. Dispatch Mechanism
        let status = 'MOCKED';
        if (isEnabled && phone) {
            // Attempt delivery (Using Zapier via example config)
            const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
            if (webhookUrl) {
                try {
                    yield axios_1.default.post(webhookUrl, {
                        phone,
                        message: text,
                        type: templateType
                    });
                    status = 'SENT';
                }
                catch (sendErr) {
                    console.error('[NOTIFICATIONS] Webhook failed', sendErr);
                    status = 'FAILED';
                }
            }
            else {
                // If enabled but no URL, fallback mock logic
                status = 'MOCKED';
                console.log(`[WHATSAPP-MOCK] To: ${phone} | Msg: ${text}`);
            }
        }
        else {
            console.log(`[WHATSAPP-MOCK] (Disabled) To: ${phone || 'Unknown'} | Msg: ${text}`);
        }
        // 5. Log execution
        try {
            yield prisma.notificationLog.create({
                data: {
                    userId: studentUserId,
                    jobId,
                    message: text,
                    channel: 'WHATSAPP',
                    status,
                    sentAt: status === 'SENT' ? new Date() : null
                }
            });
        }
        catch (logErr) {
            console.error('[NOTIFICATIONS] Failed to write to NotificationLog', logErr);
        }
    }
    catch (error) {
        console.error('[NOTIFICATIONS] Service Error:', error);
    }
});
exports.sendWhatsApp = sendWhatsApp;
const getNotificationsForUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
});
exports.getNotificationsForUser = getNotificationsForUser;
const enqueueAndSend = (userId, type, message) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`[NOTIFICATION] To: ${userId} | Type: ${type} | Msg: ${message}`);
        // Log to DB
        yield prisma.notification.create({
            data: {
                userId,
                type,
                message
            }
        });
    }
    catch (error) {
        console.error('[NOTIFICATIONS] Failed to enqueue notification:', error);
    }
});
exports.enqueueAndSend = enqueueAndSend;
