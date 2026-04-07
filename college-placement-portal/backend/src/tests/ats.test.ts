import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { scoreResume } from '../services/ats.service';

const prisma = new PrismaClient();

beforeAll(() => {
    // Keep ATS tests deterministic and offline-safe.
    delete process.env.ATS_LLM_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
});

describe('GET /api/health', () => {
    it('includes openaiConfigured boolean', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveProperty('openaiConfigured');
        expect(typeof res.body.data.openaiConfigured).toBe('boolean');
    });
});

// ── Unit tests for ats.service ─────────────────────────────────────────────────
describe('ATS Service - scoreResume (SBERT stub)', () => {
    beforeAll(() => {
        process.env.ATS_ENGINE = 'sbert'; // force offline stub
    });

    it('should return score between 0 and 100', async () => {
        const result = await scoreResume(
            'Python developer with Django REST API skills, built machine learning projects, AWS certified',
            'Looking for Python developer with REST API and ML experience'
        );
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should return matched keywords array', async () => {
        const result = await scoreResume(
            'React TypeScript frontend developer. Built portfolio project on GitHub. Git, Docker, VS Code.',
            'React TypeScript developer needed. Git and Docker experience required.'
        );
        expect(Array.isArray(result.matchedKeywords)).toBe(true);
        expect(result.matchedKeywords.length).toBeGreaterThan(0);
        // Should match at least react and git
        const lower = result.matchedKeywords.map((k) => k.toLowerCase());
        expect(lower.some((k) => k.includes('react') || k.includes('git') || k.includes('typescript'))).toBe(true);
    });

    it('should return an explanation string', async () => {
        const result = await scoreResume('Java Spring Boot developer', 'Senior Java Engineer');
        expect(typeof result.explanation).toBe('string');
        expect(result.explanation.length).toBeGreaterThan(0);
    });

    it('should score low for completely unrelated resume and job', async () => {
        const result = await scoreResume(
            'Watercolor painting, pottery, ceramics, fine arts',
            'Cloud solutions architect AWS Kubernetes microservices'
        );
        expect(result.score).toBeLessThan(50);
    });

    it('should fall back to SBERT when no LLM API key is set', async () => {
        const savedOpenAi = process.env.OPENAI_API_KEY;
        const savedAts = process.env.ATS_LLM_API_KEY;
        const savedOr = process.env.OPENROUTER_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ATS_LLM_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        process.env.ATS_ENGINE = 'openai';
        const result = await scoreResume('Python ML engineer', 'Machine learning role');
        expect(result.score).toBeGreaterThanOrEqual(0);
        if (savedOpenAi !== undefined) process.env.OPENAI_API_KEY = savedOpenAi;
        if (savedAts !== undefined) process.env.ATS_LLM_API_KEY = savedAts;
        if (savedOr !== undefined) process.env.OPENROUTER_API_KEY = savedOr;
        process.env.ATS_ENGINE = 'sbert';
    });
});

// ── Integration tests for POST /api/ats/score ─────────────────────────────────
describe('ATS API - POST /api/ats/score', () => {
    let token = '';
    let jobId = '';
    let resumeId = '';
    const EMAIL = 'ats_test_student@example.com';
    const PASS = 'Password@123';

    beforeAll(async () => {
        // Clean up everything for this user
        const existingUser = await prisma.user.findUnique({ where: { email: EMAIL } });
        if (existingUser) {
            await prisma.user.delete({ where: { id: existingUser.id } });
        }

        // Create user + student
        const hash = await bcrypt.hash(PASS, 10);
        const user = await prisma.user.create({
            data: { email: EMAIL, password: hash, role: 'STUDENT', isVerified: true },
        });
        const student = await prisma.student.create({
            data: { userId: user.id, firstName: 'ATS', lastName: 'Tester', branch: 'CS', course: 'B.Tech' },
        });

        // Create a resume
        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                roleName: 'SDE',
                fileName: 'test_resume.pdf',
                fileUrl: '/uploads/test_resume.pdf',
                isActive: true,
            },
        });
        resumeId = resume.id;

        // Find any seeded job (or create one)
        const spocUser = await prisma.user.findFirst({ where: { role: 'SPOC' } });
        const job = spocUser
            ? await prisma.job.findFirst({ where: { postedById: spocUser.id } })
            : null;

        if (job) {
            jobId = job.id;
        } else {
            const tempUser = await prisma.user.create({
                data: { email: 'ats_spoc_temp@example.com', password: await bcrypt.hash('p', 10), role: 'SPOC', isVerified: true },
            });
            // 4. Create Job
            const newJob = await prisma.job.create({
                data: {
                    role: 'Software Engineer',
                    companyName: 'TestCo',
                    description: 'Python, React, Node.js, Git, Docker. Build REST APIs.',
                    requiredProfileFields: JSON.stringify(['resume']),
                    postedById: tempUser.id,
                    applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });
            jobId = newJob.id;
        }

        // Login
        const loginRes = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASS });
        token = loginRes.body.token;
    });

    afterAll(async () => {
        const user = await prisma.user.findUnique({ where: { email: EMAIL } });
        if (user) await prisma.user.delete({ where: { id: user.id } });
        const spoc = await prisma.user.findUnique({ where: { email: 'ats_spoc_temp@example.com' } });
        if (spoc) await prisma.user.delete({ where: { id: spoc.id } });
        await prisma.$disconnect();
    });

    it('should return 401 without token', async () => {
        const res = await request(app).post('/api/ats/score').send({ resumeId, jobId });
        expect(res.statusCode).toBe(401);
    });

    it('should return 400 when resumeId or jobId is missing', async () => {
        const res = await request(app)
            .post('/api/ats/score')
            .set('Authorization', `Bearer ${token}`)
            .send({ jobId });
        expect(res.statusCode).toBe(400);
    });

    it('should return 400 when uploaded resume PDF cannot be parsed', async () => {
        const res = await request(app)
            .post('/api/ats/score')
            .set('Authorization', `Bearer ${token}`)
            .send({ resumeId, jobId });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('POST /api/ats/batch-score should rank multiple resumes', async () => {
        const res = await request(app)
            .post('/api/ats/batch-score')
            .set('Authorization', `Bearer ${token}`)
            .send({ jobId, resumeIds: [resumeId] });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data[0]).toHaveProperty('recommended');
    });

    it('POST /api/ats/score-absolute should return 401 without token', async () => {
        const res = await request(app).post('/api/ats/score-absolute').send({ resumeId });
        expect(res.statusCode).toBe(401);
    });

    it('POST /api/ats/score-absolute should return 400 when resumeId is missing', async () => {
        const res = await request(app)
            .post('/api/ats/score-absolute')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.statusCode).toBe(400);
    });

    it('POST /api/ats/score-absolute should return 400 when uploaded resume PDF cannot be parsed', async () => {
        const res = await request(app)
            .post('/api/ats/score-absolute')
            .set('Authorization', `Bearer ${token}`)
            .send({ resumeId });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
