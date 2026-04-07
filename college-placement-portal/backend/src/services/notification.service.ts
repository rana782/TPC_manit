import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// In-memory fallback defaults
const DEFAULT_TEMPLATES: Record<string, string> = {
    'APPLICATION_CONFIRMATION': 'Hello {student_name}, your application for {role} at {company_name} has been submitted. We\'ll update you about OA/Interview dates. - TPCC',
    'OA_SCHEDULED': 'Hello {student_name}, OA for {company_name} ({role}) is scheduled on {date}. Check portal. - TPCC',
    'INTERVIEW_SCHEDULED': 'Hello {student_name}, your interview for {company_name} ({role}) is scheduled on {date}. - TPCC',
    'RESULT_DECLARED': 'Hello {student_name}, result for {company_name} ({role}) is declared. Your status: {status}. - TPCC'
};

export const sendWhatsApp = async (
    studentUserId: string,
    jobId: string | null,
    templateType: string,
    extraParams: Record<string, string>
) => {
    try {
        // Find user & phone
        const studentUser = await prisma.user.findUnique({
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
            const dbTemplate = await prisma.notificationTemplate.findUnique({ where: { type: templateType } });
            if (dbTemplate) {
                text = dbTemplate.templateText;
            }
        } catch (dbErr) {
            // DB might be down, fallback to memory
        }

        // 2. Token Replacements
        const mergedParams = {
            student_name: studentName,
            ...extraParams
        };

        for (const [key, val] of Object.entries(mergedParams)) {
            text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
        }

        // 3. Resolve Admin Toggle Setting 
        let isEnabled = process.env.WHATSAPP_ENABLED === 'true';
        try {
            const setting = await prisma.systemSetting.findUnique({ where: { key: 'WHATSAPP_ENABLED' } });
            if (setting) isEnabled = setting.value === 'true';
        } catch (dbErr) {
            // DB might be down, fallback to env
        }

        // 4. Dispatch Mechanism
        let status = 'MOCKED';
        if (isEnabled && phone) {
            // Attempt delivery (Using Zapier via example config)
            const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
            if (webhookUrl) {
                try {
                    await axios.post(webhookUrl, {
                        phone,
                        message: text,
                        type: templateType
                    });
                    status = 'SENT';
                } catch (sendErr) {
                    console.error('[NOTIFICATIONS] Webhook failed', sendErr);
                    status = 'FAILED';
                }
            } else {
                // If enabled but no URL, fallback mock logic
                status = 'MOCKED';
                console.log(`[WHATSAPP-MOCK] To: ${phone} | Msg: ${text}`);
            }
        } else {
            console.log(`[WHATSAPP-MOCK] (Disabled) To: ${phone || 'Unknown'} | Msg: ${text}`);
        }

        // 5. Log execution
        try {
            await prisma.notificationLog.create({
                data: {
                    userId: studentUserId,
                    jobId,
                    message: text,
                    channel: 'WHATSAPP',
                    status,
                    sentAt: status === 'SENT' ? new Date() : null
                }
            });
        } catch (logErr) {
            console.error('[NOTIFICATIONS] Failed to write to NotificationLog', logErr);
        }

    } catch (error) {
        console.error('[NOTIFICATIONS] Service Error:', error);
    }
};

export const getNotificationsForUser = async (userId: string) => {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
};

export const enqueueAndSend = async (userId: string, type: string, message: string) => {
    try {
        console.log(`[NOTIFICATION] To: ${userId} | Type: ${type} | Msg: ${message}`);
        // Log to DB
        await prisma.notification.create({
            data: {
                userId,
                type,
                message
            }
        });
    } catch (error) {
        console.error('[NOTIFICATIONS] Failed to enqueue notification:', error);
    }
};
