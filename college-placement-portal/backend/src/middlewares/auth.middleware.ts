import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        isVerified?: boolean;
        permJobCreate?: boolean;
        permLockProfile?: boolean;
        permExportCsv?: boolean;
    };
}

export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
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
            isVerified: boolean;
            permJobCreate: boolean;
            permLockProfile: boolean;
            permExportCsv: boolean;
        };
        if (decodedId) {
            user = await prisma.user.findUnique({
                where: { id: decodedId },
                select: {
                    id: true, email: true, role: true, isDisabled: true,
                    isVerified: true, permJobCreate: true, permLockProfile: true, permExportCsv: true
                }
            });
        }
        if (!user && decodedEmail) {
            user = await prisma.user.findUnique({
                where: { email: decodedEmail },
                select: {
                    id: true, email: true, role: true, isDisabled: true,
                    isVerified: true, permJobCreate: true, permLockProfile: true, permExportCsv: true
                }
            });
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        if (user.isDisabled) {
            return res.status(403).json({ success: false, message: 'Account has been disabled. Please contact your coordinator.' });
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            permJobCreate: user.permJobCreate,
            permLockProfile: user.permLockProfile,
            permExportCsv: user.permExportCsv
        };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
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
