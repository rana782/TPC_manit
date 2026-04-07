"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const announcement_controller_1 = require("../controllers/announcement.controller");
const linkedin_controller_1 = require("../controllers/linkedin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// SPOC or COORDINATOR can create announcements
router.post('/', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), announcement_controller_1.createAnnouncement);
// SPOC or COORDINATOR can view logs
router.get('/logs', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), announcement_controller_1.getAnnouncementLogs);
// MODULE 11: LinkedIn / Zapier Placement Announcements
router.post('/job/:job_id/publish', (0, auth_middleware_1.requireRole)(['COORDINATOR']), linkedin_controller_1.publishAnnouncement);
router.get('/linkedin/logs', (0, auth_middleware_1.requireRole)(['COORDINATOR']), linkedin_controller_1.getLinkedInLogs);
router.get('/linkedin/settings', (0, auth_middleware_1.requireRole)(['COORDINATOR']), linkedin_controller_1.getLinkedInSettings);
router.patch('/linkedin/settings', (0, auth_middleware_1.requireRole)(['COORDINATOR']), linkedin_controller_1.updateLinkedInSettings);
exports.default = router;
