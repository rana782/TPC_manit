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
describe('Job Posting Endpoints', () => {
    const studentUser = { email: 'student_job_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_job_test@example.com', password: 'Password@123', role: 'SPOC' };
    let studentToken = '';
    let spocToken = '';
    let testJobId = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Cleanup existing mock accounts in case previous test leaked
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.studentDocument.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        // Register Users
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(studentUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(spocUser);
        // Verify SPOC (required for creating jobs)
        yield prisma.user.update({
            where: { email: spocUser.email },
            data: { isVerified: true }
        });
        // Login to get tokens
        const studentRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = studentRes.body.token;
        const spocRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        yield prisma.$disconnect();
    }));
    it('should deny STUDENTS from creating a job', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
            role: 'Hacker',
            companyName: 'Leet',
            description: 'Super cool job',
            requiredProfileFields: '["cgpa"]',
            applicationDeadline: new Date().toISOString()
        });
        expect(res.statusCode).toEqual(403);
    }));
    it('should allow SPOCs to create a job', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            role: 'Software Engineer',
            companyName: 'Google',
            description: 'Search stuff. Needs at least 10 words.',
            requiredProfileFields: '["cgpa", "resume"]',
            customQuestions: '[{"label": "Why Google?", "type": "text", "required": true}]',
            applicationDeadline: new Date(Date.now() + 86400000).toISOString()
        });
        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.job.role).toBe('Software Engineer');
        testJobId = res.body.job.id;
    }));
    it('should return 400 for invalid job inputs', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            role: '', // Zod error length < 2
            companyName: 'T',
            description: 'Short',
            applicationDeadline: 'invalid_date'
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
    }));
    it('should list jobs for any authenticated user', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${studentToken}`); // Fetching as student
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
    }));
    it('should allow SPOC to delete a job', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/jobs/${testJobId}`)
            .set('Authorization', `Bearer ${spocToken}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
    }));
});
