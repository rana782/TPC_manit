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
exports.revokeSpoc = exports.listOverrides = exports.overrideAction = exports.updateSpocPermissions = exports.approveSpoc = exports.getApprovedSpocs = exports.getPendingSpocs = exports.enableUser = exports.disableUser = exports.listUsers = exports.getStats = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [totalStudents, totalJobs, totalApplications, lockedProfiles, placedGroup, applicationsByStatus] = yield Promise.all([
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
        const statusCounts = {};
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});
exports.getStats = getStats;
const listUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { role, page = '1', limit = '20' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = {};
        if (role)
            where.role = role;
        const [users, total] = yield Promise.all([
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
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});
exports.listUsers = listUsers;
const disableUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const coordinatorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (id === coordinatorId) {
            return res.status(400).json({ success: false, message: 'You cannot disable your own account.' });
        }
        const user = yield prisma.user.findUnique({ where: { id } });
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });
        const updated = yield prisma.user.update({
            where: { id },
            data: { isDisabled: true },
            select: { id: true, email: true, role: true, isDisabled: true }
        });
        res.json({ success: true, message: `User ${user.email} has been disabled.`, user: updated });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to disable user' });
    }
});
exports.disableUser = disableUser;
const enableUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const user = yield prisma.user.findUnique({ where: { id } });
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found' });
        const updated = yield prisma.user.update({
            where: { id },
            data: { isDisabled: false },
            select: { id: true, email: true, role: true, isDisabled: true }
        });
        res.json({ success: true, message: `User ${user.email} has been enabled.`, user: updated });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to enable user' });
    }
});
exports.enableUser = enableUser;
const getPendingSpocs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const spocs = yield prisma.user.findMany({
            where: { role: 'SPOC', isVerified: false },
            select: { id: true, email: true, createdAt: true, isDisabled: true }
        });
        res.json({ success: true, spocs });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch pending SPOCs' });
    }
});
exports.getPendingSpocs = getPendingSpocs;
const getApprovedSpocs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const spocs = yield prisma.user.findMany({
            where: { role: 'SPOC', isVerified: true },
            select: {
                id: true, email: true, createdAt: true, isDisabled: true,
                verifiedAt: true, verifiedBy: { select: { email: true } },
                permJobCreate: true, permLockProfile: true, permExportCsv: true
            }
        });
        res.json({ success: true, spocs });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch approved SPOCs' });
    }
});
exports.getApprovedSpocs = getApprovedSpocs;
const approveSpoc = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const coordinatorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const spoc = yield prisma.user.findUnique({ where: { id, role: 'SPOC' } });
        if (!spoc)
            return res.status(404).json({ success: false, message: 'SPOC not found' });
        if (spoc.isVerified)
            return res.status(400).json({ success: false, message: 'SPOC is already verified' });
        const updated = yield prisma.user.update({
            where: { id },
            data: {
                isVerified: true,
                verifiedById: coordinatorId,
                verifiedAt: new Date(),
                permJobCreate: true, // Default true on approve
                permLockProfile: false, // Default false
                permExportCsv: true // Default true
            },
            select: { id: true, email: true, isVerified: true, permJobCreate: true, permLockProfile: true, permExportCsv: true }
        });
        res.json({ success: true, message: 'SPOC approved successfully', spoc: updated });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to approve SPOC' });
    }
});
exports.approveSpoc = approveSpoc;
const updateSpocPermissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { permJobCreate, permLockProfile, permExportCsv } = req.body;
        const updated = yield prisma.user.update({
            where: { id },
            data: Object.assign(Object.assign(Object.assign({}, (permJobCreate !== undefined && { permJobCreate })), (permLockProfile !== undefined && { permLockProfile })), (permExportCsv !== undefined && { permExportCsv })),
            select: { id: true, email: true, permJobCreate: true, permLockProfile: true, permExportCsv: true }
        });
        res.json({ success: true, message: 'SPOC permissions updated', spoc: updated });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update permissions' });
    }
});
exports.updateSpocPermissions = updateSpocPermissions;
const overrideAction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { spocId, actionType, entity, entityId, reason } = req.body;
        const coordinatorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
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
                lock = yield prisma.profileLock.findFirst({ where: { student: { id: entityId }, isActive: true }, include: { student: true } });
                if (!lock) {
                    // Fallback: entityId might be a userId — look up student by userId
                    const stu = yield prisma.student.findUnique({ where: { userId: entityId } });
                    if (stu) {
                        lock = yield prisma.profileLock.findFirst({ where: { studentId: stu.id, isActive: true }, include: { student: true } });
                    }
                }
            }
            else {
                lock = yield prisma.profileLock.findUnique({ where: { id: entityId }, include: { student: true } });
            }
            if (!lock || !lock.isActive) {
                return res.status(400).json({ success: false, message: 'Active lock not found' });
            }
            originalValue = { isActive: true, isLocked: true };
            overriddenValue = { isActive: false, isLocked: false };
            // Default SPOC ID to whoever locked it if not explicitly provided
            const resolvedSpocId = spocId || lock.lockedById;
            // Perform unlock
            yield prisma.$transaction([
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
        }
        else if (actionType === 'DELETE_JOB' && entity === 'Job') {
            const job = yield prisma.job.findUnique({ where: { id: entityId } });
            if (!job)
                return res.status(404).json({ success: false, message: 'Job not found' });
            originalValue = { status: job.status };
            overriddenValue = { status: 'DELETED' };
            // Just closed for audit via overriding
            yield prisma.job.update({
                where: { id: entityId },
                data: { status: 'CLOSED' }
            });
        }
        else {
            return res.status(400).json({ success: false, message: 'Unsupported action type' });
        }
        // Log the override
        const override = yield prisma.actionOverride.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to execute override' });
    }
});
exports.overrideAction = overrideAction;
const listOverrides = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const overrides = yield prisma.actionOverride.findMany({
            include: {
                coordinator: { select: { email: true } },
                spoc: { select: { email: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, overrides });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch overrides' });
    }
});
exports.listOverrides = listOverrides;
const revokeSpoc = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const spoc = yield prisma.user.findUnique({ where: { id, role: 'SPOC' } });
        if (!spoc)
            return res.status(404).json({ success: false, message: 'SPOC not found' });
        yield prisma.user.update({
            where: { id },
            data: {
                isVerified: false,
                permLockProfile: false,
                permJobCreate: false,
                permExportCsv: false
            }
        });
        res.json({ success: true, message: 'SPOC permissions revoked and status set to unverified.' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to revoke SPOC' });
    }
});
exports.revokeSpoc = revokeSpoc;
