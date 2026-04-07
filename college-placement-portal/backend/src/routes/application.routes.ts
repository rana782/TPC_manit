import { Router } from 'express';
import { applyForJob, getMyApplications, withdrawApplication } from '../controllers/application.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Must be a logged in STUDENT to apply and view own apps
router.use(verifyToken);
router.use(requireRole(['STUDENT']));

router.post('/', applyForJob);
router.put('/:id/withdraw', withdrawApplication);
router.get('/', getMyApplications);
// Compatibility alias for clients expecting /applications/student
router.get('/student', getMyApplications);

export default router;
