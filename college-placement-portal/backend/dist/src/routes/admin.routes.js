"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// All admin routes require Coordinator role
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['COORDINATOR']));
const admin_controller_2 = require("../controllers/admin.controller");
router.get('/stats', admin_controller_1.getStats);
router.get('/users', admin_controller_1.listUsers);
router.patch('/users/:id/disable', admin_controller_1.disableUser);
router.patch('/users/:id/enable', admin_controller_1.enableUser);
// SPOC Management Routes
router.get('/spocs/pending', admin_controller_2.getPendingSpocs);
router.get('/spocs/approved', admin_controller_2.getApprovedSpocs);
router.patch('/spocs/:id/approve', admin_controller_2.approveSpoc);
router.post('/spocs/:id/revoke', admin_controller_2.revokeSpoc);
router.patch('/spocs/:id/permissions', admin_controller_2.updateSpocPermissions);
// Overrides
router.get('/overrides', admin_controller_2.listOverrides);
router.post('/overrides', admin_controller_2.overrideAction);
exports.default = router;
