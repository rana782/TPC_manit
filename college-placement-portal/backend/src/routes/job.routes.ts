import { Router } from 'express';
import { createJob, listJobs, getJob, updateJob, deleteJob, exportApplicantsCsv, addOrUpdateStage, updateJobStage, deleteJobStage, uploadStageShortlistDoc, uploadStageShortlistAndMap, advanceStage, regressStage, dropApplicants, declareResults, getStudentJobDetails } from '../controllers/job.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';
import { uploadDocument, uploadJobDocs, uploadShortlist } from '../middlewares/upload.middleware';

const router = Router();

// Applying token check across all routes
router.use(verifyToken);

// Any authenticated role (STUDENT, SPOC, COORDINATOR) can LIST jobs
router.get('/', listJobs);
router.get('/:id', getJob);
// Student read-only details (read-only modal in JobBoard)
router.get('/student/:id/details', requireRole(['STUDENT']), getStudentJobDetails);

// File upload configuration for JD/JNF
const cpUpload = uploadJobDocs.fields([{ name: 'jd', maxCount: 1 }, { name: 'jnf', maxCount: 1 }]);

// Only SPOCs (or Coordinators normally) can mutate jobs
router.post('/', requireRole(['SPOC', 'COORDINATOR']), cpUpload, createJob);
router.put('/:id', requireRole(['SPOC', 'COORDINATOR']), cpUpload, updateJob);
router.delete('/:id', requireRole(['SPOC', 'COORDINATOR']), deleteJob);
router.get('/:id/applicants/csv', requireRole(['SPOC', 'COORDINATOR']), exportApplicantsCsv);

router.patch('/:id/stage', requireRole(['SPOC', 'COORDINATOR']), uploadDocument.single('stageAttachment'), addOrUpdateStage);
router.patch('/:id/stages/:stageId', requireRole(['SPOC', 'COORDINATOR']), uploadDocument.single('stageAttachment'), updateJobStage);
router.delete('/:id/stages/:stageId', requireRole(['SPOC', 'COORDINATOR']), deleteJobStage);
router.patch('/:id/stages/:stageId/shortlist-doc', requireRole(['SPOC', 'COORDINATOR']), uploadDocument.single('shortlistDoc'), uploadStageShortlistDoc);
router.post('/:id/stages/:stageId/upload-shortlist', requireRole(['SPOC', 'COORDINATOR']), uploadShortlist.single('shortlistFile'), uploadStageShortlistAndMap);
router.patch('/:id/advance-stage', requireRole(['SPOC', 'COORDINATOR']), advanceStage);
router.patch('/:id/regress-stage', requireRole(['SPOC', 'COORDINATOR']), regressStage);
router.patch('/:id/drop-applicants', requireRole(['SPOC', 'COORDINATOR']), dropApplicants);
router.post('/:id/results', requireRole(['SPOC', 'COORDINATOR']), declareResults);

export default router;
