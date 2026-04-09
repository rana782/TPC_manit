import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const normalizePhoneFromDb = (rawPhone: string | null | undefined): string => {
    const cleaned = String(rawPhone || '')
        .trim()
        .replace(/[\s\-()]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('91') && cleaned.length >= 12) return `+${cleaned}`;
    return `+91${cleaned}`;
};

const isLikelyValidPhone = (phone: string): boolean => /^\+\d{10,15}$/.test(phone);

const getWhatsAppTargetPhone = (dbPhone: string | null | undefined): string => {
    const override = normalizePhoneFromDb(process.env.WHATSAPP_TEST_PHONE_OVERRIDE);
    if (override) return override;
    return normalizePhoneFromDb(dbPhone);
};

type PlacementEmailWebhookInput = {
    userId: string;
    jobId: string;
    studentEmail: string;
    studentName: string;
    companyName: string;
    role: string;
    ctc: string;
    status?: string;
    placementYear?: number;
    subject?: string;
    messageText?: string;
    messageHtml?: string;
};

// In-memory fallback defaults
const DEFAULT_TEMPLATES: Record<string, string> = {
    'APPLICATION_CONFIRMATION': 'Hello {student_name}, your application for {role} at {company_name} has been submitted. We\'ll update you about OA/Interview dates. - TPCC',
    'OA_SCHEDULED': 'Hello {student_name}, OA for {company_name} ({role}) is scheduled on {date}. Check portal. - TPCC',
    'INTERVIEW_SCHEDULED': 'Hello {student_name}, your interview for {company_name} ({role}) is scheduled on {date}. - TPCC',
    'RESULT_DECLARED': 'Hello {student_name}, result for {company_name} ({role}) is declared. Your status: {status}. - TPCC',
    'PLACED_STUDENT_CONGRATS': 'We\'re thrilled to share this, {student_name}! 🎉 You are placed at {company_name} for the role of {role}. Please check the portal for next steps. - TPCC'
};

export const sendWhatsApp = async (
    studentUserId: string,
    jobId: string | null,
    templateType: string,
    extraParams: Record<string, string>,
    customTemplateText?: string
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

        const phone = getWhatsAppTargetPhone(studentUser.student.phone);
        const studentName = `${studentUser.student.firstName} ${studentUser.student.lastName}`.trim();

        // 1. Resolve Template
        let text = DEFAULT_TEMPLATES[templateType] || 'Notification from CRC Placement Cell.';
        const customText = typeof customTemplateText === 'string' ? customTemplateText.trim() : '';
        if (customText) {
            text = customText;
        } else {
            try {
                const dbTemplate = await prisma.notificationTemplate.findUnique({ where: { type: templateType } });
                if (dbTemplate) {
                    text = dbTemplate.templateText;
                }
            } catch (dbErr) {
                // DB might be down, fallback to memory
            }
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
        let failureReason: string | null = null;
        if (isEnabled && phone) {
            // Attempt delivery (Using Zapier via example config)
            const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
            if (!isLikelyValidPhone(phone)) {
                status = 'FAILED';
                failureReason = `Invalid phone format: "${phone}"`;
                console.warn(`[NOTIFICATIONS] ${failureReason} for user ${studentUserId}`);
            } else if (webhookUrl) {
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
                    failureReason = 'Webhook request failed';
                }
            } else {
                // If enabled but no URL, fallback mock logic
                status = 'MOCKED';
                console.log(`[WHATSAPP-MOCK] To: ${phone} | Msg: ${text}`);
            }
        } else if (isEnabled && !phone) {
            status = 'FAILED';
            failureReason = 'Missing phone number on student profile';
            console.warn(`[NOTIFICATIONS] ${failureReason} for user ${studentUserId}`);
        } else {
            console.log(`[WHATSAPP-MOCK] (Disabled) To: ${phone || 'Unknown'} | Msg: ${text}`);
        }

        // 5. Log execution
        try {
            const logMessage = failureReason ? `${text} [Delivery skipped: ${failureReason}]` : text;
            await prisma.notificationLog.create({
                data: {
                    userId: studentUserId,
                    jobId,
                    message: logMessage,
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

export const sendPlacementResultEmailWebhook = async (input: PlacementEmailWebhookInput) => {
    const statusValue = String(input.status || 'PLACED').toUpperCase();
    const placementYear = input.placementYear || new Date().getFullYear();
    const subject =
        input.subject?.trim() ||
        `Placement Result: ${input.companyName} - ${input.role}`;
    const messageText =
        input.messageText?.trim() ||
        `We're thrilled to share this, ${input.studentName}! 🎉 Congratulations on being placed at ${input.companyName} as ${input.role}. With a CTC of ${input.ctc || 'N/A'}, this achievement reflects your dedication and talent. Please send your acceptance at tpwnitb@gmail.com.`;
    const messageHtml =
        input.messageHtml?.trim() ||
        `<p>We're thrilled to share this, ${input.studentName}! 🎉 Congratulations on being placed at <b>${input.companyName}</b> as <b>${input.role}</b>. With a CTC of <b>${input.ctc || 'N/A'}</b>, this achievement reflects your dedication and talent.</p><p>Please send your acceptance at <b>tpwnitb@gmail.com</b>.</p><p>Placement Year: <b>${placementYear}</b></p>`;

    const payload = {
        event: 'placement_result_declared',
        student_email: input.studentEmail,
        student_name: input.studentName,
        company_name: input.companyName,
        role: input.role,
        ctc: input.ctc || 'N/A',
        status: statusValue,
        job_id: input.jobId,
        placement_year: placementYear,
        subject,
        message_text: messageText,
        message_html: messageHtml
    };

    let enabled = String(process.env.EMAIL_WEBHOOK_ENABLED || 'false') === 'true';
    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'EMAIL_WEBHOOK_ENABLED' } });
        if (setting) enabled = setting.value === 'true';
    } catch {
        // fallback to env
    }

    let logStatus = 'MOCKED';
    let logMessage = subject;
    const webhookUrl = String(process.env.EMAIL_WEBHOOK_URL || '').trim();
    if (!input.studentEmail || !input.studentEmail.trim()) {
        logStatus = 'FAILED';
        logMessage = `${subject} [Delivery skipped: Missing student email]`;
    } else if (enabled) {
        if (!webhookUrl) {
            logStatus = 'FAILED';
            logMessage = `${subject} [Delivery skipped: EMAIL_WEBHOOK_URL not configured]`;
        } else {
            try {
                await axios.post(webhookUrl, payload);
                logStatus = 'SENT';
            } catch (e) {
                logStatus = 'FAILED';
                logMessage = `${subject} [Delivery failed: webhook error]`;
            }
        }
    }

    try {
        await prisma.notificationLog.create({
            data: {
                userId: input.userId,
                jobId: input.jobId,
                message: logMessage,
                channel: 'EMAIL',
                status: logStatus,
                sentAt: logStatus === 'SENT' ? new Date() : null
            }
        });
    } catch (e) {
        console.error('[EMAIL-WEBHOOK] Failed to write NotificationLog', e);
    }

    return { success: logStatus === 'SENT' || logStatus === 'MOCKED', status: logStatus, payload };
};
