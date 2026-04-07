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
exports.toggleProfileLock = exports.unplaceStudent = exports.listPlacedStudents = exports.getLockStatus = exports.unlockProfile = exports.lockProfile = exports.updateApplicationStatus = void 0;
const client_1 = require("@prisma/client");
const notification_service_1 = require("../services/notification.service");
const prisma = new client_1.PrismaClient();
// SPOC: Update application status — auto-locks student if ACCEPTED
const updateApplicationStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }
        const application = yield prisma.jobApplication.findUnique({
            where: { id },
            include: { job: { select: { title: true, company: true } }, student: true }
        });
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        // Update the application status
        const updated = yield prisma.jobApplication.update({
            where: { id },
            data: { status }
        });
        // Auto-lock if ACCEPTED (on-campus placement)
        if (status === 'ACCEPTED') {
            yield prisma.student.update({
                where: { id: application.studentId },
                data: {
                    isLocked: true,
                    lockedReason: `On-campus placed at ${application.job.company} — ${application.job.title}`,
                    placementType: 'ON_CAMPUS'
                }
            });
        }
        // Notification: inform the student about their status change
        (0, notification_service_1.enqueueAndSend)(application.student.userId, 'APPLICATION_STATUS_CHANGED', `Your application to ${application.job.title} at ${application.job.company} has been updated: ${status}.`).catch(() => { });
        res.json({ success: true, application: updated, autoLocked: status === 'ACCEPTED' });
    }
    catch (error) {
        if (error.code === 'P2025')
            return res.status(404).json({ success: false, message: 'Application not found' });
        res.status(500).json({ success: false, message: 'Failed to update application status' });
    }
});
exports.updateApplicationStatus = updateApplicationStatus;
// SPOC: Lock a student profile (cannot lock own user account)
const lockProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const spocUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'SPOC' && !((_c = req.user) === null || _c === void 0 ? void 0 : _c.permLockProfile)) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to lock profiles.' });
        }
        const { studentId } = req.params;
        const { reason, profileLocked = true } = req.body;
        const student = yield prisma.student.findUnique({ where: { id: studentId } });
        if (!student)
            return res.status(404).json({ success: false, message: 'Student not found' });
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
        const result = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const updatedStudent = yield tx.student.update({
                where: { id: studentId },
                data: {
                    isLocked: true,
                    lockedReason: reason || 'Locked by SPOC',
                    placementType: null
                }
            });
            yield tx.profileLock.create({
                data: {
                    studentId,
                    profileLocked: true,
                    lockedById: spocUserId,
                    reason: reason || 'Locked by SPOC',
                    isActive: true
                }
            });
            return updatedStudent;
        }));
        (0, notification_service_1.enqueueAndSend)(student.userId, 'PROFILE_LOCKED', `Your placement profile has been locked. Reason: ${result.lockedReason}. Contact your coordinator if this is an error.`).catch(() => { });
        res.json({ success: true, message: 'Student profile locked', student: result });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to lock profile' });
    }
});
exports.lockProfile = lockProfile;
// COORDINATOR ONLY: Unlock any student profile (override)
const unlockProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const student = yield prisma.student.findUnique({ where: { id: studentId } });
        if (!student)
            return res.status(404).json({ success: false, message: 'Student not found' });
        const updated = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const up = yield tx.student.update({
                where: { id: studentId },
                data: {
                    isLocked: false,
                    lockedReason: null,
                    placementType: null
                }
            });
            yield tx.profileLock.updateMany({
                where: { studentId, isActive: true },
                data: {
                    isActive: false,
                    unlockedById: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id,
                    unlockedAt: new Date()
                }
            });
            return up;
        }));
        // Notification: tell the student their profile has been unlocked
        (0, notification_service_1.enqueueAndSend)(student.userId, 'PROFILE_UNLOCKED', `Your placement profile has been unlocked by a Coordinator. You are now eligible to apply to new jobs.`).catch(() => { });
        res.json({ success: true, message: 'Student profile unlocked by Coordinator override', student: updated });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to unlock profile' });
    }
});
exports.unlockProfile = unlockProfile;
// Any authenticated role: Check lock status of a student
const getLockStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const student = yield prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, firstName: true, lastName: true, isLocked: true, lockedReason: true, placementType: true }
        });
        if (!student)
            return res.status(404).json({ success: false, message: 'Student not found' });
        res.json({ success: true, student });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch lock status' });
    }
});
exports.getLockStatus = getLockStatus;
// SPOC/COORDINATOR: list currently placed students
const listPlacedStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const placements = yield prisma.placementRecord.findMany({
            orderBy: { placedAt: 'desc' },
            include: {
                student: {
                    include: {
                        user: { select: { email: true } }
                    }
                }
            }
        });
        const data = placements.map((p) => {
            var _a;
            return ({
                id: p.student.id,
                placementRecordId: p.id,
                name: `${p.student.firstName || ''} ${p.student.lastName || ''}`.trim(),
                branch: p.student.branch || 'N/A',
                companyName: p.companyName,
                role: p.role,
                placedAt: p.placedAt,
                isLocked: p.student.isLocked,
                email: ((_a = p.student.user) === null || _a === void 0 ? void 0 : _a.email) || ''
            });
        });
        const placedIds = new Set(data.map((d) => d.id));
        const lockedWithoutPlacement = yield prisma.student.findMany({
            where: { isLocked: true, id: { notIn: Array.from(placedIds) } },
            include: { user: { select: { email: true } } },
            orderBy: { updatedAt: 'desc' }
        });
        const fallbackRows = lockedWithoutPlacement.map((s) => {
            var _a;
            return ({
                id: s.id,
                placementRecordId: `LOCKED_${s.id}`,
                name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
                branch: s.branch || 'N/A',
                companyName: 'N/A',
                role: 'Locked profile',
                placedAt: s.updatedAt,
                isLocked: s.isLocked,
                email: ((_a = s.user) === null || _a === void 0 ? void 0 : _a.email) || ''
            });
        });
        res.json({ success: true, students: [...data, ...fallbackRows] });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch placed students', error: error === null || error === void 0 ? void 0 : error.message });
    }
});
exports.listPlacedStudents = listPlacedStudents;
// SPOC/COORDINATOR: mark a placed student as unplaced
const unplaceStudent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { studentId } = req.params;
        const actorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!actorId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const student = yield prisma.student.findUnique({ where: { id: studentId } });
        if (!student)
            return res.status(404).json({ success: false, message: 'Student not found' });
        const placementCount = yield prisma.placementRecord.count({ where: { studentId } });
        if (!student.isLocked && placementCount === 0) {
            return res.status(400).json({ success: false, message: 'Student is already unplaced' });
        }
        const result = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const updatedStudent = yield tx.student.update({
                where: { id: studentId },
                data: {
                    isLocked: false,
                    lockedReason: null,
                    placementType: null
                }
            });
            const closedLocks = yield tx.profileLock.updateMany({
                where: { studentId, isActive: true },
                data: {
                    isActive: false,
                    unlockedById: actorId,
                    unlockedAt: new Date()
                }
            });
            const removedPlacements = yield tx.placementRecord.deleteMany({
                where: { studentId }
            });
            yield tx.jobApplication.updateMany({
                where: { studentId, status: 'PLACED' },
                data: { status: 'REVIEWING' }
            });
            return {
                student: updatedStudent,
                closedLocks: closedLocks.count,
                removedPlacements: removedPlacements.count
            };
        }));
        (0, notification_service_1.enqueueAndSend)(student.userId, 'PROFILE_UNLOCKED', 'Your placed status has been reverted by placement administration. You can apply to jobs again.').catch(() => { });
        res.json(Object.assign({ success: true, message: 'Student marked as unplaced' }, result));
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to unplace student', error: error === null || error === void 0 ? void 0 : error.message });
    }
});
exports.unplaceStudent = unplaceStudent;
// Toggle a specific student's lock status
const toggleProfileLock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const { locked, reason } = req.body;
        const student = yield prisma.student.findUnique({
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
            (0, notification_service_1.enqueueAndSend)(student.userId, 'PROFILE_LOCKED', `Your profile has been locked by a placement coordinator. Reason: ${explicitReason || 'No reason provided'}. You are debarred from applying to new jobs.`).catch(() => { });
        }
        else {
            (0, notification_service_1.enqueueAndSend)(student.userId, 'PROFILE_UNLOCKED', `Your placement profile has been unlocked by a Coordinator. You are now eligible to apply to new jobs.`).catch(() => { });
        }
        const updated = yield prisma.student.update({
            where: { id: studentId },
            data: {
                isLocked: locked,
                lockedReason: locked ? explicitReason : null,
                placementType: locked ? 'ON_CAMPUS' : null // Assuming manual lock implies on-campus for now
            }
        });
        res.json({ success: true, message: `Student profile ${locked ? 'locked' : 'unlocked'}`, student: updated });
    }
    catch (err) {
        res.status(500).json({ success: false, message: 'Failed to toggle profile lock', error: err.message });
    }
});
exports.toggleProfileLock = toggleProfileLock;
