"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ats_controller_1 = require("../controllers/ats.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// Single resume vs one job
router.post('/score', ats_controller_1.scoreHandler);
// Standalone resume ATS score (no job)
router.post('/score-absolute', ats_controller_1.absoluteScoreHandler);
// All student resumes vs one job (for resume picker)
router.post('/batch-score', ats_controller_1.batchScoreHandler);
// Admin / Coordinator tuning
router.get('/config', (0, auth_middleware_1.requireRole)(['COORDINATOR', 'SPOC']), ats_controller_1.getConfig);
router.put('/config', (0, auth_middleware_1.requireRole)(['COORDINATOR']), ats_controller_1.updateConfig);
exports.default = router;
