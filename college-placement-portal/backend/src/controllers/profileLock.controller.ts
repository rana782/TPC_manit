// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth.middleware';
import { enqueueAndSend } from '../services/notification.service';

const prisma = new PrismaClient();

// SPOC: Update application status — auto-locks student if ACCEPTED
export const updateApplicationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const application = await prisma.jobApplication.findUnique({
            where: { id },
            include: { job: { select: { title: true, company: true } }, student: true }
        });

        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }

        // Update the application status
        const updated = await prisma.jobApplication.update({
            where: { id },
            data: { status }
        });

        // Auto-lock if ACCEPTED (on-campus placement)
        if (status === 'ACCEPTED') {
            await prisma.student.update({
                where: { id: application.studentId },
                data: {
                    isLocked: true,
                    lockedReason: `On-campus placed at ${application.job.company} — ${application.job.title}`,
                    placementType: 'ON_CAMPUS'
                }
            });
        }

        // Notification: inform the student about their status change
        enqueueAndSend(
            application.student.userId,
            'APPLICATION_STATUS_CHANGED',
            `Your application to ${application.job.title} at ${application.job.company} has been updated: ${status}.`
        ).catch(() => { });

        res.json({ success: true, application: updated, autoLocked: status === 'ACCEPTED' });
    } catch (error: any) {
        if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Application not found' });
        res.status(500).json({ success: false, message: 'Failed to update application status' });
    }
};

// SPOC: Lock a student profile (cannot lock own user account)
export const lockProfile = async (req: AuthRequest, res: Response) => {
    try {
        const spocUserId = req.user?.id;
        if (req.user?.role === 'SPOC' && !req.user?.permLockProfile) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to lock profiles.' });
        }
        const { studentId } = req.params;
        const { reason, profileLocked = true } = req.body;

        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        // Prevent SPOC self-lock
        if (student.userId === spocUserId) {
            return res.status(403).json({ success: false, message: 'You cannot lock your own profile.' });
        }

        if (profileLocked !== true) {
            return res.status(400).json({ success: false, message: 'profileLocked must be true for lock action.' });
        }

        if (student.isLocked) {
            return res.status(400).json({ success: false, message: 'Student is already locked.' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedStudent = await tx.student.update({
                where: { id: studentId },
                data: {
                    isLocked: true,
                    lockedReason: reason || 'Locked by SPOC',
                    placementType: null
                }
            });

            await tx.profileLock.create({
                data: {
                    studentId,
                    profileLocked: true,
                    lockedById: spocUserId!,
                    reason: reason || 'Locked by SPOC',
                    isActive: true
                }
            });

            return updatedStudent;
        });

        enqueueAndSend(
            student.userId,
            'PROFILE_LOCKED',
            `Your placement profile has been locked. Reason: ${result.lockedReason}. Contact your coordinator if this is an error.`
        ).catch(() => { });

        res.json({ success: true, message: 'Student profile locked', student: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to lock profile' });
    }
};

// COORDINATOR ONLY: Unlock any student profile (override)
export const unlockProfile = async (req: AuthRequest, res: Response) => {
    try {
        const { studentId } = req.params;

        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const updated = await prisma.$transaction(async (tx) => {
            const up = await tx.student.update({
                where: { id: studentId },
                data: {
                    isLocked: false,
                    lockedReason: null,
                    placementType: null
                }
            });

            await tx.profileLock.updateMany({
                where: { studentId, isActive: true },
                data: {
                    isActive: false,
                    unlockedById: req.user?.id,
                    unlockedAt: new Date()
                }
            });

            return up;
        });

        // Notification: tell the student their profile has been unlocked
        enqueueAndSend(
            student.userId,
            'PROFILE_UNLOCKED',
            `Your placement profile has been unlocked by a Coordinator. You are now eligible to apply to new jobs.`
        ).catch(() => { });

        res.json({ success: true, message: 'Student profile unlocked by Coordinator override', student: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to unlock profile' });
    }
};

// Any authenticated role: Check lock status of a student
export const getLockStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { studentId } = req.params;
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, firstName: true, lastName: true, isLocked: true, lockedReason: true, placementType: true }
        });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
        res.json({ success: true, student });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch lock status' });
    }
};

