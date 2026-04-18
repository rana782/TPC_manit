import './loadEnv';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger';
import { errorMiddleware } from './middlewares/errorMiddleware';
import path from 'path';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import resumeRoutes from './routes/resume.routes';
import jobRoutes from './routes/job.routes';
import applicationRoutes from './routes/application.routes';
import profileLockRoutes from './routes/profileLock.routes';
import adminRoutes from './routes/admin.routes';
import notificationRoutes from './routes/notification.routes';
import announcementRoutes from './routes/announcement.routes';
import analyticsRoutes from './routes/analytics.routes';
import alumniRoutes, { exportRouter } from './routes/alumni.routes';
import atsRoutes from './routes/ats.routes';
import seedRoutes from './routes/seed.routes';
import companyRatingRoutes from './routes/companyRating.routes';
import companyProfileRoutes from './routes/companyProfile.routes';
import { getAtsChatModel, getAtsChatModelCandidates, getAtsLlmBaseUrl, getAtsLlmApiKey } from './utils/env';

app.get('/api/health', (req: Request, res: Response) => {
    logger.info('Health check accessed');
    const llmKey = Boolean(getAtsLlmApiKey());
    res.json({
        success: true,
        data: {
            service: 'College Placement Portal API',
            status: 'Healthy',
            /** @deprecated use atsLlmConfigured — key is for OpenRouter/Qwen or OpenAI-compatible API */
            openaiConfigured: llmKey,
            atsLlmConfigured: llmKey,
            atsLlmBaseUrl: getAtsLlmBaseUrl() ?? null,
            /** Resolved ATS chat model (default Qwen on OpenRouter). */
            atsLlmModel: getAtsChatModel(),
            /** Ordered fallback chain used when provider errors occur for a model. */
            atsLlmModelCandidates: getAtsChatModelCandidates(),
        },
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/profile-lock', profileLockRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alumni', alumniRoutes);
app.use('/api/export', exportRouter);
app.use('/api/ats', atsRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/company-rating', companyRatingRoutes);
app.use('/api/companies', companyProfileRoutes);

// Serve uploads directory publicly.
// Must match the directory multer writes files into.
// IMPORTANT: remove frame-blocking headers for uploaded assets so PDFs/images
// can be previewed inside iframe/embed in the frontend (localhost:3000).
app.use(
    '/uploads',
    express.static(path.join(__dirname, '../uploads'), {
        setHeaders: (res) => {
            // Helmet defaults block cross-origin iframe previews; override only for file assets.
            res.removeHeader('X-Frame-Options');
            res.removeHeader('Content-Security-Policy');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
        },
    }),
);

app.use(errorMiddleware);

export default app;
