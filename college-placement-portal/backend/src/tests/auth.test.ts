import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Auth Endpoints', () => {
    const testUser = {
        name: 'Test Student',
        email: 'test_auth@example.com',
        password: 'Password@123',
        role: 'STUDENT'
    };

    let token = '';

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { email: testUser.email } });
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: testUser.email } });
        await prisma.$disconnect();
    });

    it('should register a new user and return success without a token initially (OTP required)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('OTP sent to email');
    });

    it('should fail login if not verified', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: testUser.password
            });

        expect(res.statusCode).toEqual(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Please verify your email first');
    });

    it('should verify email with valid OTP', async () => {
        // Since we mock sending OTP, find it from DB
        const user = await prisma.user.findUnique({ where: { email: testUser.email } });
        expect(user).toBeDefined();

        // Hack for testing since we hash OTPs and can't read them backward:
        // Let's generate a known one, hash it, and shove it manually in DB to test the verify route
        const bcrypt = require('bcrypt');
        const knownOtp = '123456';
        const otpHash = await bcrypt.hash(knownOtp, 10);
        await prisma.user.update({
            where: { email: testUser.email },
            data: { otpHash, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) }
        });

        const res = await request(app)
            .post('/api/auth/verify-email')
            .send({
                email: testUser.email,
                otp: knownOtp
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('token');
        token = res.body.token; // save token for later
    });

    it('should login successfully once verified', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: testUser.password
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('token');
    });

    it('should handle forgot password and reset flows', async () => {
        const forgotRes = await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: testUser.email });

        expect(forgotRes.statusCode).toEqual(200);
        expect(forgotRes.body.success).toBe(true);

        // Prep OTP
        const bcrypt = require('bcrypt');
        const knownOtp = '654321';
        const otpHash = await bcrypt.hash(knownOtp, 10);
        await prisma.user.update({
            where: { email: testUser.email },
            data: { otpHash, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) }
        });

        const resetRes = await request(app)
            .post('/api/auth/reset-password')
            .send({
                email: testUser.email,
                otp: knownOtp,
                newPassword: 'NewPassword!@#'
            });

        expect(resetRes.statusCode).toEqual(200);
        expect(resetRes.body.success).toBe(true);

        // Try login with new password
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: 'NewPassword!@#'
            });

        expect(loginRes.statusCode).toEqual(200);
        expect(loginRes.body.success).toBe(true);
    });

    it('should get current user info (/api/auth/me) with valid token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user).toHaveProperty('email', testUser.email);
    });

    it('should fail /api/auth/me without token', async () => {
        const res = await request(app)
            .get('/api/auth/me');

        expect(res.statusCode).toEqual(401);
    });
});
