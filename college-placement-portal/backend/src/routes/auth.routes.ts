import { Router } from 'express';
import { register, login, logout, me, verifyEmail, forgotPassword, resetPassword, googleAuth, verifyGoogleSpocOtp } from '../controllers/auth.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/google/verify-spoc-otp', verifyGoogleSpocOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', logout);
router.get('/me', verifyToken, me);

export default router;
