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
require("../src/loadEnv");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const demoCompanyProfiles_1 = require("../src/utils/demoCompanyProfiles");
const prisma = new client_1.PrismaClient();
/** Future deadline so student listJobs (deadline >= today) always includes seeded jobs. */
function defaultApplicationDeadline() {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d;
}
/** Idempotent: same poster + role + company = one row; safe to run daily/CI. */
function upsertSeedJob(postedById, job) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const applicationDeadline = defaultApplicationDeadline();
        const existing = yield prisma.job.findFirst({
            where: { postedById, role: job.role, companyName: job.companyName },
        });
        const data = {
            description: job.description,
            requiredProfileFields: job.requiredProfileFields,
            eligibleBranches: (_a = job.eligibleBranches) !== null && _a !== void 0 ? _a : '[]',
            status: 'PUBLISHED',
            applicationDeadline,
            jobType: 'Full-Time',
            ctc: (_b = job.ctc) !== null && _b !== void 0 ? _b : '12 LPA',
            cgpaMin: 0,
            customQuestions: '[]',
            blockPlaced: true,
        };
        if (existing) {
            yield prisma.job.update({
                where: { id: existing.id },
                data,
            });
            return;
        }
        yield prisma.job.create({
            data: Object.assign({ postedById, role: job.role, companyName: job.companyName }, data),
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Seeding database (idempotent)...');
        const DEFAULT_PASS = 'Pass@123';
        const passwordHash = yield bcrypt_1.default.hash(DEFAULT_PASS, 10);
        const users = [
            { email: 'student@example.com', role: 'STUDENT' },
            { email: 'spoc@example.com', role: 'SPOC' },
            { email: 'coord@example.com', role: 'COORDINATOR' },
            { email: 'ui_student@example.com', role: 'STUDENT' },
            { email: 'ui_spoc@example.com', role: 'SPOC' },
            { email: 'ui_coord@example.com', role: 'COORDINATOR' },
        ];
        for (const u of users) {
            const spocPerms = u.role === 'SPOC'
                ? { permJobCreate: true, permExportCsv: true, permLockProfile: true }
                : {};
            const scholarNo = `SCH-${u.email
                .split('@')[0]
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, 12)}`;
            const createdUser = yield prisma.user.upsert({
                where: { email: u.email },
                update: Object.assign({ password: passwordHash, role: u.role, isVerified: true }, spocPerms),
                create: Object.assign({ email: u.email, password: passwordHash, role: u.role, isVerified: true }, spocPerms),
            });
            if (u.role === 'STUDENT') {
                yield prisma.student.upsert({
                    where: { userId: createdUser.id },
                    update: {
                        scholarNo,
                        firstName: 'John',
                        lastName: 'Doe',
                        branch: 'CSE',
                        course: 'BTech',
                        phone: '9876543210',
                        cgpa: 8.5,
                    },
                    create: {
                        userId: createdUser.id,
                        firstName: 'John',
                        lastName: 'Doe',
                        branch: 'CSE',
                        course: 'BTech',
                        scholarNo,
                        phone: '9876543210',
                        cgpa: 8.5,
                    },
                });
            }
            if (u.role === 'SPOC') {
                yield upsertSeedJob(createdUser.id, {
                    role: 'Software Engineer',
                    companyName: 'TechCorp Solutions',
                    description: 'Join our backend team building high-performance microservices. Looking for solid DSA and TypeScript skills.',
                    requiredProfileFields: JSON.stringify(['cgpa', 'department', 'resume']),
                });
                yield upsertSeedJob(createdUser.id, {
                    role: 'Data Analyst',
                    companyName: 'DataMinds Inc.',
                    description: 'Help us drive business intelligence. Strong SQL and Python required.',
                    requiredProfileFields: JSON.stringify(['cgpa', 'resume']),
                });
            }
        }
        yield (0, demoCompanyProfiles_1.upsertDemoCompanyProfiles)(prisma);
        console.log('Seed complete.');
        console.log('Default password for all seeded users:', DEFAULT_PASS);
        console.log('Accounts: student@example.com, spoc@example.com, coord@example.com, ui_student@example.com, ui_spoc@example.com, ui_coord@example.com');
        console.log('SPOC-seeded jobs are PUBLISHED with deadlines ~6 months ahead (visible on Job Board).');
    });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
