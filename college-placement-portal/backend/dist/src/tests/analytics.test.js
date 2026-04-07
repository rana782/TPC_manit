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
const prisma = new client_1.PrismaClient();
let token;
beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
    // Basic setup: create/find a coordinator admin for tokens
    const email = 'analytics_admin@test.com';
    let admin = yield prisma.user.findUnique({ where: { email } });
    if (!admin) {
        admin = yield prisma.user.create({
            data: { email, password: 'hashedpassword', role: 'COORDINATOR' },
        });
    }
    const res = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email, password: 'hashedpassword' });
    token = res.body.token;
    // Optional: seed a dummy alumni record if db empty, but let's test the endpoint response structures.
}));
afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.user.deleteMany({ where: { email: 'analytics_admin@test.com' } });
    yield prisma.$disconnect();
}));
describe('Module 12: Analytics, Alumni, and ATS', () => {
    it('should fetch dashboard summary metrics', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/analytics/summary')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary).toHaveProperty('totalStudents');
        expect(res.body.summary).toHaveProperty('totalJobs');
        expect(res.body.summary).toHaveProperty('totalApplications');
        expect(res.body.summary).toHaveProperty('totalPlaced');
    }));
    it('should fetch branch comparison', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/analytics/branch-comparison')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    }));
    it('should fetch ATS config', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/ats/config')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('skillsMatch');
    }));
    it('should update ATS config successfully', () => __awaiter(void 0, void 0, void 0, function* () {
        const validConfig = {
            skillsMatch: 0.5,
            projects: 0.2,
            certifications: 0.1,
            tools: 0.1,
            experience: 0.1
        };
        const res = yield (0, supertest_1.default)(app_1.default)
            .put('/api/ats/config')
            .set('Authorization', `Bearer ${token}`)
            .send(validConfig);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.skillsMatch).toBe(0.5);
    }));
    it('should reject invalid ATS config weights that do not sum to 1.0', () => __awaiter(void 0, void 0, void 0, function* () {
        const invalidConfig = {
            skillsMatch: 0.9,
            projects: 0.9, // Over 1.0!
            certifications: 0.1,
            tools: 0.1,
            experience: 0.1
        };
        const res = yield (0, supertest_1.default)(app_1.default)
            .put('/api/ats/config')
            .set('Authorization', `Bearer ${token}`)
            .send(invalidConfig);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    }));
});
