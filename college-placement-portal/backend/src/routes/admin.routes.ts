import { Router } from 'express';
import { getStats, listUsers, disableUser, enableUser } from '../controllers/admin.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// All admin routes require Coordinator role
router.use(verifyToken);
router.use(requireRole(['COORDINATOR']));

import { getPendingSpocs, getApprovedSpocs, approveSpoc, updateSpocPermissions, overrideAction, listOverrides, revokeSpoc } from '../controllers/admin.controller';

router.get('/stats', getStats);
router.get('/users', listUsers);
router.patch('/users/:id/disable', disableUser);
router.patch('/users/:id/enable', enableUser);

// SPOC Management Routes
router.get('/spocs/pending', getPendingSpocs);
router.get('/spocs/approved', getApprovedSpocs);
router.patch('/spocs/:id/approve', approveSpoc);
router.post('/spocs/:id/revoke', revokeSpoc);
router.patch('/spocs/:id/permissions', updateSpocPermissions);

// Overrides
router.get('/overrides', listOverrides);
router.post('/overrides', overrideAction);

export default router;
