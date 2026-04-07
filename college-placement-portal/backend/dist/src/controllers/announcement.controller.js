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
exports.getAnnouncementLogs = exports.createAnnouncement = void 0;
const announcement_service_1 = require("../services/announcement.service");
const VALID_AUDIENCES = ['ALL', 'STUDENT', 'SPOC'];
// SPOC/COORDINATOR: trigger an announcement to Zapier
const createAnnouncement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const userEmail = (_b = req.user) === null || _b === void 0 ? void 0 : _b.email;
        if (!userId || !userEmail)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { title, body, audience = 'ALL' } = req.body;
        if (!title || !body) {
            return res.status(400).json({ success: false, message: 'title and body are required' });
        }
        if (!VALID_AUDIENCES.includes(audience)) {
            return res.status(400).json({ success: false, message: `audience must be one of: ${VALID_AUDIENCES.join(', ')}` });
        }
        // Fire-and-forget: respond immediately, service handles webhook async
        const record = yield (0, announcement_service_1.triggerAnnouncement)(userId, userEmail, title, body, audience);
        res.status(202).json({
            success: true,
            message: 'Announcement triggered and queued to Zapier',
            announcement: {
                id: record.id,
                title,
                body,
                audience,
                createdAt: record.createdAt
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create announcement' });
    }
});
exports.createAnnouncement = createAnnouncement;
// SPOC/COORDINATOR: view announcement log
const getAnnouncementLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const announcements = yield (0, announcement_service_1.listAnnouncements)();
        res.json({ success: true, announcements });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch announcement logs' });
    }
});
exports.getAnnouncementLogs = getAnnouncementLogs;
