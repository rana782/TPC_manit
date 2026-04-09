import winston from 'winston';
import nodemailer from 'nodemailer';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

export const sendOTP = async (email: string, otp: string) => {
    if (process.env.NODE_ENV === 'test') {
        logger.info(`[TEST EMAIL SERVICE] OTP ${otp} prepared for ${email}`);
        return true;
    }

    const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
    const port = Number(process.env.BREVO_SMTP_PORT || 587);
    const user = process.env.BREVO_SMTP_USER || '';
    const pass = process.env.BREVO_SMTP_PASS || '';
    const from = process.env.BREVO_SMTP_FROM || process.env.BREVO_SMTP_USER || '';
    const secure = String(process.env.BREVO_SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

    if (!user || !pass || !from) {
        logger.warn(`[EMAIL FALLBACK] Brevo SMTP not configured. OTP ${otp} for ${email}`);
        return true;
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="margin-bottom: 8px;">Verify your email</h2>
            <p style="margin: 0 0 16px;">Use this OTP to continue your registration:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; background: #f4f6f8; padding: 14px 18px; border-radius: 8px; display: inline-block;">
                ${otp}
            </div>
            <p style="margin-top: 16px; color: #555;">This OTP is valid for 8 minutes.</p>
            <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
        </div>
    `;

    await transporter.sendMail({
        from,
        to: email,
        subject: 'College Placement Portal - Verify your email',
        text: `Your OTP is: ${otp}. It is valid for 8 minutes.`,
        html,
    });

    logger.info(`OTP email sent to ${email}`);
    return true;
};
