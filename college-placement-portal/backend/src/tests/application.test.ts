import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Application Endpoints', () => {
    const studentUser = { email: 'student_app_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_app_test@example.com', password: 'Password@123', role: 'SPOC' };

    let studentToken = '';
    let spocToken = '';

    let jobId = '';
    let resumeId = '';
    let studentUserId = '';

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
        const spocIdRes = await request(app).post('/api/auth/register').send(spocUser);

        // Verify SPOC User to allow posting
        await prisma.user.update({
            where: { email: spocUser.email },
            data: { isVerified: true }
        });

        // Login to get tokens
        const studentRes = await request(app).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = studentRes.body.token;
        studentUserId = studentRes.body.user.id;

        const spocRes = await request(app).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;

        // Setup the SPOC Job that STRICTLY requires 'cgpa'
        const jobRes = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                role: 'Data Scientist',
                companyName: 'DeepData',
                description: 'We need smart people with degrees.',
                requiredProfileFields: JSON.stringify(['cgpa', 'resume']),
                applicationDeadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                cgpaMin: 8.5,
                customQuestions: JSON.stringify([{ id: '1', label: 'Why AI?', type: 'text', required: true }])
            });
        jobId = jobRes.body.job.id;

        // Setup the Student profile but DELIBERATELY OMIT 'cgpa' initially
        await request(app).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'App', lastName: 'Maker'
        });

        // Inject a raw mock resume because we bypassed multer in testing
        const studentModel = await prisma.student.findUnique({ where: { userId: studentUserId } });
        const resumeRef = await prisma.resume.create({
            data: {
                studentId: studentModel!.id,
                fileName: 'test.pdf',
                fileUrl: '/uploads/test.pdf'
            }
        });
        resumeId = resumeRef.id;
    });

    afterAll(async () => {
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        await prisma.$disconnect();
    });

    it('should REJECT application if student lacks a required profile field like cgpa', async () => {
        const res = await request(app)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ jobId, resumeId });

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('missing required fields');
    });

    it('should ALLOW application once profile fields are completed and capture them into extraAnswers', async () => {
        // Fill in the missing CGPA natively via internal profile hook
        await request(app).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'App', lastName: 'Maker', cgpa: 9.8
        });

        const res = await request(app)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                jobId,
                resumeId,
                answers: {
                    'Why AI?': 'Because it is the future.'
                }
            });

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.application.applicationData).toHaveProperty('cgpa', 9.8);
        expect(res.body.application.applicationData).toHaveProperty('resume');
        expect(res.body.application.extraAnswers).toHaveProperty('Why AI?', 'Because it is the future.');

        // ATS should run synchronously and populate
        expect(res.body.application).toHaveProperty('atsScore');
    });

    it('should REJECT DUPLICATE applications to the exact same job', async () => {
        const res = await request(app)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ jobId, resumeId });

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('already applied');
    });
});
