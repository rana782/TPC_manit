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
describe('Application Endpoints', () => {
    const studentUser = { email: 'student_app_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_app_test@example.com', password: 'Password@123', role: 'SPOC' };
    let studentToken = '';
    let spocToken = '';
    let jobId = '';
    let resumeId = '';
    let studentUserId = '';
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
        const spocIdRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(spocUser);
        // Verify SPOC User to allow posting
        yield prisma.user.update({
            where: { email: spocUser.email },
            data: { isVerified: true }
        });
        // Login to get tokens
        const studentRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = studentRes.body.token;
        studentUserId = studentRes.body.user.id;
        const spocRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;
        // Setup the SPOC Job that STRICTLY requires 'cgpa'
        const jobRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            role: 'Data Scientist',
            companyName: 'DeepData',
            description: 'We need smart people with degrees.',
            requiredProfileFields: JSON.stringify(['cgpa', 'resume']),
            applicationDeadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
            cgpaMin: 8.5,
            customQuestions: JSON.stringify([{ id: '1', label: 'Why AI?', type: 'text', required: true }])
        });
        jobId = jobRes.body.job.id;
        // Setup the Student profile but DELIBERATELY OMIT 'cgpa' initially
        yield (0, supertest_1.default)(app_1.default).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'App', lastName: 'Maker'
        });
        // Inject a raw mock resume because we bypassed multer in testing
        const studentModel = yield prisma.student.findUnique({ where: { userId: studentUserId } });
        const resumeRef = yield prisma.resume.create({
            data: {
                studentId: studentModel.id,
                fileName: 'test.pdf',
                fileUrl: '/uploads/test.pdf'
            }
        });
        resumeId = resumeRef.id;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        yield prisma.$disconnect();
    }));
    it('should REJECT application if student lacks a required profile field like cgpa', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ jobId, resumeId });
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('missing required fields');
    }));
    it('should ALLOW application once profile fields are completed and capture them into extraAnswers', () => __awaiter(void 0, void 0, void 0, function* () {
        // Fill in the missing CGPA natively via internal profile hook
        yield (0, supertest_1.default)(app_1.default).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'App', lastName: 'Maker', cgpa: 9.8
        });
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
            jobId,
            resumeId,
            answers: {
                'Why AI?': 'Because it is the future.'
            }
        });
        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.application.applicationData).toHaveProperty('cgpa', 9.8);
        expect(res.body.application.applicationData).toHaveProperty('resume');
        expect(res.body.application.extraAnswers).toHaveProperty('Why AI?', 'Because it is the future.');
        // ATS should run synchronously and populate
        expect(res.body.application).toHaveProperty('atsScore');
    }));
    it('should REJECT DUPLICATE applications to the exact same job', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ jobId, resumeId });
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('already applied');
    }));
});
