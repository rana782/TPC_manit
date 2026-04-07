"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const profileLock_controller_1 = require("../controllers/profileLock.controller");
const profileLock_controller_2 = require("../controllers/profileLock.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// Any authenticated role can check lock status
router.get('/placed', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), profileLock_controller_1.listPlacedStudents);
router.get('/:studentId', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR', 'STUDENT']), profileLock_controller_1.getLockStatus);
// SPOC: lock a student profile (self-lock protection is inside controller)
router.post('/:studentId/lock', (0, auth_middleware_1.requireRole)(['SPOC']), profileLock_controller_1.lockProfile);
// SPOC/COORDINATOR: unlock profile
router.post('/:studentId/unlock', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), profileLock_controller_1.unlockProfile);
router.put('/:studentId/unplace', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), profileLock_controller_1.unplaceStudent);
// SPOC: update application status (triggers auto-lock on ACCEPTED)
router.patch('/applications/:id/status', (0, auth_middleware_1.requireRole)(['SPOC']), profileLock_controller_2.updateApplicationStatus);
exports.default = router;
