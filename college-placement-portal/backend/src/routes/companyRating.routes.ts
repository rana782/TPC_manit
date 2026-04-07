import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import { getCompanyRating } from '../controllers/companyRating.controller';

const router = Router();

router.use(verifyToken);
router.get('/', getCompanyRating);

export default router;

