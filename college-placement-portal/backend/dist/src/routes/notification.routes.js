"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// Any authenticated user can see their own notifications
router.get('/', notification_controller_1.getMyNotifications);
// SPOC or COORDINATOR can send a template notification to any user
router.post('/send', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), notification_controller_1.sendTemplateNotification);
// Admin routes (COORDINATOR only)
const notification_controller_2 = require("../controllers/notification.controller");
router.get('/admin/logs', (0, auth_middleware_1.requireRole)(['COORDINATOR']), notification_controller_2.getNotificationLogs);
router.get('/admin/settings', (0, auth_middleware_1.requireRole)(['COORDINATOR']), notification_controller_2.getSettings);
router.patch('/admin/settings', (0, auth_middleware_1.requireRole)(['COORDINATOR']), notification_controller_2.updateSettings);
exports.default = router;
