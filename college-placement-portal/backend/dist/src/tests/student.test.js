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
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
describe('Student Profile Endpoints', () => {
    let token = '';
    const EMAIL = 'test_student_prof@example.com';
    const PASS = 'Password@123';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Clean up any existing test data
        yield prisma.internship.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.certification.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.resume.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.studentDocument.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.student.deleteMany({ where: { user: { email: EMAIL } } });
        yield prisma.user.deleteMany({ where: { email: EMAIL } });
        // Create verified user + student directly
        const hash = yield bcrypt_1.default.hash(PASS, 10);
        const user = yield prisma.user.create({
            data: { email: EMAIL, password: hash, role: 'STUDENT', isVerified: true },
        });
        yield prisma.student.create({
            data: { userId: user.id, firstName: 'Test', lastName: 'Profile', branch: 'CS', course: 'B.Tech', cgpa: 8.0 },
        });
        // Login to get token
        const res = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: EMAIL, password: PASS });
        token = res.body.token;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.internship.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.certification.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.resume.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.studentDocument.deleteMany({ where: { student: { user: { email: EMAIL } } } });
        yield prisma.student.deleteMany({ where: { user: { email: EMAIL } } });
        yield prisma.user.deleteMany({ where: { email: EMAIL } });
        yield prisma.$disconnect();
    }));
    it('GET /api/student/profile - should return the student profile', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/student/profile').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('firstName', 'Test');
        expect(res.body.data).toHaveProperty('branch', 'CS');
    }));
    it('PUT /api/student/profile - should update profile fields', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .put('/api/student/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ city: 'Mumbai', cgpa: 8.5, semester: 6, linkedin: 'https://linkedin.com/in/test' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.city).toBe('Mumbai');
        expect(res.body.data.cgpa).toBe(8.5);
    }));
    it('PUT /api/student/profile - should reject invalid cgpa', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .put('/api/student/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ cgpa: 15 }); // out of range
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    }));
    it('POST /api/student/resume - should return 400 when no file attached', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/student/resume')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(400);
    }));
    it('GET /api/student/resumes - should list resumes (empty)', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/student/resumes').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    }));
    it('POST /api/student/internships - should add an internship', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/student/internships')
            .set('Authorization', `Bearer ${token}`)
            .send({ company: 'Google', role: 'SWE Intern', startDate: '2024-05-01', endDate: '2024-07-31', description: 'Backend work' });
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.company).toBe('Google');
    }));
    it('POST /api/student/certifications - should add a certification', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/student/certifications')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'AWS Solutions Architect', organization: 'Amazon', issueDate: '2024-01-15' });
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe('AWS Solutions Architect');
    }));
    it('GET /api/student/profile - should include internships and certifications', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/student/profile').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.internships.length).toBeGreaterThanOrEqual(1);
        expect(res.body.data.certifications.length).toBeGreaterThanOrEqual(1);
    }));
    it('GET /api/student/profile - should return 401 without token', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/student/profile');
        expect(res.statusCode).toBe(401);
    }));
});
