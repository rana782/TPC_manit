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
describe('Admin Endpoints', () => {
    const coordUser = { email: 'coord_admin_test@example.com', password: 'Password@123', role: 'COORDINATOR' };
    const targetUser = { email: 'target_admin_test@example.com', password: 'Password@123', role: 'STUDENT' };
    const spocUser = { email: 'spoc_admin_test@example.com', password: 'Password@123', role: 'SPOC' };
    let coordToken = '';
    let spocToken = '';
    let targetUserId = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, targetUser.email, spocUser.email] } }
        });
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(coordUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(targetUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(spocUser);
        const cRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        coordToken = cRes.body.token;
        const sRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = sRes.body.token;
        const tUser = yield prisma.user.findUnique({ where: { email: targetUser.email } });
        targetUserId = tUser.id;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, targetUser.email, spocUser.email] } }
        });
        yield prisma.$disconnect();
    }));
    it('should block non-coordinator from accessing admin endpoints', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${spocToken}`);
        expect(res.statusCode).toBe(403);
    }));
    it('should return correct stats shape for coordinator', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${coordToken}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stats).toHaveProperty('totalStudents');
        expect(res.body.stats).toHaveProperty('totalJobs');
        expect(res.body.stats).toHaveProperty('placedStudents');
        expect(res.body.stats).toHaveProperty('lockedProfiles');
        expect(res.body.stats).toHaveProperty('applicationsByStatus');
    }));
    it('should list all users with pagination', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/admin/users?page=1&limit=10')
            .set('Authorization', `Bearer ${coordToken}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.users)).toBe(true);
        expect(res.body).toHaveProperty('total');
    }));
    it('should filter users by role', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/admin/users?role=STUDENT')
            .set('Authorization', `Bearer ${coordToken}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.users.every((u) => u.role === 'STUDENT')).toBe(true);
    }));
    it('should disable a user and block their login', () => __awaiter(void 0, void 0, void 0, function* () {
        const disableRes = yield (0, supertest_1.default)(app_1.default)
            .patch(`/api/admin/users/${targetUserId}/disable`)
            .set('Authorization', `Bearer ${coordToken}`);
        expect(disableRes.statusCode).toBe(200);
        expect(disableRes.body.user.isDisabled).toBe(true);
        // Disabled user should fail authenticated endpoints
        const loginRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: targetUser.email, password: targetUser.password });
        const disabledToken = loginRes.body.token;
        const profileRes = yield (0, supertest_1.default)(app_1.default)
            .get('/api/student/profile')
            .set('Authorization', `Bearer ${disabledToken}`);
        expect(profileRes.statusCode).toBe(403);
        expect(profileRes.body.message).toContain('disabled');
    }));
    it('should re-enable a user restoring their access', () => __awaiter(void 0, void 0, void 0, function* () {
        const enableRes = yield (0, supertest_1.default)(app_1.default)
            .patch(`/api/admin/users/${targetUserId}/enable`)
            .set('Authorization', `Bearer ${coordToken}`);
        expect(enableRes.statusCode).toBe(200);
        expect(enableRes.body.user.isDisabled).toBe(false);
    }));
});
