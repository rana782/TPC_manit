import { Router } from 'express';
import { uploadResume, listResumes, deleteResume, applyWithResume } from '../controllers/resume.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';
import { uploadResume as upload } from '../middlewares/upload.middleware';

const router = Router();

// Resumes are STUDENT specific
router.use(verifyToken);
router.use(requireRole(['STUDENT']));

router.get('/', listResumes);

// Multer error handling wrapped for invalid MIME drops
router.post('/upload', (req, res, next) => {
    upload.single('resume')(req, res, (err: any) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, uploadResume);

router.delete('/:id', deleteResume);

router.post('/apply', applyWithResume); // Mock application 

export default router;
