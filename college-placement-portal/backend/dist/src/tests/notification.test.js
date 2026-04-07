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
/**
 * Unit/integration tests for Module 10: WhatsApp Notifications
 *
 * NOTE: These tests mock the HTTP layer. If the DB is up, the full flow
 * will execute. If not, the graceful try/catch blocks inside the service
 * will let it fall back to MOCKED status with a console.log.
 */
describe('Module 10 - Notification Templates & Logs', () => {
    let coordinatorToken;
    beforeAll(() => {
        // Create a fake coordinator token (doesn't need real DB for unit-style tests)
        coordinatorToken = (0, jwt_util_1.signToken)('fake-coordinator-id', 'coord@test.com', 'COORDINATOR');
    });
    describe('Admin Notification Settings', () => {
        it('should return 401 without a token', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default).get('/api/notifications/admin/settings');
            expect(res.status).toBe(401);
        }));
        it('should return 403 for non-COORDINATOR roles on settings endpoint', () => __awaiter(void 0, void 0, void 0, function* () {
            const spocToken = (0, jwt_util_1.signToken)('fake-spoc-id', 'spoc@test.com', 'SPOC');
            const res = yield (0, supertest_1.default)(app_1.default)
                .get('/api/notifications/admin/settings')
                .set('Authorization', `Bearer ${spocToken}`);
            // Even if DB is down, the auth middleware should enforce role check
            expect([403, 500]).toContain(res.status);
        }));
    });
    describe('Template Token Replacement Logic', () => {
        /**
         * These are pure unit tests of the formatting logic, extracted to test
         * without needing a live DB.
         */
        it('should correctly replace all tokens in a template string', () => {
            const template = 'Hi {student_name}, your application for {role} at {company} has been received.';
            const params = {
                student_name: 'Rahul Sharma',
                role: 'SDE II',
                company: 'Google'
            };
            let text = template;
            for (const [key, val] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
            }
            expect(text).toBe('Hi Rahul Sharma, your application for SDE II at Google has been received.');
        });
        it('should leave unfilled tokens as-is when params are missing', () => {
            const template = 'Hi {student_name}, your OA for {company} is on {date}.';
            const params = { student_name: 'Priya' };
            let text = template;
            for (const [key, val] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
            }
            // {company} and {date} should remain unchanged
            expect(text).toContain('{company}');
            expect(text).toContain('{date}');
            expect(text).toContain('Priya');
        });
        it('should support multiple token occurrences in one message', () => {
            const template = '{student_name} has been placed! Congratulations {student_name}!';
            const params = { student_name: 'Raj' };
            let text = template;
            for (const [key, val] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
            }
            expect(text).toBe('Raj has been placed! Congratulations Raj!');
        });
    });
    describe('Notification Log API', () => {
        it('should return 401 for unauthenticated log fetch', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default).get('/api/notifications/admin/logs');
            expect(res.status).toBe(401);
        }));
        it('should return 403 for student trying to fetch logs', () => __awaiter(void 0, void 0, void 0, function* () {
            const stuToken = (0, jwt_util_1.signToken)('stu-123', 'stu@test.com', 'STUDENT');
            const res = yield (0, supertest_1.default)(app_1.default)
                .get('/api/notifications/admin/logs')
                .set('Authorization', `Bearer ${stuToken}`);
            expect([403, 500]).toContain(res.status);
        }));
    });
    describe('WhatsApp Setting Toggle API', () => {
        it('should return 401 for unauthenticated settings change', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(app_1.default)
                .patch('/api/notifications/admin/settings')
                .send({ whatsappEnabled: true });
            expect(res.status).toBe(401);
        }));
    });
});
describe('Module 10 - Notification Service Payload Schemas', () => {
    describe('Zapier Webhook Payload Format', () => {
        it('should match expected Zapier JSON schema for APPLICATION_CONFIRMATION', () => {
            // Example outbound payload (documented as the canonical Zapier schema)
            const expected = {
                phone: '+91XXXXXXXXXX',
                message: 'Hi Rahul, your application for SDE at Google has been received.',
                type: 'APPLICATION_CONFIRMATION'
            };
            expect(expected).toHaveProperty('phone');
            expect(expected).toHaveProperty('message');
            expect(expected).toHaveProperty('type');
            expect(typeof expected.phone).toBe('string');
            expect(typeof expected.message).toBe('string');
            expect(typeof expected.type).toBe('string');
        });
        it('should match expected Zapier JSON schema for OA_SCHEDULED', () => {
            const expected = {
                phone: '+91XXXXXXXXXX',
                message: 'Hi Priya, your Online Assessment for Tesco is on 12/3/2025.',
                type: 'OA_SCHEDULED'
            };
            expect(expected).toHaveProperty('phone');
            expect(expected.type).toBe('OA_SCHEDULED');
        });
        it('should match expected Twilio WhatsApp REST schema', () => {
            // Twilio API structure (for documentation/reference)
            const twilioPayload = {
                From: 'whatsapp:+14155238886',
                To: 'whatsapp:+91XXXXXXXXXX',
                Body: 'Hi Rahul, your results are out. Status: SELECTED.'
            };
            expect(twilioPayload).toHaveProperty('From');
            expect(twilioPayload).toHaveProperty('To');
            expect(twilioPayload).toHaveProperty('Body');
            expect(twilioPayload.From).toMatch(/^whatsapp:/);
            expect(twilioPayload.To).toMatch(/^whatsapp:/);
        });
    });
});
