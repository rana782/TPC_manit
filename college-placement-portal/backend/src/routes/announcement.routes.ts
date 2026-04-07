import { Router } from 'express';
import { createAnnouncement, getAnnouncementLogs } from '../controllers/announcement.controller';
import { publishAnnouncement, getLinkedInLogs, getLinkedInSettings, updateLinkedInSettings } from '../controllers/linkedin.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();
router.use(verifyToken);

// SPOC or COORDINATOR can create announcements
router.post('/', requireRole(['SPOC', 'COORDINATOR']), createAnnouncement);

// SPOC or COORDINATOR can view logs
router.get('/logs', requireRole(['SPOC', 'COORDINATOR']), getAnnouncementLogs);

// MODULE 11: LinkedIn / Zapier Placement Announcements
router.post('/job/:job_id/publish', requireRole(['COORDINATOR']), publishAnnouncement);
router.get('/linkedin/logs', requireRole(['COORDINATOR']), getLinkedInLogs);
router.get('/linkedin/settings', requireRole(['COORDINATOR']), getLinkedInSettings);
router.patch('/linkedin/settings', requireRole(['COORDINATOR']), updateLinkedInSettings);

export default router;
