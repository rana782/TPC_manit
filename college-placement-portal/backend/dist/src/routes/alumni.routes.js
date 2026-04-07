"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRouter = void 0;
const express_1 = require("express");
const alumni_controller_1 = require("../controllers/alumni.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// Accessible by all users
router.get('/company/:companyName', alumni_controller_1.getAlumniByCompany);
// Coordinator & SPOC specific export mechanism
exports.exportRouter = (0, express_1.Router)();
exports.exportRouter.use(auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']));
exports.exportRouter.get('/placed', alumni_controller_1.exportPlacedCsv);
exports.default = router;
