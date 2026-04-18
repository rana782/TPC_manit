import { Router } from 'express';
import {
    getProfile,
    updateProfile,
    uploadPhoto,
    uploadResume,
    getResumes,
    deleteResume,
    setResumeActive,
    uploadDocument,
    deleteStudentDocument,
    addInternship,
    deleteInternship,
    addCertification,
    deleteCertification,
} from '../controllers/student.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { uploadPhoto as photoUpload, uploadResume as resumeUpload, uploadDocument as docUpload } from '../middlewares/upload.middleware';

const router = Router();

// All student routes require authentication
router.use(verifyToken);

// Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/photo', photoUpload.single('photo'), uploadPhoto);

// Resumes
router.get('/resumes', getResumes);
router.post('/resume', resumeUpload.single('resume'), uploadResume);
router.delete('/resume/:id', deleteResume);
router.put('/resume/:id/active', setResumeActive);

// Documents
router.post('/document', docUpload.single('document'), uploadDocument);
router.delete('/document/:id', deleteStudentDocument);

// Internships
router.post('/internships', addInternship);
router.delete('/internships/:id', deleteInternship);

// Certifications
router.post('/certifications', addCertification);
router.delete('/certifications/:id', deleteCertification);

export default router;
