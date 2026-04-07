import { Router } from 'express';
import { lockProfile, unlockProfile, getLockStatus, listPlacedStudents, unplaceStudent } from '../controllers/profileLock.controller';
import { updateApplicationStatus } from '../controllers/profileLock.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// Any authenticated role can check lock status
router.get('/placed', requireRole(['SPOC', 'COORDINATOR']), listPlacedStudents);
router.get('/:studentId', requireRole(['SPOC', 'COORDINATOR', 'STUDENT']), getLockStatus);

// SPOC: lock a student profile (self-lock protection is inside controller)
router.post('/:studentId/lock', requireRole(['SPOC']), lockProfile);

// SPOC/COORDINATOR: unlock profile
router.post('/:studentId/unlock', requireRole(['SPOC', 'COORDINATOR']), unlockProfile);
router.put('/:studentId/unplace', requireRole(['SPOC', 'COORDINATOR']), unplaceStudent);

// SPOC: update application status (triggers auto-lock on ACCEPTED)
router.patch('/applications/:id/status', requireRole(['SPOC']), updateApplicationStatus);

export default router;
