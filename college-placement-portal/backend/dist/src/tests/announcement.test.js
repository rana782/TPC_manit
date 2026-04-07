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
describe('Announcement Endpoints', () => {
    const coordUser = { email: 'coord_ann_test@example.com', password: 'Password@123', role: 'COORDINATOR' };
    const spocUser = { email: 'spoc_ann_test@example.com', password: 'Password@123', role: 'SPOC' };
    const studentUser = { email: 'student_ann_test@example.com', password: 'Password@123', role: 'STUDENT' };
    let coordToken = '';
    let spocToken = '';
    let studentToken = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.announcement.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, spocUser.email, studentUser.email] } }
        });
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(coordUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(spocUser);
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send(studentUser);
        const cRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        coordToken = cRes.body.token;
        const sRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: spocUser.email, password: spocUser.password });
        spocToken = sRes.body.token;
        const stRes = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: studentUser.email, password: studentUser.password });
        studentToken = stRes.body.token;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.announcement.deleteMany({});
        yield prisma.user.deleteMany({
            where: { email: { in: [coordUser.email, spocUser.email, studentUser.email] } }
        });
        yield prisma.$disconnect();
    }));
    it('should block STUDENT from creating announcements', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ title: 'Hack', body: 'Unauthorized', audience: 'ALL' });
        expect(res.statusCode).toBe(403);
    }));
    it('should allow COORDINATOR to trigger an announcement', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
            title: 'Campus Recruitment Drive',
            body: 'TechCorp will be conducting interviews on 10th March. Eligible students please register.',
            audience: 'STUDENT'
        });
        expect(res.statusCode).toBe(202);
        expect(res.body.success).toBe(true);
        expect(res.body.announcement.title).toBe('Campus Recruitment Drive');
        expect(res.body.announcement.audience).toBe('STUDENT');
    }));
    it('should store the announcement log with SENT status (mock mode)', () => __awaiter(void 0, void 0, void 0, function* () {
        // Give async save a moment
        yield new Promise(r => setTimeout(r, 300));
        const logs = yield prisma.announcement.findMany({
            where: { zapierStatus: 'SENT' }
        });
        expect(logs.length).toBeGreaterThanOrEqual(1);
        expect(logs[0].zapierResponse).toBe('MOCK_ZAPIER_SEND');
    }));
    it('should allow SPOC to trigger announcement and view logs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, supertest_1.default)(app_1.default)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${spocToken}`)
            .send({ title: 'Pre-Placement Talk', body: 'Attend the PPT by InfraCorp tomorrow.', audience: 'ALL' });
        yield new Promise(r => setTimeout(r, 300));
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/announcements/logs')
            .set('Authorization', `Bearer ${spocToken}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.announcements)).toBe(true);
        expect(res.body.announcements.length).toBeGreaterThanOrEqual(2);
    }));
    it('should validate audience field — reject invalid value', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/announcements')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ title: 'Test', body: 'Body', audience: 'INVALID_AUDIENCE' });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('audience');
    }));
    it('should include correct Zapier payload structure in stored record', () => __awaiter(void 0, void 0, void 0, function* () {
        const logs = yield prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
        const latest = logs[0];
        expect(latest).toHaveProperty('payload');
        const payload = latest.payload;
        expect(payload.event).toBe('announcement');
        expect(payload).toHaveProperty('triggeredBy');
        expect(payload).toHaveProperty('triggeredAt');
        expect(payload).toHaveProperty('portalUrl');
    }));
});
