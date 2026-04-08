import { Router } from 'express';
import { getSummary, getBranchComparison, getCompanyHistory, getPlacementTrends, getByYear, getByCompany, getByBranch, getBranchWiseCurrent, exportAnalyticsCsv } from '../controllers/analytics.controller';
import {
    exportDashboardCsv,
    getDashboardBranch,
    getDashboardCompany,
    getDashboardCtc,
    getDashboardOverview,
    getDashboardTrends,
} from '../controllers/analytics.dashboard.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Ensure all analytics metrics are securely exposed to authenticated users
// Can restrict to SPOC/COORDINATOR depending on permissions needed, defaults to at least active user/student dashboard potentially
router.use(verifyToken);

router.get('/summary', getSummary);
router.get('/branch-comparison', requireRole(['SPOC', 'COORDINATOR']), getBranchComparison);
router.get('/company-history/:companyName', requireRole(['SPOC', 'COORDINATOR']), getCompanyHistory);
router.get('/placement-trends', requireRole(['SPOC', 'COORDINATOR']), getPlacementTrends);

// AnalyticsPage endpoints (Module 12)
router.get('/by-year',   requireRole(['SPOC', 'COORDINATOR']), getByYear);
router.get('/by-company', requireRole(['SPOC', 'COORDINATOR']), getByCompany);
router.get('/by-branch',  requireRole(['SPOC', 'COORDINATOR']), getByBranch);
router.get('/branch-wise-current', requireRole(['SPOC', 'COORDINATOR']), getBranchWiseCurrent);
router.get('/export-csv', requireRole(['SPOC', 'COORDINATOR']), exportAnalyticsCsv);

// Decision dashboard (placement analytics)
router.get('/overview', requireRole(['SPOC', 'COORDINATOR']), getDashboardOverview);
router.get('/trends', requireRole(['SPOC', 'COORDINATOR']), getDashboardTrends);
router.get('/branch', requireRole(['SPOC', 'COORDINATOR']), getDashboardBranch);
router.get('/company', requireRole(['SPOC', 'COORDINATOR']), getDashboardCompany);
router.get('/ctc', requireRole(['SPOC', 'COORDINATOR']), getDashboardCtc);
router.get('/export-dashboard', requireRole(['SPOC', 'COORDINATOR']), exportDashboardCsv);

export default router;
