"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const job_controller_1 = require("../controllers/job.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const router = (0, express_1.Router)();
// Applying token check across all routes
router.use(auth_middleware_1.verifyToken);
// Any authenticated role (STUDENT, SPOC, COORDINATOR) can LIST jobs
router.get('/', job_controller_1.listJobs);
router.get('/:id', job_controller_1.getJob);
// Student read-only details (read-only modal in JobBoard)
router.get('/student/:id/details', (0, auth_middleware_1.requireRole)(['STUDENT']), job_controller_1.getStudentJobDetails);
// File upload configuration for JD/JNF
const cpUpload = upload_middleware_1.uploadJobDocs.fields([{ name: 'jd', maxCount: 1 }, { name: 'jnf', maxCount: 1 }]);
// Only SPOCs (or Coordinators normally) can mutate jobs
router.post('/', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), cpUpload, job_controller_1.createJob);
router.put('/:id', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), cpUpload, job_controller_1.updateJob);
router.delete('/:id', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), job_controller_1.deleteJob);
router.get('/:id/applicants/csv', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), job_controller_1.exportApplicantsCsv);
router.patch('/:id/stage', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), job_controller_1.addOrUpdateStage);
router.patch('/:id/advance-stage', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), job_controller_1.advanceStage);
router.post('/:id/results', (0, auth_middleware_1.requireRole)(['SPOC', 'COORDINATOR']), job_controller_1.declareResults);
exports.default = router;
