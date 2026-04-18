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
import {
    getNotificationLogs,
    getSettings,
    updateSettings,
    getNotificationTemplates,
    upsertNotificationTemplate,
    publishPlacedStudentsWhatsApp,
    publishPlacedStudentsEmail,
    getEmailSettings,
    updateEmailSettings,
    getPlacementEmailTemplate,
    updatePlacementEmailTemplate,
} from '../controllers/notification.controller';

router.get('/admin/logs', requireRole(['COORDINATOR']), getNotificationLogs);
router.get('/admin/email/logs', requireRole(['COORDINATOR']), getNotificationLogs);
router.get('/admin/settings', requireRole(['COORDINATOR']), getSettings);
router.patch('/admin/settings', requireRole(['COORDINATOR']), updateSettings);
router.get('/admin/email/settings', requireRole(['COORDINATOR']), getEmailSettings);
router.patch('/admin/email/settings', requireRole(['COORDINATOR']), updateEmailSettings);
router.get('/admin/templates', requireRole(['COORDINATOR']), getNotificationTemplates);
router.put('/admin/templates/:type', requireRole(['COORDINATOR']), upsertNotificationTemplate);
router.get('/admin/email/template', requireRole(['COORDINATOR']), getPlacementEmailTemplate);
router.put('/admin/email/template', requireRole(['COORDINATOR']), updatePlacementEmailTemplate);
router.post('/job/:job_id/publish-placed', requireRole(['COORDINATOR', 'SPOC']), publishPlacedStudentsWhatsApp);
router.post('/job/:job_id/publish-placement-email', requireRole(['COORDINATOR', 'SPOC']), publishPlacedStudentsEmail);

export default router;
