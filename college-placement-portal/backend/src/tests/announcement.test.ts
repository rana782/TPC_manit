import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Announcement Endpoints', () => {
    const coordUser = { email: 'coord_ann_test@example.com', password: 'Password@123', role: 'COORDINATOR' };
    const spocUser = { email: 'spoc_ann_test@example.com', password: 'Password@123', role: 'SPOC' };
    const studentUser = { email: 'student_ann_test@example.com', password: 'Password@123', role: 'STUDENT' };

    let coordToken = '';
    let spocToken = '';
    let studentToken = '';

    beforeAll(async () => {
        await prisma.announcement.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, spocUser.email, studentUser.email] } }
        });

        await request(app).post('/api/auth/register').send(coordUser);
        await request(app).post('/api/auth/register').send(spocUser);
        await request(app).post('/api/auth/register').send(studentUser);

        const cRes = await request(app).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        coordToken = cRes.body.token;

        const sRes = await request(app).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = sRes.body.token;

        const stRes = await request(app).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = stRes.body.token;
    });

    afterAll(async () => {
        await prisma.announcement.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, spocUser.email, studentUser.email] } }
        });
        await prisma.$disconnect();
    });

    it('should block STUDENT from creating announcements', async () => {
        const res = await request(app)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ title: 'Hack', body: 'Unauthorized', audience: 'ALL' });

        expect(res.statusCode).toBe(403);
    });

    it('should allow COORDINATOR to trigger an announcement', async () => {
        const res = await request(app)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
                title: 'Campus Recruitment Drive',
                body: 'TechCorp will be conducting interviews on 10th March. Eligible students please register.',
                audience: 'STUDENT'
            });

        expect(res.statusCode).toBe(202);
        expect(res.body.success).toBe(true);
        expect(res.body.announcement.title).toBe('Campus Recruitment Drive');
        expect(res.body.announcement.audience).toBe('STUDENT');
    });

    it('should store the announcement log with SENT status (mock mode)', async () => {
        // Give async save a moment
        await new Promise(r => setTimeout(r, 300));

        const logs = await prisma.announcement.findMany({
            where: { zapierStatus: 'SENT' }
        });
        expect(logs.length).toBeGreaterThanOrEqual(1);
        expect(logs[0].zapierResponse).toBe('MOCK_ZAPIER_SEND');
    });

    it('should allow SPOC to trigger announcement and view logs', async () => {
        await request(app)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({ title: 'Pre-Placement Talk', body: 'Attend the PPT by InfraCorp tomorrow.', audience: 'ALL' });

        await new Promise(r => setTimeout(r, 300));

        const res = await request(app)
            .get('/api/announcements/logs')
            .set('Authorization', `Bearer ${spocToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.announcements)).toBe(true);
        expect(res.body.announcements.length).toBeGreaterThanOrEqual(2);
    });

    it('should validate audience field — reject invalid value', async () => {
        const res = await request(app)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ title: 'Test', body: 'Body', audience: 'INVALID_AUDIENCE' });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('audience');
    });

    it('should include correct Zapier payload structure in stored record', async () => {
        const logs = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
        const latest = logs[0];

        expect(latest).toHaveProperty('payload');
        const payload = latest.payload as any;
        expect(payload.event).toBe('announcement');
        expect(payload).toHaveProperty('triggeredBy');
        expect(payload).toHaveProperty('triggeredAt');
        expect(payload).toHaveProperty('portalUrl');
    });
});
