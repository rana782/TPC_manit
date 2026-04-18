import { Router } from 'express';
import { getAlumniByCompany, searchAlumni, exportPlacedCsv, exportAlumniFilteredCsv } from '../controllers/alumni.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();
router.use(verifyToken);

// Accessible by all users
router.get('/search', searchAlumni);
router.get('/company/:companyName', getAlumniByCompany);
router.get('/export', exportAlumniFilteredCsv);

// Coordinator & SPOC specific export mechanism
export const exportRouter = Router();
exportRouter.use(verifyToken, requireRole(['SPOC', 'COORDINATOR']));
exportRouter.get('/placed', exportPlacedCsv);

export default router;
