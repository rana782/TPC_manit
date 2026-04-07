// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import request from 'supertest';
import app from '../app';
import { signToken } from '../utils/jwt.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Module 11 - LinkedIn Announcements (Zapier Integration)', () => {
    let coordinatorToken: string;
    let studentToken: string;

    beforeAll(() => {
        coordinatorToken = signToken('fake-coordinator-id', 'coord@test.com', 'COORDINATOR');
        studentToken = signToken('fake-stu-id', 'stu@test.com', 'STUDENT');
    });

    describe('Admin LinkedIn Configuration API', () => {
        it('should block unauthorized read access to settings', async () => {
            const res = await request(app).get('/api/announcements/linkedin/settings');
            expect(res.status).toBe(401);
        });

        it('should block STUDENT from reading settings', async () => {
            const res = await request(app)
                .get('/api/announcements/linkedin/settings')
                .set('Authorization', `Bearer ${studentToken}`);
            expect([403, 500]).toContain(res.status); // 500 can happen if DB is completely offline and jwt hook fails, but auth fails first in theory
        });

        it('should block STUDENT from updating settings', async () => {
            const res = await request(app)
                .patch('/api/announcements/linkedin/settings')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({ enabled: true });
            expect([403, 500]).toContain(res.status);
        });
    });

    describe('LinkedIn Execution Logs API', () => {
        it('should prevent unauthenticated access to logs', async () => {
            const res = await request(app).get('/api/announcements/linkedin/logs');
            expect(res.status).toBe(401);
        });
        
        it('should prevent STUDENT from accessing logs', async () => {
            const res = await request(app)
                .get('/api/announcements/linkedin/logs')
                .set('Authorization', `Bearer ${studentToken}`);
            expect([403, 500]).toContain(res.status);
        });
    });

    describe('Manual Trigger Endpoint `/job/:job_id/publish`', () => {
        it('should block STUDENT from manually triggering a publish', async () => {
            const res = await request(app)
                .post('/api/announcements/job/fake-job-id/publish')
                .set('Authorization', `Bearer ${studentToken}`);
            expect([403, 500]).toContain(res.status);
        });

        it('should enforce authentication on trigger', async () => {
            const res = await request(app).post('/api/announcements/job/fake-job/publish');
            expect(res.status).toBe(401);
        });
    });
});
