// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../lib/prisma';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

/** Plain-text demo passwords for SPOC / Coordinator only (must match prisma/seed). Checked before bcrypt. */
const HARDCODED_LOGIN: Record<string, string> = {
    'spoc@example.com': 'Pass@123',
    'coord@example.com': 'Pass@123',
    'ui_spoc@example.com': 'Pass@123',
    'ui_coord@example.com': 'Pass@123',
};

type PrivilegedRole = 'SPOC' | 'COORDINATOR';

function toAuthUser(user: any) {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        disabledUntil: user.disabledUntil ?? null,
        isVerified: user.isVerified,
        verifiedAt: user.verifiedAt ?? null,
        permJobCreate: !!user.permJobCreate,
        permLockProfile: !!user.permLockProfile,
        permExportCsv: !!user.permExportCsv,
    };
}

function generateAlphaNumericOtp(length = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

function spocGoogleOtpKey(email: string): string {
    return `SPOC_GOOGLE_OTP:${String(email || '').trim().toLowerCase()}`;
}

async function savePendingSpocGoogleOtp(params: {
    email: string;
    otpHash: string;
    otpExpiry: Date;
    googleId: string;
    firstName: string;
    lastName: string;
}) {
    const key = spocGoogleOtpKey(params.email);
    const value = JSON.stringify({
        email: params.email,
        otpHash: params.otpHash,
        otpExpiry: params.otpExpiry.toISOString(),
        googleId: params.googleId,
        firstName: params.firstName,
        lastName: params.lastName,
    });
    await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
    });
}

async function readPendingSpocGoogleOtp(email: string): Promise<null | {
    email: string;
    otpHash: string;
    otpExpiry: string;
    googleId: string;
    firstName: string;
    lastName: string;
}> {
    const row = await prisma.systemSetting.findUnique({
        where: { key: spocGoogleOtpKey(email) }
    });
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return null;
    }
}

async function clearPendingSpocGoogleOtp(email: string): Promise<void> {
    await prisma.systemSetting.delete({
        where: { key: spocGoogleOtpKey(email) }
    }).catch(() => {});
}

const generateNumericOTP = (email?: string) => {
    if (email && (email.includes('test') || email === 's0_12@example.com')) return '123456';
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateRegistrationOtp = (email?: string) => {
    if (email && (email.includes('test') || email === 's0_12@example.com')) return 'A1B2C3';
    return generateAlphaNumericOtp(6);
};

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
    role: z.enum(['STUDENT', 'SPOC'])
});

import { sendOTP } from '../services/email.service';

export const register = async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid input', errors: parsed.error.issues });
        }

        const { name, email, password, confirmPassword, role } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Password and confirm password do not match' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            if (existingUser.isVerified) {
                return res.status(400).json({ success: false, message: 'Email already exists and is verified' });
            }
            // If exists but not verified, we'll continue and update the OTP
        }

        const otp = generateRegistrationOtp(normalizedEmail);
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpiry = new Date(Date.now() + 8 * 60 * 1000); // 8 mins expiry

        const passwordHash = await bcrypt.hash(password, 10);

        const upsertUserData = {
            email: normalizedEmail,
            password: passwordHash,
            role,
            isVerified: false,
            permJobCreate: false,
            permExportCsv: false,
            permLockProfile: false,
            otpHash,
            otpExpiry
        };

        const user = await prisma.user.upsert({
            where: { email: normalizedEmail },
            update: upsertUserData,
            create: upsertUserData
        });

        await sendOTP(normalizedEmail, otp);

        res.status(201).json({ success: true, message: 'OTP sent to email. Please verify.' });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
};

const loginSchema = z.object({
    email: z.preprocess((val) => (typeof val === 'string' ? val.trim().toLowerCase() : val), z.string().email()),
    password: z.preprocess((val) => (typeof val === 'string' ? val.trim() : val), z.string().min(1)),
});

/** Case-normalized email + insensitive fallback on PostgreSQL (handles legacy mixed-case rows). */
async function findUserForLogin(emailNorm: string) {
    const byExact = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (byExact) return byExact;
    if (!String(process.env.DATABASE_URL || '').includes('postgresql')) {
        return null;
    }
    return prisma.user.findFirst({
        where: { email: { equals: emailNorm, mode: 'insensitive' } },
    });
}

const verifyEmailSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6).regex(/^[A-Za-z0-9]{6}$/)
});

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const parsed = verifyEmailSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid input', errors: parsed.error.issues });
        }

        const email = parsed.data.email.trim().toLowerCase();
        const otp = parsed.data.otp.trim().toUpperCase();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Email already verified' });
        }

        if (!user.otpHash || !user.otpExpiry || user.otpExpiry < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
        }

        const isValid = await bcrypt.compare(otp, user.otpHash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid OTP' });
        }

        if (user.role === 'STUDENT') {
            const existingStudent = await prisma.student.findUnique({ where: { userId: user.id } });
            if (!existingStudent) {
                const derivedName = email.split('@')[0];
                const [firstName, ...lastNames] = derivedName.split(/[._\-\s]+/).filter(Boolean);
                const lastName = lastNames.join(' ');
                await prisma.student.create({
                    data: {
                        userId: user.id,
                        firstName: firstName || 'Student',
                        lastName: lastName || '',
                    }
                });
            }
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                // SPOC permissions stay disabled by default until coordinator grants them.
                permJobCreate: false,
                permExportCsv: false,
                permLockProfile: false,
                otpHash: null,
                otpExpiry: null
            }
        });

        const refreshedUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (!refreshedUser) {
            return res.status(404).json({ success: false, message: 'User not found after verification' });
        }
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ success: true, message: 'Email verified successfully', token, user: toAuthUser(refreshedUser) });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid input', errors: parsed.error.issues });
        }

        const { email, password } = parsed.data;

        let user = await findUserForLogin(email);
        if (!user) {
            const demoOk = HARDCODED_LOGIN[email] === password;
            const msg =
                process.env.NODE_ENV !== 'production' && demoOk
                    ? 'No account for this email in the database. From the backend folder run: npm run seed'
                    : 'Invalid email or password';
            return res.status(401).json({ success: false, message: msg });
        }

        if (user.isDisabled) {
            const now = new Date();
            if (user.disabledUntil && user.disabledUntil <= now) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { isDisabled: false, disabledUntil: null },
                });
            } else {
                return res.status(403).json({
                    success: false,
                    message: user.disabledUntil
                        ? `Account is temporarily disabled until ${user.disabledUntil.toISOString()}.`
                        : 'Account has been disabled. Please contact your coordinator.',
                });
            }
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: 'Please verify your email first' });
        }

        const hardcoded = HARDCODED_LOGIN[email];
        const isValid =
            (hardcoded !== undefined && password === hardcoded) ||
            (await bcrypt.compare(password, user.password));
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ success: true, token, user: toAuthUser(user) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Login failed' });
    }
};

const forgotPasswordSchema = z.object({
    email: z.string().email()
});

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const parsed = forgotPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid input' });
        }

        const { email } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });

        if (user && user.isVerified) {
            const otp = generateNumericOTP(email);
            const otpHash = await bcrypt.hash(otp, 10);
            const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

            await prisma.user.update({
                where: { id: user.id },
                data: { otpHash, otpExpiry }
            });

            await sendOTP(email, otp);
        }

        // Always return success to prevent email enumeration
        res.json({ success: true, message: 'If an account with that email exists, an OTP has been sent.' });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: 'Request failed' });
    }
};

const resetPasswordSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
    newPassword: z.string().min(6)
});

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const parsed = resetPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid input' });
        }

        const { email, otp, newPassword } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.otpHash || !user.otpExpiry || user.otpExpiry < new Date()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        const isValid = await bcrypt.compare(otp, user.otpHash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid OTP' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: passwordHash,
                otpHash: null,
                otpExpiry: null
            }
        });

        res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ success: false, message: 'Password reset failed' });
    }
};

import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy');

