import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';
import { signToken } from '../utils/jwt.util';

const prisma = new PrismaClient();

describe('Module 09 - SPOC Validation & Coordinator Overrides', () => {
    let coordinatorToken: string;
    let spocToken: string;
    let studentToken: string;
    let spocId: string;
    let coordinatorId: string;
    let studentId: string;
    let studentUserId: string;

    beforeAll(async () => {
        // Clear DB
        await prisma.actionOverride.deleteMany();
        await prisma.profileLock.deleteMany();
        await prisma.jobApplication.deleteMany();
        await prisma.job.deleteMany();
        await prisma.student.deleteMany();
        await prisma.user.deleteMany();

        // Create Coordinator
        const coordinator = await prisma.user.create({
            data: { email: 'coord_override@test.com', password: 'hash', role: 'COORDINATOR', isVerified: true }
        });
        coordinatorId = coordinator.id;
        coordinatorToken = signToken(coordinator.id, coordinator.email, 'COORDINATOR');

        // Create SPOC (unverified logic)
        const spoc = await prisma.user.create({
            data: { email: 'spoc_override@test.com', password: 'hash', role: 'SPOC', isVerified: false }
        });
        spocId = spoc.id;
        spocToken = signToken(spoc.id, spoc.email, 'SPOC');

        // Create Student
        const studentUser = await prisma.user.create({
            data: { email: 'student_override@test.com', password: 'hash', role: 'STUDENT', isVerified: true }
        });
        studentUserId = studentUser.id;
        studentToken = signToken(studentUser.id, studentUser.email, 'STUDENT');

        const student = await prisma.student.create({
            data: {
                userId: studentUser.id,
                firstName: 'Test',
                lastName: 'Student',
                scholarNo: '111222',
                branch: 'CSE',
                cgpa: 8.5
            }
        });
        studentId = student.id;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('SPOC Verification Enforcement', () => {
        it('should prevent unverified SPOC from creating a job', async () => {
            const res = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer ${spocToken}`)
                .send({
                    role: 'SDE',
                    companyName: 'Test Inc',
                    description: 'Desc',
                    applicationDeadline: new Date().toISOString()
                });
            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/verified by admin first/);
        });

        it('should fetch pending SPOCs', async () => {
            const res = await request(app)
                .get('/api/admin/spocs/pending')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            expect(res.status).toBe(200);
            expect(res.body.spocs.length).toBeGreaterThan(0);
            expect(res.body.spocs[0].email).toBe('spoc_override@test.com');
        });

        it('should allow Coordinator to approve SPOC', async () => {
            const res = await request(app)
                .patch(`/api/admin/spocs/${spocId}/approve`)
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send();
            expect(res.status).toBe(200);
            expect(res.body.spoc.isVerified).toBe(true);
            expect(res.body.spoc.permJobCreate).toBe(true);
            expect(res.body.spoc.permLockProfile).toBe(false);
        });

        it('should allow verified SPOC to create a job', async () => {
            const res = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer ${spocToken}`)
                .send({
                    role: 'SDE',
                    companyName: 'Test Inc',
                    description: 'Testing Job Desc',
                    applicationDeadline: new Date(Date.now() + 86400000).toISOString()
                });
            expect(res.status).toBe(201);
            expect(res.body.job).toHaveProperty('id');
        });
    });

    describe('SPOC granular permissions', () => {
        it('should deny SPOC from locking a profile default permission (false)', async () => {
            const res = await request(app)
                .post(`/api/profile-lock/${studentId}/lock`)
                .set('Authorization', `Bearer ${spocToken}`)
                .send({ lockType: 'DEBARRED', reason: 'Test' });
            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/permission to lock profiles/);
        });

        it('should allow Coordinator to update SPOC permissions', async () => {
            const res = await request(app)
                .patch(`/api/admin/spocs/${spocId}/permissions`)
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ permLockProfile: true });
            expect(res.status).toBe(200);
            expect(res.body.spoc.permLockProfile).toBe(true);
        });

        it('should allow SPOC to lock profile after permission granted', async () => {
            const res = await request(app)
                .post(`/api/profile-lock/${studentId}/lock`)
                .set('Authorization', `Bearer ${spocToken}`)
                .send({ lockType: 'DEBARRED', reason: 'Misbehavior' });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        });
    });

    describe('Coordinator Overrides', () => {
        it('should allow Coordinator to override and unlock a profile and generate log', async () => {
            // First check it's locked
            const stuBefore = await prisma.student.findUnique({ where: { id: studentId } });
            expect(stuBefore?.isLocked).toBe(true);

            // Override unlock
            const res = await request(app)
                .post(`/api/admin/overrides`)
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({
                    actionType: 'UNLOCK_STUDENT',
                    entity: 'Student',
                    entityId: studentUserId, // we coded backend to lookup by Student's user ID
                    reason: 'Admin decided to override logic'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            // Verify Student Unlocked
            const stuAfter = await prisma.student.findUnique({ where: { id: studentId } });
            expect(stuAfter?.isLocked).toBe(false);

            // Verify Log
            const logs = await prisma.actionOverride.findMany({ where: { actionType: 'UNLOCK_STUDENT' } });
            expect(logs.length).toBe(1);
            expect(logs[0].coordinatorId).toBe(coordinatorId);
            expect(logs[0].reason).toBe('Admin decided to override logic');
        });
    });
});
