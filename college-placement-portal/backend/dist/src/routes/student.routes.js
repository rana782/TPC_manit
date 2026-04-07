"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const student_controller_1 = require("../controllers/student.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const router = (0, express_1.Router)();
// All student routes require authentication
router.use(auth_middleware_1.verifyToken);
// Profile
router.get('/profile', student_controller_1.getProfile);
router.put('/profile', student_controller_1.updateProfile);
router.post('/photo', upload_middleware_1.uploadPhoto.single('photo'), student_controller_1.uploadPhoto);
// Resumes
router.get('/resumes', student_controller_1.getResumes);
router.post('/resume', upload_middleware_1.uploadResume.single('resume'), student_controller_1.uploadResume);
router.delete('/resume/:id', student_controller_1.deleteResume);
router.put('/resume/:id/active', student_controller_1.setResumeActive);
// Documents
router.post('/document', upload_middleware_1.uploadDocument.single('document'), student_controller_1.uploadDocument);
// Internships
router.post('/internships', student_controller_1.addInternship);
router.delete('/internships/:id', student_controller_1.deleteInternship);
// Certifications
router.post('/certifications', student_controller_1.addCertification);
router.delete('/certifications/:id', student_controller_1.deleteCertification);
exports.default = router;
