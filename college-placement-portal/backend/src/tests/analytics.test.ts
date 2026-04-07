import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let token: string;

beforeAll(async () => {
    // Basic setup: create/find a coordinator admin for tokens
    const email = 'analytics_admin@test.com';
    let admin = await prisma.user.findUnique({ where: { email } });
    
    if (!admin) {
        admin = await prisma.user.create({
            data: { email, password: 'hashedpassword', role: 'COORDINATOR' },
        });
    }

    const res = await request(app).post('/api/auth/login').send({ email, password: 'hashedpassword' });
    token = res.body.token;

    // Optional: seed a dummy alumni record if db empty, but let's test the endpoint response structures.
});

afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'analytics_admin@test.com' } });
    await prisma.$disconnect();
});

describe('Module 12: Analytics, Alumni, and ATS', () => {

    it('should fetch dashboard summary metrics', async () => {
        const res = await request(app)
            .get('/api/analytics/summary')
            .set('Authorization', `Bearer ${token}`);
            
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary).toHaveProperty('totalStudents');
        expect(res.body.summary).toHaveProperty('totalJobs');
        expect(res.body.summary).toHaveProperty('totalApplications');
        expect(res.body.summary).toHaveProperty('totalPlaced');
    });

    it('should fetch branch comparison', async () => {
        const res = await request(app)
            .get('/api/analytics/branch-comparison')
            .set('Authorization', `Bearer ${token}`);
            
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should fetch ATS config', async () => {
        const res = await request(app)
            .get('/api/ats/config')
            .set('Authorization', `Bearer ${token}`);
            
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('skillsMatch');
    });

    it('should update ATS config successfully', async () => {
        const validConfig = {
            skillsMatch: 0.5,
            projects: 0.2,
            certifications: 0.1,
            tools: 0.1,
            experience: 0.1
        };

        const res = await request(app)
            .put('/api/ats/config')
            .set('Authorization', `Bearer ${token}`)
            .send(validConfig);
            
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.skillsMatch).toBe(0.5);
    });

    it('should reject invalid ATS config weights that do not sum to 1.0', async () => {
        const invalidConfig = {
            skillsMatch: 0.9,
            projects: 0.9, // Over 1.0!
            certifications: 0.1,
            tools: 0.1,
            experience: 0.1
        };

        const res = await request(app)
            .put('/api/ats/config')
            .set('Authorization', `Bearer ${token}`)
            .send(invalidConfig);
            
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
