import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Job Posting Endpoints', () => {
    const studentUser = { email: 'student_job_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_job_test@example.com', password: 'Password@123', role: 'SPOC' };

    let studentToken = '';
    let spocToken = '';
    let testJobId = '';

    beforeAll(async () => {
        // Cleanup existing mock accounts in case previous test leaked
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.studentDocument.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });

        // Register Users
        await request(app).post('/api/auth/register').send(studentUser);
        await request(app).post('/api/auth/register').send(spocUser);

        // Verify SPOC (required for creating jobs)
        await prisma.user.update({
            where: { email: spocUser.email },
            data: { isVerified: true }
        });

        // Login to get tokens
        const studentRes = await request(app).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = studentRes.body.token;

        const spocRes = await request(app).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;
    });

    afterAll(async () => {
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        await prisma.$disconnect();
    });

    it('should deny STUDENTS from creating a job', async () => {
        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                role: 'Hacker',
                companyName: 'Leet',
                description: 'Super cool job',
                requiredProfileFields: '["cgpa"]',
                applicationDeadline: new Date().toISOString()
            });

        expect(res.statusCode).toEqual(403);
    });

    it('should allow SPOCs to create a job', async () => {
        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                role: 'Software Engineer',
                companyName: 'Google',
                description: 'Search stuff. Needs at least 10 words.',
                requiredProfileFields: '["cgpa", "resume"]',
                customQuestions: '[{"label": "Why Google?", "type": "text", "required": true}]',
                applicationDeadline: new Date(Date.now() + 86400000).toISOString()
            });

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.job.role).toBe('Software Engineer');
        testJobId = res.body.job.id;
    });

    it('should return 400 for invalid job inputs', async () => {
        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                role: '', // Zod error length < 2
                companyName: 'T',
                description: 'Short',
                applicationDeadline: 'invalid_date'
            });

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
    });

    it('should list jobs for any authenticated user', async () => {
        const res = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${studentToken}`); // Fetching as student

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow SPOC to delete a job', async () => {
        const res = await request(app)
            .delete(`/api/jobs/${testJobId}`)
            .set('Authorization', `Bearer ${spocToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
    });
});

