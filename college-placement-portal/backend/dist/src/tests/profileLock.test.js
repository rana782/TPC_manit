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
describe('Profile Locking Endpoints', () => {
    const studentUser = { email: 'student_lock_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_lock_test@example.com', password: 'Password@123', role: 'SPOC' };
    const spocUser2 = { email: 'spoc_lock_test2@example.com', password: 'Password@123', role: 'SPOC' };
    const coordUser = { email: 'coord_lock_test@example.com', password: 'Password@123', role: 'COORDINATOR' };
    let studentToken = '';
    let spocToken = '';
    let coordToken = '';
    let studentId = '';
    let jobId = '';
    let resumeId = '';
    let applicationId = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.studentDocument.deleteMany({});
        yield prisma.placementRecord.deleteMany({});
        yield prisma.profileLock.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email, spocUser2.email, coordUser.email] } }
        });
        // Register and login all users
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(studentUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(spocUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(coordUser);
        const sRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = sRes.body.token;
        // Verify SPOC so they can post jobs/lock
        const spocModel = yield prisma.user.findUnique({ where: { email: spocUser.email } });
        yield prisma.user.update({ where: { id: spocModel.id }, data: { isVerified: true } });
        const spocRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;
        const coordRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        coordToken = coordRes.body.token;
        // Create student profile
        yield (0, supertest_1.default)(app_1.default).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'Lock', lastName: 'Test', cgpa: 8.5
        });
        const studentProfile = yield prisma.student.findUnique({ where: { userId: sRes.body.user.id } });
        studentId = studentProfile.id;
        // Create resume
        const r = yield prisma.resume.create({ data: { studentId, fileName: 'test.pdf', fileUrl: '/uploads/test.pdf' } });
        resumeId = r.id;
        // Create job
        const jobRes = yield (0, supertest_1.default)(app_1.default).post('/api/jobs').set('Authorization', `Bearer ${spocToken}`).send({
            title: 'Mock Job',
            company: 'MockCorp',
            description: 'Test job role',
            requiredProfileFields: ['cgpa'],
            deadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
        });
        jobId = ((_a = jobRes.body.job) === null || _a === void 0 ? void 0 : _a.id) || ((_b = jobRes.body.data) === null || _b === void 0 ? void 0 : _b.id) || ((_c = (yield prisma.job.findFirst())) === null || _c === void 0 ? void 0 : _c.id);
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.placementRecord.deleteMany({});
        yield prisma.profileLock.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email, spocUser2.email, coordUser.email] } }
        });
        yield prisma.$disconnect();
    }));
    it('1. SPOC should be able to explicitly lock a student profile', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/profile-lock/${studentId}/lock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            lockType: 'DEBARRED',
            reason: 'Disciplinary Action'
        });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.student.isLocked).toBe(true);
        expect(res.body.data.lock.lockType).toBe('DEBARRED');
    }));
    it('2. Locked student should not be able to apply for jobs', () => __awaiter(void 0, void 0, void 0, function* () {
        const applyRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
            jobId,
            resumeId
        });
        expect(applyRes.status).toBe(403);
        expect(applyRes.body.success).toBe(false);
        expect(applyRes.body.message).toMatch(/profile is locked/i);
    }));
    it('3. SPOC should NOT be able to unlock the student', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/profile-lock/${studentId}/unlock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({});
        expect(res.status).toBe(403);
    }));
    it('4. Coordinator should be able to unlock the student', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/profile-lock/${studentId}/unlock`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.isLocked).toBe(false);
    }));
    it('5. SPOC cannot lock themselves', () => __awaiter(void 0, void 0, void 0, function* () {
        // Create mock student entity mapped to SPOC user to simulate self-lock
        const spocObj = yield prisma.user.findUnique({ where: { email: spocUser.email } });
        const spocStudent = yield prisma.student.create({ data: { userId: spocObj.id, firstName: 'Spoc', lastName: 'Self' } });
        const res = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/profile-lock/${spocStudent.id}/lock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({ lockType: 'DEBARRED', reason: 'Self lock' });
        yield prisma.student.delete({ where: { id: spocStudent.id } });
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('cannot lock your own');
    }));
    it('6. SPOC locking as PLACED_ON_CAMPUS creates placement record', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/profile-lock/${studentId}/lock`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            lockType: 'PLACED_ON_CAMPUS',
            reason: 'Off campus confirmed',
            companyName: 'TestCo',
            role: 'SDE',
            ctc: '25 LPA'
        });
        expect(res.status).toBe(201);
        expect(res.body.data.lock.lockType).toBe('PLACED_ON_CAMPUS');
        // Check placement record
        const pRecs = yield prisma.placementRecord.findMany({ where: { studentId } });
        expect(pRecs.length).toBe(1);
        expect(pRecs[0].companyName).toBe('TestCo');
    }));
});
