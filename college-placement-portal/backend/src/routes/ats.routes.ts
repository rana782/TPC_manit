import { Router } from 'express';
import { scoreHandler, absoluteScoreHandler, batchScoreHandler, getConfig, updateConfig } from '../controllers/ats.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// Single resume vs one job
router.post('/score', scoreHandler);

// Standalone resume ATS score (no job)
router.post('/score-absolute', absoluteScoreHandler);

// All student resumes vs one job (for resume picker)
router.post('/batch-score', batchScoreHandler);

// Admin / Coordinator tuning
router.get('/config', requireRole(['COORDINATOR', 'SPOC']), getConfig);
router.put('/config', requireRole(['COORDINATOR']), updateConfig);

export default router;
