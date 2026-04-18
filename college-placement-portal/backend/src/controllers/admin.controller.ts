// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../lib/prisma';

export const getStats = async (req: AuthRequest, res: Response) => {
    try {
        const [
            totalStudents,
            totalJobs,
            totalApplications,
            lockedProfiles,
            placedGroup,
            applicationsByStatus
        ] = await Promise.all([
            prisma.student.count(),
            prisma.job.count(),
            prisma.jobApplication.count(),
            prisma.student.count({ where: { isLocked: true } }),
            prisma.placementRecord.groupBy({ by: ['studentId'] }),
            prisma.jobApplication.groupBy({
                by: ['status'],
                _count: { status: true }
            })
        ]);

        const statusCounts: Record<string, number> = {};
        applicationsByStatus.forEach(s => {
            statusCounts[s.status] = s._count.status;
        });

        const placedStudents = placedGroup.length;

        res.json({
            success: true,
            stats: {
                totalStudents,
                totalJobs,
                totalApplications,
                placedStudents,
                lockedProfiles,
                applicationsByStatus: statusCounts
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
};

export const listUsers = async (req: AuthRequest, res: Response) => {
    try {
        const { role, page = '1', limit = '20' } = req.query as Record<string, string>;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where: any = {};
        if (role) where.role = role;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: parseInt(limit),
                select: {
                    id: true, email: true, role: true, isDisabled: true, createdAt: true,
                    student: {
                        select: {
                            firstName: true, lastName: true, isLocked: true,
                            placementType: true, lockedReason: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.user.count({ where })
        ]);

        res.json({ success: true, users, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
};

export const disableUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const coordinatorId = req.user?.id;

        if (id === coordinatorId) {
            return res.status(400).json({ success: false, message: 'You cannot disable your own account.' });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const updated = await prisma.user.update({
            where: { id },
            data: { isDisabled: true },
            select: { id: true, email: true, role: true, isDisabled: true }
        });

        res.json({ success: true, message: `User ${user.email} has been disabled.`, user: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to disable user' });
    }
};

export const enableUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const updated = await prisma.user.update({
            where: { id },
            data: { isDisabled: false },
            select: { id: true, email: true, role: true, isDisabled: true }
        });

        res.json({ success: true, message: `User ${user.email} has been enabled.`, user: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to enable user' });
    }
};

export const getPendingSpocs = async (req: AuthRequest, res: Response) => {
    try {
        const spocs = await prisma.user.findMany({
            // Pending for coordinator = email-verified SPOCs that are not yet approved by coordinator.
            where: { role: 'SPOC', isVerified: true, verifiedAt: null },
            select: { id: true, email: true, createdAt: true, isDisabled: true, isVerified: true }
        });
        res.json({ success: true, spocs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch pending SPOCs' });
    }
};

export const getApprovedSpocs = async (req: AuthRequest, res: Response) => {
    try {
        const spocs = await prisma.user.findMany({
            where: { role: 'SPOC', isVerified: true, verifiedAt: { not: null } },
            select: {
                id: true, email: true, createdAt: true, isDisabled: true,
                verifiedAt: true, verifiedBy: { select: { email: true } },
                permJobCreate: true, permLockProfile: true, permExportCsv: true
            }
        });
        res.json({ success: true, spocs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch approved SPOCs' });
    }
};

export const approveSpoc = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const coordinatorId = req.user?.id;

        const spoc = await prisma.user.findUnique({ where: { id } });
        if (!spoc || spoc.role !== 'SPOC') return res.status(404).json({ success: false, message: 'SPOC not found' });
        if (!spoc.isVerified) {
            return res.status(400).json({ success: false, message: 'SPOC must complete email OTP verification first' });
        }
        if (spoc.verifiedAt) {
            return res.status(400).json({ success: false, message: 'SPOC is already approved' });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                isVerified: true,
                verifiedById: coordinatorId,
                verifiedAt: new Date(),
                // Keep all permissions disabled by default after approval.
                permJobCreate: false,
                permLockProfile: false,
                permExportCsv: false
            },
            select: { id: true, email: true, isVerified: true, permJobCreate: true, permLockProfile: true, permExportCsv: true }
        });

        res.json({ success: true, message: 'SPOC approved successfully', spoc: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to approve SPOC' });
    }
};

export const updateSpocPermissions = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { permJobCreate, permLockProfile, permExportCsv } = req.body;

        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...(permJobCreate !== undefined && { permJobCreate }),
                ...(permLockProfile !== undefined && { permLockProfile }),
                ...(permExportCsv !== undefined && { permExportCsv })
            },
            select: { id: true, email: true, permJobCreate: true, permLockProfile: true, permExportCsv: true }
        });

        res.json({ success: true, message: 'SPOC permissions updated', spoc: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update permissions' });
    }
};

export const overrideAction = async (req: AuthRequest, res: Response) => {
    try {
        const { spocId, actionType, entity, entityId, reason } = req.body;
        const coordinatorId = req.user?.id!;

        // Validate
        if (!actionType || !entity || !entityId) {
            return res.status(400).json({ success: false, message: 'Missing required override fields' });
        }

        // Action routing
        let originalValue = null;
        let overriddenValue = null;

        if (actionType === 'UNLOCK_STUDENT') {
            const studentIdToSearch = entity === 'Student' ? entityId : undefined;
            let lock;
            if (entity === 'Student') {
                // entityId may be a userId or studentId — try both
                lock = await prisma.profileLock.findFirst({ where: { student: { id: entityId }, isActive: true }, include: { student: true } });
                if (!lock) {
                    // Fallback: entityId might be a userId — look up student by userId
                    const stu = await prisma.student.findUnique({ where: { userId: entityId } });
                    if (stu) {
                        lock = await prisma.profileLock.findFirst({ where: { studentId: stu.id, isActive: true }, include: { student: true } });
                    }
                }
            } else {
                lock = await prisma.profileLock.findUnique({ where: { id: entityId }, include: { student: true } });
            }

            if (!lock || !lock.isActive) {
                return res.status(400).json({ success: false, message: 'Active lock not found' });
            }

            originalValue = { isActive: true, isLocked: true };
            overriddenValue = { isActive: false, isLocked: false };

            // Default SPOC ID to whoever locked it if not explicitly provided
            const resolvedSpocId = spocId || lock.lockedById;

            // Perform unlock
            await prisma.$transaction([
                prisma.profileLock.update({
                    where: { id: lock.id },
                    data: { isActive: false, unlockedById: coordinatorId, unlockedAt: new Date() }
                }),
                prisma.student.update({
                    where: { id: lock.studentId },
                    data: { isLocked: false, placementType: null, lockedReason: null }
                }),
                prisma.actionOverride.create({
                    data: {
                        coordinatorId,
                        spocId: resolvedSpocId,
                        actionType,
                        entity: 'ProfileLock',
                        entityId: lock.id,
                        originalValue: JSON.stringify(originalValue),
                        overriddenValue: JSON.stringify(overriddenValue),
                        reason: reason || 'Coordinator Override'
                    }
                })
            ]);
            return res.status(201).json({ success: true, message: 'Override executed successfully' });
        } else if (actionType === 'DELETE_JOB' && entity === 'Job') {
            const job = await prisma.job.findUnique({ where: { id: entityId } });
            if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

            originalValue = { status: job.status };
            overriddenValue = { status: 'DELETED' };

            // Just closed for audit via overriding
            await prisma.job.update({
                where: { id: entityId },
                data: { status: 'CLOSED' }
            });
        } else {
            return res.status(400).json({ success: false, message: 'Unsupported action type' });
        }

        // Log the override
        const override = await prisma.actionOverride.create({
            data: {
                coordinatorId,
                spocId,
                actionType,
                entity,
                entityId,
                originalValue: JSON.stringify(originalValue),
                overriddenValue: JSON.stringify(overriddenValue),
                reason
            }
        });

        res.status(201).json({ success: true, message: 'Override executed successfully', override });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to execute override' });
    }
};

export const listOverrides = async (req: AuthRequest, res: Response) => {
    try {
        const overrides = await prisma.actionOverride.findMany({
            include: {
                coordinator: { select: { email: true } },
                spoc: { select: { email: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, overrides });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch overrides' });
    }
};

export const revokeSpoc = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const spoc = await prisma.user.findUnique({ where: { id } });
        if (!spoc) return res.status(404).json({ success: false, message: 'SPOC not found' });
        if (spoc.role !== 'SPOC') return res.status(400).json({ success: false, message: 'Only SPOC accounts can be revoked here' });

        // Hard revoke: delete SPOC account and all related SPOC-owned data via relational cascades.
        await prisma.user.delete({ where: { id } });

        res.json({ success: true, message: 'SPOC revoked successfully. Account and related data deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to revoke SPOC' });
    }
};

export const rejectPendingSpoc = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const spoc = await prisma.user.findUnique({ where: { id } });
        if (!spoc || spoc.role !== 'SPOC') {
            return res.status(404).json({ success: false, message: 'SPOC not found' });
        }
        // Only pending entries can be rejected from pending queue.
        if (!spoc.isVerified || spoc.verifiedAt) {
            return res.status(400).json({ success: false, message: 'Only pending SPOC requests can be rejected' });
        }

        await prisma.user.delete({ where: { id } });
        return res.json({ success: true, message: 'Pending SPOC request rejected and account deleted.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to reject pending SPOC' });
    }
};
