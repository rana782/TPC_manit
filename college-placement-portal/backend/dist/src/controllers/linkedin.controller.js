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
exports.updateLinkedInSettings = exports.getLinkedInSettings = exports.getLinkedInLogs = exports.publishAnnouncement = void 0;
const client_1 = require("@prisma/client");
const linkedin_service_1 = require("../services/linkedin.service");
const prisma = new client_1.PrismaClient();
// POST /api/announcements/job/:job_id/publish
const publishAnnouncement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { job_id } = req.params;
        const coordinatorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!coordinatorId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const result = yield (0, linkedin_service_1.publishLinkedInAnnouncement)(job_id, coordinatorId);
        return res.status(201).json({
            success: true,
            message: result.log.zapStatus === 'SUCCESS'
                ? 'Announcement published to LinkedIn via Zapier.'
                : result.log.zapStatus === 'MOCKED'
                    ? 'Announcement logged (Zapier disabled/mocked).'
                    : 'Announcement attempted but Zapier returned an error.',
            log: result.log
        });
    }
    catch (error) {
        console.error('[LINKEDIN-CONTROLLER] Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to publish announcement' });
    }
});
exports.publishAnnouncement = publishAnnouncement;
// GET /api/announcements/linkedin/logs
const getLinkedInLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const logs = yield prisma.placementAnnouncementLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                postedBy: { select: { email: true } },
                job: { select: { role: true, companyName: true } }
            }
        });
        return res.json({ success: true, logs });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch LinkedIn announcement logs' });
    }
});
exports.getLinkedInLogs = getLinkedInLogs;
// GET /api/announcements/linkedin/settings
const getLinkedInSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let setting = yield prisma.systemSetting.findUnique({ where: { key: 'ZAPIER_LINKEDIN_ENABLED' } });
        if (!setting) {
            setting = yield prisma.systemSetting.create({
                data: { key: 'ZAPIER_LINKEDIN_ENABLED', value: process.env.ZAPIER_LINKEDIN_ENABLED || 'false' }
            });
        }
        return res.json({ success: true, setting });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch LinkedIn settings' });
    }
});
exports.getLinkedInSettings = getLinkedInSettings;
// PATCH /api/announcements/linkedin/settings
const updateLinkedInSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enabled } = req.body;
        const setting = yield prisma.systemSetting.upsert({
            where: { key: 'ZAPIER_LINKEDIN_ENABLED' },
            create: { key: 'ZAPIER_LINKEDIN_ENABLED', value: String(enabled) },
            update: { value: String(enabled) }
        });
        return res.json({ success: true, message: 'LinkedIn settings updated', setting });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update LinkedIn settings' });
    }
});
exports.updateLinkedInSettings = updateLinkedInSettings;
