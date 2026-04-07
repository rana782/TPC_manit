"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const application_controller_1 = require("../controllers/application.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Must be a logged in STUDENT to apply and view own apps
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['STUDENT']));
router.post('/', application_controller_1.applyForJob);
router.put('/:id/withdraw', application_controller_1.withdrawApplication);
router.get('/', application_controller_1.getMyApplications);
// Compatibility alias for clients expecting /applications/student
router.get('/student', application_controller_1.getMyApplications);
exports.default = router;
