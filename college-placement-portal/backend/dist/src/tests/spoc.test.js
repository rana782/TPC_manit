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
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const client_1 = require("@prisma/client");
const jwt_util_1 = require("../utils/jwt.util");
const prisma = new client_1.PrismaClient();
describe('Module 09 - SPOC Validation & Coordinator Overrides', () => {
    let coordinatorToken;
    let spocToken;
    let studentToken;
    let spocId;
    let coordinatorId;
    let studentId;
    let studentUserId;
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Clear DB
        yield prisma.actionOverride.deleteMany();
        yield prisma.profileLock.deleteMany();
        yield prisma.jobApplication.deleteMany();
        yield prisma.job.deleteMany();
        yield prisma.student.deleteMany();
        yield prisma.user.deleteMany();
        // Create Coordinator
        const coordinator = yield prisma.user.create({
            data: { email: 'coord_override@test.com', password: 'hash', role: 'COORDINATOR', isVerified: true }
        });
        coordinatorId = coordinator.id;
        coordinatorToken = (0, jwt_util_1.signToken)(coordinator.id, coordinator.email, 'COORDINATOR');
        // Create SPOC (unverified logic)
        const spoc = yield prisma.user.create({
            data: { email: 'spoc_override@test.com', password: 'hash', role: 'SPOC', isVerified: false }
        });
        spocId = spoc.id;
        spocToken = (0, jwt_util_1.signToken)(spoc.id, spoc.email, 'SPOC');
        // Create Student
        const studentUser = yield prisma.user.create({
            data: { email: 'student_override@test.com', password: 'hash', role: 'STUDENT', isVerified: true }
        });
        studentUserId = studentUser.id;
        studentToken = (0, jwt_util_1.signToken)(studentUser.id, studentUser.email, 'STUDENT');
        const student = yield prisma.student.create({
            data: {
                userId: studentUser.id,
                firstName: 'Test',
                lastName: 'Student',
                scholarNo: '111222',
                branch: 'CSE',
                cgpa: 8.5
            }
        });
        studentId = student.id;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.$disconnect();
    }));
    describe('SPOC Verification Enforcement', () => {
        it('should prevent unverified SPOC from creating a job', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .post('/api/jobs')
                .set('Authorization', `Bearer ${spocToken}`)
                .send({
                role: 'SDE',
                companyName: 'Test Inc',
                description: 'Desc',
                applicationDeadline: new Date().toISOString()
            });
            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/verified by admin first/);
        }));
        it('should fetch pending SPOCs', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .get('/api/admin/spocs/pending')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            expect(res.status).toBe(200);
            expect(res.body.spocs.length).toBeGreaterThan(0);
            expect(res.body.spocs[0].email).toBe('spoc_override@test.com');
        }));
        it('should allow Coordinator to approve SPOC', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .patch(`/api/admin/spocs/${spocId}/approve`)
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send();
            expect(res.status).toBe(200);
            expect(res.body.spoc.isVerified).toBe(true);
            expect(res.body.spoc.permJobCreate).toBe(true);
            expect(res.body.spoc.permLockProfile).toBe(false);
        }));
        it('should allow verified SPOC to create a job', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .post('/api/jobs')
                .set('Authorization', `Bearer ${spocToken}`)
                .send({
                role: 'SDE',
                companyName: 'Test Inc',
                description: 'Testing Job Desc',
                applicationDeadline: new Date(Date.now() + 86400000).toISOString()
            });
            expect(res.status).toBe(201);
            expect(res.body.job).toHaveProperty('id');
        }));
    });
    describe('SPOC granular permissions', () => {
        it('should deny SPOC from locking a profile default permission (false)', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .post(`/api/profile-lock/${studentId}/lock`)
                .set('Authorization', `Bearer ${spocToken}`)
                .send({ lockType: 'DEBARRED', reason: 'Test' });
            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/permission to lock profiles/);
        }));
        it('should allow Coordinator to update SPOC permissions', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .patch(`/api/admin/spocs/${spocId}/permissions`)
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ permLockProfile: true });
            expect(res.status).toBe(200);
            expect(res.body.spoc.permLockProfile).toBe(true);
        }));
        it('should allow SPOC to lock profile after permission granted', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .post(`/api/profile-lock/${studentId}/lock`)
                .set('Authorization', `Bearer ${spocToken}`)
                .send({ lockType: 'DEBARRED', reason: 'Misbehavior' });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        }));
    });
    describe('Coordinator Overrides', () => {
        it('should allow Coordinator to override and unlock a profile and generate log', () => __awaiter(void 0, void 0, void 0, function* () {
            // First check it's locked
            const stuBefore = yield prisma.student.findUnique({ where: { id: studentId } });
            expect(stuBefore === null || stuBefore === void 0 ? void 0 : stuBefore.isLocked).toBe(true);
            // Override unlock
            const res = yield (0, supertest_1.default)(app_1.default)
                .post(`/api/admin/overrides`)
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({
                actionType: 'UNLOCK_STUDENT',
                entity: 'Student',
                entityId: studentUserId, // we coded backend to lookup by Student's user ID
                reason: 'Admin decided to override logic'
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            // Verify Student Unlocked
            const stuAfter = yield prisma.student.findUnique({ where: { id: studentId } });
            expect(stuAfter === null || stuAfter === void 0 ? void 0 : stuAfter.isLocked).toBe(false);
            // Verify Log
            const logs = yield prisma.actionOverride.findMany({ where: { actionType: 'UNLOCK_STUDENT' } });
            expect(logs.length).toBe(1);
            expect(logs[0].coordinatorId).toBe(coordinatorId);
            expect(logs[0].reason).toBe('Admin decided to override logic');
        }));
    });
});
