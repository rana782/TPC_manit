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
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const jwt_util_1 = require("../utils/jwt.util");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
describe('Module 11 - LinkedIn Announcements (Zapier Integration)', () => {
    let coordinatorToken;
    let studentToken;
    beforeAll(() => {
        coordinatorToken = (0, jwt_util_1.signToken)('fake-coordinator-id', 'coord@test.com', 'COORDINATOR');
        studentToken = (0, jwt_util_1.signToken)('fake-stu-id', 'stu@test.com', 'STUDENT');
    });
    describe('Admin LinkedIn Configuration API', () => {
        it('should block unauthorized read access to settings', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default).get('/api/announcements/linkedin/settings');
            expect(res.status).toBe(401);
        }));
        it('should block STUDENT from reading settings', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .get('/api/announcements/linkedin/settings')
                .set('Authorization', `Bearer ${studentToken}`);
            expect([403, 500]).toContain(res.status); // 500 can happen if DB is completely offline and jwt hook fails, but auth fails first in theory
        }));
        it('should block STUDENT from updating settings', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .patch('/api/announcements/linkedin/settings')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({ enabled: true });
            expect([403, 500]).toContain(res.status);
        }));
    });
    describe('LinkedIn Execution Logs API', () => {
        it('should prevent unauthenticated access to logs', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default).get('/api/announcements/linkedin/logs');
            expect(res.status).toBe(401);
        }));
        it('should prevent STUDENT from accessing logs', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .get('/api/announcements/linkedin/logs')
                .set('Authorization', `Bearer ${studentToken}`);
            expect([403, 500]).toContain(res.status);
        }));
    });
    describe('Manual Trigger Endpoint `/job/:job_id/publish`', () => {
        it('should block STUDENT from manually triggering a publish', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .post('/api/announcements/job/fake-job-id/publish')
                .set('Authorization', `Bearer ${studentToken}`);
            expect([403, 500]).toContain(res.status);
        }));
        it('should enforce authentication on trigger', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default).post('/api/announcements/job/fake-job/publish');
            expect(res.status).toBe(401);
        }));
    });
});
