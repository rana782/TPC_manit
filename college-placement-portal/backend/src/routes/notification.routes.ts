import { Router } from 'express';
import { getMyNotifications, sendTemplateNotification } from '../controllers/notification.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// Any authenticated user can see their own notifications
router.get('/', getMyNotifications);

// SPOC or COORDINATOR can send a template notification to any user
router.post('/send', requireRole(['SPOC', 'COORDINATOR']), sendTemplateNotification);

// Admin routes (COORDINATOR only)
import { getNotificationLogs, getSettings, updateSettings } from '../controllers/notification.controller';

router.get('/admin/logs', requireRole(['COORDINATOR']), getNotificationLogs);
router.get('/admin/settings', requireRole(['COORDINATOR']), getSettings);
router.patch('/admin/settings', requireRole(['COORDINATOR']), updateSettings);

export default router;
