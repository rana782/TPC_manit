import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

describe('Student Profile Endpoints', () => {
    let token = '';
    const EMAIL = 'test_student_prof@example.com';
    const PASS = 'Password@123';

    beforeAll(async () => {
        // Clean up any existing test data
        await prisma.internship.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.certification.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.resume.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.studentDocument.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.student.deleteMany({ where: { user: { email: EMAIL } } });
        await prisma.user.deleteMany({ where: { email: EMAIL } });

        // Create verified user + student directly
        const hash = await bcrypt.hash(PASS, 10);
        const user = await prisma.user.create({
            data: { email: EMAIL, password: hash, role: 'STUDENT', isVerified: true },
        });
        await prisma.student.create({
            data: { userId: user.id, firstName: 'Test', lastName: 'Profile', branch: 'CS', course: 'B.Tech', cgpa: 8.0 },
        });

        // Login to get token
        const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASS });
        token = res.body.token;
    });

    afterAll(async () => {
        await prisma.internship.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.certification.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.resume.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.studentDocument.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        await prisma.student.deleteMany({ where: { user: { email: EMAIL } } });
        await prisma.user.deleteMany({ where: { email: EMAIL } });
        await prisma.$disconnect();
    });

    it('GET /api/student/profile - should return the student profile', async () => {
        const res = await request(app).get('/api/student/profile').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('firstName', 'Test');
        expect(res.body.data).toHaveProperty('branch', 'CS');
    });

    it('PUT /api/student/profile - should update profile fields', async () => {
        const res = await request(app)
            .put('/api/student/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ city: 'Mumbai', cgpa: 8.5, semester: 6, linkedin: 'https://linkedin.com/in/test' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.city).toBe('Mumbai');
        expect(res.body.data.cgpa).toBe(8.5);
    });

    it('PUT /api/student/profile - should reject invalid cgpa', async () => {
        const res = await request(app)
            .put('/api/student/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ cgpa: 15 }); // out of range
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('POST /api/student/resume - should return 400 when no file attached', async () => {
        const res = await request(app)
            .post('/api/student/resume')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(400);
    });

    it('GET /api/student/resumes - should list resumes (empty)', async () => {
        const res = await request(app).get('/api/student/resumes').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/student/internships - should add an internship', async () => {
        const res = await request(app)
            .post('/api/student/internships')
            .set('Authorization', `Bearer ${token}`)
            .send({ company: 'Google', role: 'SWE Intern', startDate: '2024-05-01', endDate: '2024-07-31', description: 'Backend work' });
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.company).toBe('Google');
    });

    it('POST /api/student/certifications - should add a certification', async () => {
        const res = await request(app)
            .post('/api/student/certifications')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'AWS Solutions Architect', organization: 'Amazon', issueDate: '2024-01-15' });
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe('AWS Solutions Architect');
    });

    it('GET /api/student/profile - should include internships and certifications', async () => {
        const res = await request(app).get('/api/student/profile').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.internships.length).toBeGreaterThanOrEqual(1);
        expect(res.body.data.certifications.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/student/profile - should return 401 without token', async () => {
        const res = await request(app).get('/api/student/profile');
        expect(res.statusCode).toBe(401);
    });
});
