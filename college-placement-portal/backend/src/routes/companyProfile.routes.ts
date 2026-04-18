import { Router } from 'express';
import { lookupCompaniesBatch, lookupCompany, suggestCompanies } from '../controllers/companyProfile.controller';
import { requireRole, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);
// Student job board needs logoUrl lookup. Autocomplete is still primarily used by SPOC/COORDINATOR.
router.get('/lookup', requireRole(['SPOC', 'COORDINATOR', 'STUDENT']), lookupCompany);
router.post('/lookup-batch', requireRole(['SPOC', 'COORDINATOR', 'STUDENT']), lookupCompaniesBatch);
router.get('/suggest', requireRole(['SPOC', 'COORDINATOR']), suggestCompanies);

export default router;

