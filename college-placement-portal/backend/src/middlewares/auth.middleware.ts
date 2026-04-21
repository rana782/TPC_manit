import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const AUTH_DB_TIMEOUT_MS = Number(process.env.AUTH_DB_TIMEOUT_MS || 12000);

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        isVerified?: boolean;
        verifiedAt?: string | null;
        permJobCreate?: boolean;
        permLockProfile?: boolean;
        permExportCsv?: boolean;
    };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(`${label} timed out after ${ms}ms`);
            (err as any).code = 'AUTH_TIMEOUT';
            reject(err);
        }, ms);
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;

    try {
        decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    try {
        const decodedId =
            (typeof decoded?.id === 'string' && decoded.id.trim()) ||
            (typeof decoded?.userId === 'string' && decoded.userId.trim()) ||
            (typeof decoded?.sub === 'string' && decoded.sub.trim()) ||
            '';
        const decodedEmail = typeof decoded?.email === 'string' ? decoded.email.trim() : '';

        // Check if user account has been disabled.
        // Support legacy token payloads (userId/sub) and recover by email for stale IDs.
        let user = null as null | {
            id: string;
            email: string;
            role: string;
            isDisabled: boolean;
            disabledUntil: Date | null;
            isVerified: boolean;
            verifiedAt: Date | null;
            permJobCreate: boolean;
            permLockProfile: boolean;
            permExportCsv: boolean;
        };
        if (decodedId) {
            user = await withTimeout(
                prisma.user.findUnique({
                    where: { id: decodedId },
                    select: {
                        id: true, email: true, role: true, isDisabled: true,
                        disabledUntil: true,
                        isVerified: true, verifiedAt: true, permJobCreate: true, permLockProfile: true, permExportCsv: true
                    }
                }),
                AUTH_DB_TIMEOUT_MS,
                'Auth user lookup by id',
            );
        }
        if (!user && decodedEmail) {
            user = await withTimeout(
                prisma.user.findUnique({
                    where: { email: decodedEmail },
                    select: {
                        id: true, email: true, role: true, isDisabled: true,
                        disabledUntil: true,
                        isVerified: true, verifiedAt: true, permJobCreate: true, permLockProfile: true, permExportCsv: true
                    }
                }),
                AUTH_DB_TIMEOUT_MS,
                'Auth user lookup by email',
            );
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        if (user.isDisabled) {
            const now = new Date();
            if (user.disabledUntil && user.disabledUntil <= now) {
                const reactivated = await withTimeout(
                    prisma.user.update({
                        where: { id: user.id },
                        data: { isDisabled: false, disabledUntil: null },
                        select: {
                            id: true, email: true, role: true, isDisabled: true,
                            isVerified: true, verifiedAt: true, permJobCreate: true, permLockProfile: true, permExportCsv: true
                        }
                    }),
                    AUTH_DB_TIMEOUT_MS,
                    'Auth reactivation update',
                );
                user = { ...reactivated, disabledUntil: null };
            } else {
                return res.status(403).json({
                    success: false,
                    message: user.disabledUntil
                        ? `Account is temporarily disabled until ${user.disabledUntil.toISOString()}.`
                        : 'Account has been disabled. Please contact your coordinator.'
                });
            }
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            verifiedAt: user.verifiedAt ? user.verifiedAt.toISOString() : null,
            permJobCreate: user.permJobCreate,
            permLockProfile: user.permLockProfile,
            permExportCsv: user.permExportCsv
        };
        next();
    } catch (error) {
        // Database / Prisma failures are not token failures; keep semantics clear for frontend session handling.
        return res.status(503).json({ success: false, message: 'Authentication service temporarily unavailable' });
    }
};

export const requireRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Forbidden: Insufficient role' });
        }
        next();
    };
};