// SPOC/COORDINATOR: list currently placed students
export const listPlacedStudents = async (req: AuthRequest, res: Response) => {
    try {
        const placements = await prisma.placementRecord.findMany({
            orderBy: { placedAt: 'desc' },
            include: {
                student: {
                    include: {
                        user: { select: { email: true } }
                    }
                }
            }
        });

        const data = placements.map((p) => ({
            id: p.student.id,
            placementRecordId: p.id,
            name: `${p.student.firstName || ''} ${p.student.lastName || ''}`.trim(),
            branch: p.student.branch || 'N/A',
            companyName: p.companyName,
            role: p.role,
            placedAt: p.placedAt,
            isLocked: p.student.isLocked,
            email: p.student.user?.email || ''
        }));

        const placedIds = new Set(data.map((d) => d.id));
        const lockedWithoutPlacement = await prisma.student.findMany({
            where: { isLocked: true, id: { notIn: Array.from(placedIds) } },
            include: { user: { select: { email: true } } },
            orderBy: { updatedAt: 'desc' }
        });

        const fallbackRows = lockedWithoutPlacement.map((s) => ({
            id: s.id,
            placementRecordId: `LOCKED_${s.id}`,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            branch: s.branch || 'N/A',
            companyName: 'N/A',
            role: 'Locked profile',
            placedAt: s.updatedAt,
            isLocked: s.isLocked,
            email: s.user?.email || ''
        }));

        res.json({ success: true, students: [...data, ...fallbackRows] });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Failed to fetch placed students', error: error?.message });
    }
};

// SPOC/COORDINATOR: mark a placed student as unplaced
export const unplaceStudent = async (req: AuthRequest, res: Response) => {
    try {
        const { studentId } = req.params;
        const actorId = req.user?.id;
        if (!actorId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const placementCount = await prisma.placementRecord.count({ where: { studentId } });
        if (!student.isLocked && placementCount === 0) {
            return res.status(400).json({ success: false, message: 'Student is already unplaced' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedStudent = await tx.student.update({
                where: { id: studentId },
                data: {
                    isLocked: false,
                    lockedReason: null,
                    placementType: null
                }
            });

            const closedLocks = await tx.profileLock.updateMany({
                where: { studentId, isActive: true },
                data: {
                    isActive: false,
                    unlockedById: actorId,
                    unlockedAt: new Date()
                }
            });

            const removedPlacements = await tx.placementRecord.deleteMany({
                where: { studentId }
            });

            await tx.jobApplication.updateMany({
                where: { studentId, status: 'PLACED' },
                data: { status: 'REVIEWING' }
            });

            return {
                student: updatedStudent,
                closedLocks: closedLocks.count,
                removedPlacements: removedPlacements.count
            };
        });

        enqueueAndSend(
            student.userId,
            'PROFILE_UNLOCKED',
            'Your placed status has been reverted by placement administration. You can apply to jobs again.'
        ).catch(() => { });

        res.json({
            success: true,
            message: 'Student marked as unplaced',
            ...result
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Failed to unplace student', error: error?.message });
    }
};

// Toggle a specific student's lock status
export const toggleProfileLock = async (req: AuthRequest, res: Response) => {
    try {
        const { studentId } = req.params;
        const { locked, reason } = req.body;

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: { user: true, applications: { include: { job: true }, where: { status: 'ACCEPTED' } } }
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        let explicitReason = reason;
        if (locked && !explicitReason && student.applications.length > 0) {
            const acceptedJob = student.applications[0].job;
            explicitReason = `Placed at ${acceptedJob.companyName} as ${acceptedJob.role}`;
        }

        // This part of the provided snippet seems to be from a different context,
        // possibly a batch lock or a different notification structure.
        // I'm including the notification string as requested, but adapting it
        // to the existing `enqueueAndSend` signature for a single student.
        if (locked) {
            enqueueAndSend(
                student.userId,
                'PROFILE_LOCKED',
                `Your profile has been locked by a placement coordinator. Reason: ${explicitReason || 'No reason provided'}. You are debarred from applying to new jobs.`
            ).catch(() => { });
        } else {
            enqueueAndSend(
                student.userId,
                'PROFILE_UNLOCKED',
                `Your placement profile has been unlocked by a Coordinator. You are now eligible to apply to new jobs.`
            ).catch(() => { });
        }

        const updated = await prisma.student.update({
            where: { id: studentId },
            data: {
                isLocked: locked,
                lockedReason: locked ? explicitReason : null,
                placementType: locked ? 'ON_CAMPUS' : null // Assuming manual lock implies on-campus for now
            }
        });

        res.json({ success: true, message: `Student profile ${locked ? 'locked' : 'unlocked'}`, student: updated });
    } catch (err: any) {
        res.status(500).json({ success: false, message: 'Failed to toggle profile lock', error: err.message });
    }
};
