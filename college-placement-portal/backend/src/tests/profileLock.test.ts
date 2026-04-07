import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Profile Locking Endpoints', () => {
    const studentUser = { email: 'student_lock_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_lock_test@example.com', password: 'Password@123', role: 'SPOC' };
    const spocUser2 = { email: 'spoc_lock_test2@example.com', password: 'Password@123', role: 'SPOC' };
    const coordUser = { email: 'coord_lock_test@example.com', password: 'Password@123', role: 'COORDINATOR' };

    let studentToken = '';
    let spocToken = '';
    let coordToken = '';
    let studentId = '';
    let jobId = '';
    let resumeId = '';
    let applicationId = '';

    beforeAll(async () => {
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.studentDocument.deleteMany({});
        await prisma.placementRecord.deleteMany({});
        await prisma.profileLock.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email, spocUser2.email, coordUser.email] } }
        });

        // Register and login all users
        await request(app).post('/api/auth/register').send(studentUser);
        await request(app).post('/api/auth/register').send(spocUser);
        await request(app).post('/api/auth/register').send(coordUser);

        const sRes = await request(app).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = sRes.body.token;

        // Verify SPOC so they can post jobs/lock
        const spocModel = await prisma.user.findUnique({ where: { email: spocUser.email } });
        await prisma.user.update({ where: { id: spocModel!.id }, data: { isVerified: true } });

        const spocRes = await request(app).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;

        const coordRes = await request(app).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        coordToken = coordRes.body.token;

        // Create student profile
        await request(app).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'Lock', lastName: 'Test', cgpa: 8.5
        });

        const studentProfile = await prisma.student.findUnique({ where: { userId: sRes.body.user.id } });
        studentId = studentProfile!.id;

        // Create resume
        const r = await prisma.resume.create({ data: { studentId, fileName: 'test.pdf', fileUrl: '/uploads/test.pdf' } });
        resumeId = r.id;

        // Create job
        const jobRes = await request(app).post('/api/jobs').set('Authorization', `Bearer ${spocToken}`).send({
            title: 'Mock Job',
            company: 'MockCorp',
            description: 'Test job role',
            requiredProfileFields: ['cgpa'],
            deadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
        });
        jobId = jobRes.body.job?.id || jobRes.body.data?.id || (await prisma.job.findFirst())?.id;
    });

    afterAll(async () => {
        await prisma.jobApplication.deleteMany({});
        await prisma.job.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.placementRecord.deleteMany({});
        await prisma.profileLock.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email, spocUser2.email, coordUser.email] } }
        });
        await prisma.$disconnect();
    });

    it('1. SPOC should be able to explicitly lock a student profile', async () => {
        const res = await request(app)
            .post(`/api/profile-lock/${studentId}/lock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                lockType: 'DEBARRED',
                reason: 'Disciplinary Action'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.student.isLocked).toBe(true);
        expect(res.body.data.lock.lockType).toBe('DEBARRED');
    });

    it('2. Locked student should not be able to apply for jobs', async () => {
        const applyRes = await request(app)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                jobId,
                resumeId
            });

        expect(applyRes.status).toBe(403);
        expect(applyRes.body.success).toBe(false);
        expect(applyRes.body.message).toMatch(/profile is locked/i);
    });

    it('3. SPOC should NOT be able to unlock the student', async () => {
        const res = await request(app)
            .post(`/api/profile-lock/${studentId}/unlock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({});

        expect(res.status).toBe(403);
    });

    it('4. Coordinator should be able to unlock the student', async () => {
        const res = await request(app)
            .post(`/api/profile-lock/${studentId}/unlock`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.isLocked).toBe(false);
    });

    it('5. SPOC cannot lock themselves', async () => {
        // Create mock student entity mapped to SPOC user to simulate self-lock
        const spocObj = await prisma.user.findUnique({ where: { email: spocUser.email } });
        const spocStudent = await prisma.student.create({ data: { userId: spocObj!.id, firstName: 'Spoc', lastName: 'Self' } });

        const res = await request(app)
            .post(`/api/profile-lock/${spocStudent.id}/lock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({ lockType: 'DEBARRED', reason: 'Self lock' });

        await prisma.student.delete({ where: { id: spocStudent.id } });

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('cannot lock your own');
    });

    it('6. SPOC locking as PLACED_ON_CAMPUS creates placement record', async () => {
        const res = await request(app)
            .post(`/api/profile-lock/${studentId}/lock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
                lockType: 'PLACED_ON_CAMPUS',
                reason: 'Off campus confirmed',
                companyName: 'TestCo',
                role: 'SDE',
                ctc: '25 LPA'
            });

        expect(res.status).toBe(201);
        expect(res.body.data.lock.lockType).toBe('PLACED_ON_CAMPUS');

        // Check placement record
        const pRecs = await prisma.placementRecord.findMany({ where: { studentId } });
        expect(pRecs.length).toBe(1);
        expect(pRecs[0].companyName).toBe('TestCo');
    });
});
