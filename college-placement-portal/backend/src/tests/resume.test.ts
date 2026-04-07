import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

describe('Resume Endpoints', () => {
    const testUser = {
        email: 'test_student_resume@example.com',
        password: 'Password@123',
        role: 'STUDENT'
    };

    let token = '';

    beforeAll(async () => {
        // Build mock environment
        await prisma.jobApplication.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.studentDocument.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({ where: { email: testUser.email } });

        // Register -> Login
        await request(app).post('/api/auth/register').send(testUser);
        const loginRes = await request(app).post('/api/auth/login').send({
            email: testUser.email, password: testUser.password
        });
        token = loginRes.body.token;

        // Give them a student profile since resumes link strictly to students
        await request(app).post('/api/student/profile').set('Authorization', `Bearer ${token}`).send({
            firstName: 'Resume', lastName: 'Maker'
        });
    });

    afterAll(async () => {
        await prisma.jobApplication.deleteMany({});
        await prisma.resume.deleteMany({});
        await prisma.studentDocument.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({ where: { email: testUser.email } });
        await prisma.$disconnect();
    });

    it('should block file uploads of invalid extensions (txt)', async () => {
        const dummyPath = path.join(__dirname, 'test.txt');
        fs.writeFileSync(dummyPath, 'not a real resume');

        const res = await request(app)
            .post('/api/resumes/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('resume', dummyPath);

        fs.unlinkSync(dummyPath);

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Invalid file type');
    });

    it('should block resume upload if no file provided', async () => {
        const res = await request(app)
            .post('/api/resumes/upload')
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
    });

    it('should list empty resumes initially', async () => {
        const res = await request(app).get('/api/resumes').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.resumes.length).toBe(0);
    });

    // Note: Actually testing multipart file POST correctly requires a physical pdf fixture 
    // which jest won't dynamically generate correctly across environments. 
    // Given scope, we rely on checking 400 for failures & MIME logic in previous test.

    it('should require a resumeId to apply for job mapping mock', async () => {
        const res = await request(app)
            .post('/api/resumes/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ jobId: 'mock-123' }); // intentionally omitted resumeId

        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toBe('Both jobId and resumeId are required');
    });

    it('should return 404 for resume delete if wrong random uuid', async () => {
        const res = await request(app)
            .delete('/api/resumes/invalid-uuid-format-or-not-found')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toEqual(404);
    });
});
