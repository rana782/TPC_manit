"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Ensure all analytics metrics are securely exposed to authenticated users
// Can restrict to SPOC/COORDINATOR depending on permissions needed, defaults to at least active user/student dashboard potentially
router.use(auth_middleware_1.verifyToken);
router.get('/summary', analytics_controller_1.getSummary);
router.get('/branch-comparison', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.getBranchComparison);
router.get('/company-history/:companyName', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.getCompanyHistory);
router.get('/placement-trends', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.getPlacementTrends);
// AnalyticsPage endpoints (Module 12)
router.get('/by-year', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.getByYear);
router.get('/by-company', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.getByCompany);
router.get('/by-branch', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.getByBranch);
router.get('/export-csv', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), analytics_controller_1.exportAnalyticsCsv);
exports.default = router;
