import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Timeline & Result Declaration Endpoints', () => {
    const studentUser = { email: 'student_timeline@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_timeline@example.com', password: 'Password@123', role: 'SPOC' };

    let studentToken = '';
    let spocToken = '';
    let jobId = '';
    let studentId = '';
    let studentUserId = '';
    let resumeId = '';

    beforeAll(async () => {
        // Cleanup existing test data
        await prisma.placementRecord.deleteMany({});
        await prisma.jobStage.deleteMany({});
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });

        // Register Users
        await request(app).post('/api/auth/register').send(studentUser);
        await request(app).post('/api/auth/register').send(spocUser);

        // Verify SPOC User
        await prisma.user.update({
            where: { email: spocUser.email },
            data: { isVerified: true }
        });

        // Login Users
        const studentRes = await request(app).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = studentRes.body.token;
        studentUserId = studentRes.body.user.id;

        const spocRes = await request(app).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;

        // Setup Student Profile
        await request(app).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'Timeline', lastName: 'Tester', cgpa: 9.0
        });

        // Setup Resume
        const studentModel = await prisma.student.findUnique({ where: { userId: studentUserId } });
        studentId = studentModel!.id;
        const resumeRef = await prisma.resume.create({
            data: {
                studentId: studentId,
                fileName: 'timeline.pdf',
                fileUrl: '/uploads/timeline.pdf'
            }
        });
        resumeId = resumeRef.id;

        // Setup Job (ON_CAMPUS)
        const jobRes = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                role: 'Software Engineer',
                companyName: 'TimelineTech',
                description: 'Test job',
                applicationDeadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                cgpaMin: 7.0,
            });

        if (!jobRes.body.success) {
            console.error("Job Creation Failed:", jobRes.body);
        }

        jobId = jobRes.body.job?.id;

        // Apply to job
        const appRes = await request(app)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ jobId, resumeId });

        if (!appRes.body.success) {
            console.error("Application Failed:", appRes.body);
        }
    });

    afterAll(async () => {
        await prisma.placementRecord.deleteMany({});
        await prisma.jobStage.deleteMany({});
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        await prisma.$disconnect();
    });

    it('should allow SPOC to add a Job Stage', async () => {
        // Stage must be on/after today and strictly after application deadline (job deadline is +1 year).
        const scheduled = new Date();
        scheduled.setFullYear(scheduled.getFullYear() + 2);
        const res = await request(app)
            .patch(`/api/jobs/${jobId}/stage`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                name: 'Online Assessment',
                scheduledDate: scheduled.toISOString()
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stage.name).toBe('Online Assessment');
    });

    it('should allow fetching jobs with stages by student', async () => {
        const res = await request(app)
            .get('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.applications[0].job.stages.length).toBeGreaterThan(0);
        expect(res.body.applications[0].job.stages[0].name).toBe('Online Assessment');
    });

    it('should declare results, create PlacementRecord, and lock an ON_CAMPUS student', async () => {
        const res = await request(app)
            .post(`/api/jobs/${jobId}/results`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                placedStudentIds: [studentId]
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);

        // Verify Application status updated
        const application = await prisma.jobApplication.findFirst({
            where: { jobId, studentId }
        });
        expect(application?.status).toBe('ACCEPTED');

        // Verify PlacementRecord created
        const placement = await prisma.placementRecord.findFirst({
            where: { jobId, studentId }
        });
        expect(placement).not.toBeNull();

        // Verify profile locked natively
        const studentProfile = await prisma.student.findUnique({
            where: { id: studentId }
        });
        expect(studentProfile?.isLocked).toBe(true);
        expect(studentProfile?.lockedReason).toContain('TimelineTech');
    });
});
