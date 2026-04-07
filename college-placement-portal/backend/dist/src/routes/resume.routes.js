"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const resume_controller_1 = require("../controllers/resume.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const router = (0, express_1.Router)();
// Resumes are STUDENT specific
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['STUDENT']));
router.get('/', resume_controller_1.listResumes);
// Multer error handling wrapped for invalid MIME drops
router.post('/upload', (req, res, next) => {
    upload_middleware_1.uploadResume.single('resume')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, resume_controller_1.uploadResume);
router.delete('/:id', resume_controller_1.deleteResume);
router.post('/apply', resume_controller_1.applyWithResume); // Mock application 
exports.default = router;
