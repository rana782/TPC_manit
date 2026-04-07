"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
describe('Auth Endpoints', () => {
    const testUser = {
        name: 'Test Student',
        email: 'test_auth@example.com',
        password: 'Password@123',
        role: 'STUDENT'
    };
    let token = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.user.deleteMany({ where: { email: testUser.email } });
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.user.deleteMany({ where: { email: testUser.email } });
        yield prisma.$disconnect();
    }));
    it('should register a new user and return success without a token initially (OTP required)', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/register')
            .send(testUser);
        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('OTP sent to email');
    }));
    it('should fail login if not verified', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/login')
            .send({
            email: testUser.email,
            password: testUser.password
        });
        expect(res.statusCode).toEqual(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Please verify your email first');
    }));
    it('should verify email with valid OTP', () => __awaiter(void 0, void 0, void 0, function* () {
        // Since we mock sending OTP, find it from DB
        const user = yield prisma.user.findUnique({ where: { email: testUser.email } });
        expect(user).toBeDefined();
        // Hack for testing since we hash OTPs and can't read them backward:
        // Let's generate a known one, hash it, and shove it manually in DB to test the verify route
        const bcrypt = require('bcrypt');
        const knownOtp = '123456';
        const otpHash = yield bcrypt.hash(knownOtp, 10);
        yield prisma.user.update({
            where: { email: testUser.email },
            data: { otpHash, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) }
        });
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/verify-email')
            .send({
            email: testUser.email,
            otp: knownOtp
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('token');
        token = res.body.token; // save token for later
    }));
    it('should login successfully once verified', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/login')
            .send({
            email: testUser.email,
            password: testUser.password
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('token');
    }));
    it('should handle forgot password and reset flows', () => __awaiter(void 0, void 0, void 0, function* () {
        const forgotRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/forgot-password')
            .send({ email: testUser.email });
        expect(forgotRes.statusCode).toEqual(200);
        expect(forgotRes.body.success).toBe(true);
        // Prep OTP
        const bcrypt = require('bcrypt');
        const knownOtp = '654321';
        const otpHash = yield bcrypt.hash(knownOtp, 10);
        yield prisma.user.update({
            where: { email: testUser.email },
            data: { otpHash, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) }
        });
        const resetRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/reset-password')
            .send({
            email: testUser.email,
            otp: knownOtp,
            newPassword: 'NewPassword!@#'
        });
        expect(resetRes.statusCode).toEqual(200);
        expect(resetRes.body.success).toBe(true);
        // Try login with new password
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/auth/login')
            .send({
            email: testUser.email,
            password: 'NewPassword!@#'
        });
        expect(loginRes.statusCode).toEqual(200);
        expect(loginRes.body.success).toBe(true);
    }));
    it('should get current user info (/api/auth/me) with valid token', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user).toHaveProperty('email', testUser.email);
    }));
    it('should fail /api/auth/me without token', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/auth/me');
        expect(res.statusCode).toEqual(401);
    }));
});