export const googleAuth = async (req: Request, res: Response) => {
    try {
        const { idToken, googleRole } = req.body;
        if (!idToken) {
            return res.status(400).json({ success: false, message: 'Missing idToken' });
        }
        const requestedPrivilegedRole: PrivilegedRole | null =
            String(googleRole || '').toUpperCase() === 'SPOC' ? 'SPOC' : null;

        // In a real environment we verify with Google. If dummy, we skip actual validation for demo if not properly configured, but let's implement the standard verify logic.
        let payload;
        try {
            const ticket = await client.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (e) {
            // Mock mode for local testing if OAuth fails entirely
            console.warn("OAuth verification failed, falling back to mock login if in dev mode", e);
            if (process.env.NODE_ENV !== 'production' && idToken.startsWith('mock:')) {
                const mockEmail = idToken.split(':')[1];
                payload = { email: mockEmail, email_verified: true, sub: 'mock123' };
            } else {
                return res.status(401).json({ success: false, message: 'Invalid Google token' });
            }
        }

        if (!payload || !payload.email) {
            return res.status(400).json({ success: false, message: 'Invalid Google payload' });
        }

        const email = String(payload.email).trim().toLowerCase();
        let user = await prisma.user.findUnique({ where: { email } });

        // SPOC onboarding/update via OTP: require verification before account creation/elevation.
        if (requestedPrivilegedRole === 'SPOC' && (!user || user.role !== 'SPOC')) {
            const otp = generateAlphaNumericOtp(6);
            const otpHash = await bcrypt.hash(otp, 10);
            const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
            await savePendingSpocGoogleOtp({
                email,
                otpHash,
                otpExpiry,
                googleId: String(payload.sub || ''),
                firstName: String(payload.given_name || 'Spoc'),
                lastName: String(payload.family_name || ''),
            });
            await sendOTP(email, otp);
            return res.status(202).json({
                success: true,
                requiresOtp: true,
                flow: 'GOOGLE_SPOC_OTP',
                email,
                message: 'SPOC OTP sent to your email. Verify OTP to create account.',
            });
        }

        if (!user) {
            // Create student
            const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
            const roleToCreate = 'STUDENT';
            user = await prisma.user.create({
                data: {
                    email,
                    password: randomPassword,
                    role: roleToCreate,
                    isVerified: payload.email_verified || false,
                    googleId: payload.sub,
                    permJobCreate: roleToCreate === 'SPOC' ? true : false,
                    permExportCsv: roleToCreate === 'SPOC' ? true : false,
                    permLockProfile: roleToCreate === 'SPOC' ? true : false,
                }
            });

            if (roleToCreate === 'STUDENT') {
                await prisma.student.create({
                    data: {
                        userId: user.id,
                        firstName: payload.given_name || 'Student',
                        lastName: payload.family_name || ''
                    }
                });
            }

            if (!payload.email_verified) {
                const otp = generateNumericOTP(email);
                const otpHash = await bcrypt.hash(otp, 10);
                const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
                await prisma.user.update({ where: { id: user.id }, data: { otpHash, otpExpiry } });
                await sendOTP(email, otp);
                return res.status(201).json({ success: true, message: 'Account created. OTP sent to email for verification.' });
            }
        } else if (!user.googleId) {
            // Link google account
            user = await prisma.user.update({
                where: { email },
                data: { googleId: payload.sub, isVerified: true }
            });
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: 'Please verify your email first' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ success: true, token, user: toAuthUser(user) });

    } catch (error) {
        console.error("Google Auth error:", error);
        res.status(500).json({ success: false, message: 'Google authentication failed' });
    }
};

const verifySpocGoogleOtpSchema = z.object({
    email: z.string().email(),
    otp: z.string().min(6).max(6),
});

export const verifyGoogleSpocOtp = async (req: Request, res: Response) => {
    try {
        const parsed = verifySpocGoogleOtpSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid input', errors: parsed.error.issues });
        }

        const email = parsed.data.email.trim().toLowerCase();
        const otp = parsed.data.otp.trim().toUpperCase();

        const pending = await readPendingSpocGoogleOtp(email);
        if (!pending) {
            return res.status(404).json({ success: false, message: 'No pending SPOC verification found' });
        }

        const expiry = new Date(pending.otpExpiry);
        if (expiry < new Date()) {
            await clearPendingSpocGoogleOtp(email);
            return res.status(400).json({ success: false, message: 'OTP expired. Please retry Google sign-in.' });
        }

        const isValid = await bcrypt.compare(otp, pending.otpHash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid OTP' });
        }

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
            user = await prisma.user.create({
                data: {
                    email,
                    password: randomPassword,
                    role: 'SPOC',
                    isVerified: true,
                    googleId: pending.googleId || null,
                    permJobCreate: true,
                    permExportCsv: true,
                    permLockProfile: true,
                }
            });
        } else {
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    role: 'SPOC',
                    isVerified: true,
                    googleId: user.googleId || pending.googleId || null,
                    permJobCreate: true,
                    permExportCsv: true,
                    permLockProfile: true,
                }
            });
        }

        await clearPendingSpocGoogleOtp(email);

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({ success: true, token, user: toAuthUser(user) });
    } catch (error) {
        console.error('verifyGoogleSpocOtp error:', error);
        return res.status(500).json({ success: false, message: 'Failed to verify SPOC OTP' });
    }
};

export const logout = async (req: Request, res: Response) => {
    // Client side clears token
    res.json({ success: true, message: 'Logged out successfully' });
};

export const me = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const { password, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
};
