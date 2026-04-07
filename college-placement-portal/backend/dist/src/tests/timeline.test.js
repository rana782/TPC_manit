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
describe('Timeline & Result Declaration Endpoints', () => {
    const studentUser = { email: 'student_timeline@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_timeline@example.com', password: 'Password@123', role: 'SPOC' };
    let studentToken = '';
    let spocToken = '';
    let jobId = '';
    let studentId = '';
    let studentUserId = '';
    let resumeId = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        // Cleanup existing test data
        yield prisma.placementRecord.deleteMany({});
        yield prisma.jobStage.deleteMany({});
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        // Register Users
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(studentUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(spocUser);
        // Verify SPOC User
        yield prisma.user.update({
            where: { email: spocUser.email },
            data: { isVerified: true }
        });
        // Login Users
        const studentRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = studentRes.body.token;
        studentUserId = studentRes.body.user.id;
        const spocRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = spocRes.body.token;
        // Setup Student Profile
        yield (0, supertest_1.default)(app_1.default).post('/api/student/profile').set('Authorization', `Bearer ${studentToken}`).send({
            firstName: 'Timeline', lastName: 'Tester', cgpa: 9.0
        });
        // Setup Resume
        const studentModel = yield prisma.student.findUnique({ where: { userId: studentUserId } });
        studentId = studentModel.id;
        const resumeRef = yield prisma.resume.create({
            data: {
                studentId: studentId,
                fileName: 'timeline.pdf',
                fileUrl: '/uploads/timeline.pdf'
            }
        });
        resumeId = resumeRef.id;
        // Setup Job (ON_CAMPUS)
        const jobRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            role: 'Software Engineer',
            companyName: 'TimelineTech',
            description: 'Test job',
            applicationDeadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
            cgpaMin: 7.0,
        });
        if (!jobRes.body.success) {
            console.error("Job Creation Failed:", jobRes.body);
        }
        jobId = (_a = jobRes.body.job) === null || _a === void 0 ? void 0 : _a.id;
        // Apply to job
        const appRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ jobId, resumeId });
        if (!appRes.body.success) {
            console.error("Application Failed:", appRes.body);
        }
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.placementRecord.deleteMany({});
        yield prisma.jobStage.deleteMany({});
        yield prisma.jobApplication.deleteMany({});
        yield prisma.job.deleteMany({});
        yield prisma.resume.deleteMany({});
        yield prisma.student.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [studentUser.email, spocUser.email] } }
        });
        yield prisma.$disconnect();
    }));
    it('should allow SPOC to add a Job Stage', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .patch(`/api/jobs/${jobId}/stage`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            name: 'Online Assessment',
            scheduledDate: new Date().toISOString()
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stage.name).toBe('Online Assessment');
    }));
    it('should allow fetching jobs with stages by student', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/applications')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.applications[0].job.stages.length).toBeGreaterThan(0);
        expect(res.body.applications[0].job.stages[0].name).toBe('Online Assessment');
    }));
    it('should declare results, create PlacementRecord, and lock an ON_CAMPUS student', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/jobs/${jobId}/results`)
            .set('Authorization', `Bearer ${spocToken}`)
            .send({
            placedStudentIds: [studentId]
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        // Verify Application status updated
        const application = yield prisma.jobApplication.findFirst({
            where: { jobId, studentId }
        });
        expect(application === null || application === void 0 ? void 0 : application.status).toBe('ACCEPTED');
        // Verify PlacementRecord created
        const placement = yield prisma.placementRecord.findFirst({
            where: { jobId, studentId }
        });
        expect(placement).not.toBeNull();
        // Verify profile locked natively
        const studentProfile = yield prisma.student.findUnique({
            where: { id: studentId }
        });
        expect(studentProfile === null || studentProfile === void 0 ? void 0 : studentProfile.isLocked).toBe(true);
        expect(studentProfile === null || studentProfile === void 0 ? void 0 : studentProfile.lockedReason).toContain('TimelineTech');
    }));
});
