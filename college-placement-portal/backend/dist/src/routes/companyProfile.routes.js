"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companyProfile_controller_1 = require("../controllers/companyProfile.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// Student job board needs logoUrl lookup. Autocomplete is still primarily used by SPOC/COORDINATOR.
router.get('/lookup', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR', 'STUDENT']), companyProfile_controller_1.lookupCompany);
router.get('/suggest', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), companyProfile_controller_1.suggestCompanies);
exports.default = router;
