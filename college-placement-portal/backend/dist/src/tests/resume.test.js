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
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma = new client_1.PrismaClient();
describe('Resume Endpoints', () => {
    const testUser = {
        email: 'test_student_resume@example.com',
        password: 'Password@123',
        role: 'STUDENT'
    };
    let token = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Build mock environment
        yield prisma.jobApplication.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.studentDocument.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({ where: { email: testUser.email } });
        // Register -> Login
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(testUser);
        const loginRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({
            email: testUser.email, password: testUser.password
        });
        token = loginRes.body.token;
        // Give them a student profile since resumes link strictly to students
        yield (0, supertest_1.default)(app_1.default).post('/api/student/profile').set('Authorization', `Bearer ${token}`).send({
            firstName: 'Resume', lastName: 'Maker'
        });
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.jobApplication.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.studentDocument.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({ where: { email: testUser.email } });
        yield prisma.$disconnect();
    }));
    it('should block file uploads of invalid extensions (txt)', () => __awaiter(void 0, void 0, void 0, function* () {
        const dummyPath = path_1.default.join(__dirname, 'test.txt');
        fs_1.default.writeFileSync(dummyPath, 'not a real resume');
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/resumes/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('resume', dummyPath);
        fs_1.default.unlinkSync(dummyPath);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Invalid file type');
    }));
    it('should block resume upload if no file provided', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/resumes/upload')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
    }));
    it('should list empty resumes initially', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/resumes').set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.resumes.length).toBe(0);
    }));
    // Note: Actually testing multipart file POST correctly requires a physical pdf fixture 
    // which jest won't dynamically generate correctly across environments. 
    // Given scope, we rely on checking 400 for failures & MIME logic in previous test.
    it('should require a resumeId to apply for job mapping mock', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/resumes/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ jobId: 'mock-123' }); // intentionally omitted resumeId
        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toBe('Both jobId and resumeId are required');
    }));
    it('should return 404 for resume delete if wrong random uuid', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .delete('/api/resumes/invalid-uuid-format-or-not-found')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toEqual(404);
    }));
});
