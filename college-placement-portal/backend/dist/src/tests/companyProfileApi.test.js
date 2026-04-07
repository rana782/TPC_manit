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
describe('Company profile lookup/suggest APIs', () => {
    const coordUser = { email: 'coord_company_api@example.com', password: 'Password@123', role: 'COORDINATOR' };
    let token = '';
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.companyProfile.deleteMany({});
        yield prisma.user.deleteMany({ where: { email: coordUser.email } });
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/register').send({ name: 'Coord Company', email: coordUser.email, password: coordUser.password });
        yield (0, supertest_1.default)(app_1.default).post('/api/auth/verify-email').send({ email: coordUser.email, otp: '123456' });
        yield prisma.user.update({
            where: { email: coordUser.email },
            data: { role: 'COORDINATOR', isVerified: true }
        });
        const login = yield (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
        token = login.body.token;
        yield prisma.companyProfile.upsert({
            where: { normalizedName: 'tcs' },
            update: { companyName: 'TCS', rating: 4.2, reviewCount: 120345, source: 'seed' },
            create: { companyName: 'TCS', normalizedName: 'tcs', rating: 4.2, reviewCount: 120345, source: 'seed' }
        });
        yield prisma.companyProfile.upsert({
            where: { normalizedName: 'infosys' },
            update: { companyName: 'Infosys', rating: 3.9, reviewCount: 80000, source: 'seed' },
            create: { companyName: 'Infosys', normalizedName: 'infosys', rating: 3.9, reviewCount: 80000, source: 'seed' }
        });
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield prisma.companyProfile.deleteMany({});
        yield prisma.user.deleteMany({ where: { email: coordUser.email } });
        yield prisma.$disconnect();
    }));
    test('lookup should return found by normalized name', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/companies/lookup?name=TCS Ltd')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.found).toBe(true);
        expect(res.body.rating).toBe(4.2);
        expect(res.body.reviews).toBe(120345);
    }));
    test('suggest should return list by partial query', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/companies/suggest?q=inf')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].companyName).toBe('Infosys');
    }));
});
