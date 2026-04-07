import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Admin Endpoints', () => {
    const coordUser = { email: 'coord_admin_test@example.com', password: 'Password@123', role: 'COORDINATOR' };
    const targetUser = { email: 'target_admin_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_admin_test@example.com', password: 'Password@123', role: 'SPOC' };

    let coordToken = '';
    let spocToken = '';
    let targetUserId = '';

    beforeAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, targetUser.email, spocUser.email] } }
        });

        await request(app).post('/api/auth/register').send(coordUser);
        await request(app).post('/api/auth/register').send(targetUser);
        await request(app).post('/api/auth/register').send(spocUser);

        const cRes = await request(app).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        coordToken = cRes.body.token;

        const sRes = await request(app).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = sRes.body.token;

        const tUser = await prisma.user.findUnique({ where: { email: targetUser.email } });
        targetUserId = tUser!.id;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, targetUser.email, spocUser.email] } }
        });
        await prisma.$disconnect();
    });

    it('should block non-coordinator from accessing admin endpoints', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${spocToken}`);
        expect(res.statusCode).toBe(403);
    });

    it('should return correct stats shape for coordinator', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${coordToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stats).toHaveProperty('totalStudents');
        expect(res.body.stats).toHaveProperty('totalJobs');
        expect(res.body.stats).toHaveProperty('placedStudents');
        expect(res.body.stats).toHaveProperty('lockedProfiles');
        expect(res.body.stats).toHaveProperty('applicationsByStatus');
    });

    it('should list all users with pagination', async () => {
        const res = await request(app)
            .get('/api/admin/users?page=1&limit=10')
            .set('Authorization', `Bearer ${coordToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.users)).toBe(true);
        expect(res.body).toHaveProperty('total');
    });

    it('should filter users by role', async () => {
        const res = await request(app)
            .get('/api/admin/users?role=STUDENT')
            .set('Authorization', `Bearer ${coordToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.users.every((u: any) => u.role === 'STUDENT')).toBe(true);
    });

    it('should disable a user and block their login', async () => {
        const disableRes = await request(app)
            .patch(`/api/admin/users/${targetUserId}/disable`)
            .set('Authorization', `Bearer ${coordToken}`);

        expect(disableRes.statusCode).toBe(200);
        expect(disableRes.body.user.isDisabled).toBe(true);

        // Disabled user should fail authenticated endpoints
        const loginRes = await request(app).post('/api/auth/login').send({ email: targetUser.email, password: targetUser.password });
        const disabledToken = loginRes.body.token;

        const profileRes = await request(app)
            .get('/api/student/profile')
            .set('Authorization', `Bearer ${disabledToken}`);

        expect(profileRes.statusCode).toBe(403);
        expect(profileRes.body.message).toContain('disabled');
    });

    it('should re-enable a user restoring their access', async () => {
        const enableRes = await request(app)
            .patch(`/api/admin/users/${targetUserId}/enable`)
            .set('Authorization', `Bearer ${coordToken}`);

        expect(enableRes.statusCode).toBe(200);
        expect(enableRes.body.user.isDisabled).toBe(false);
    });
});
