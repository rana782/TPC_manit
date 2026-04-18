/**
 * Persistent baseline for Supabase: 50 companies, jobs, 100 active students,
 * 100 chart/placement students, 100 extra alumni (200 Alumni rows). Idempotent.
 */
import type { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { normalizeCompanyName } from '../utils/companyNormalizer';

const SETTING_KEY = 'TPC_BASELINE_SEED_VERSION';
const SETTING_VALUE = '2';
const JOB_TAG = '[TPC_BASELINE]';
const N_COMPANIES = 50;
const N_JOBS = 28;
const N_GENERAL_STUDENTS = 100;
const N_CHART_STUDENTS = 100;
const N_EXTRA_ALUMNI = 100;
const ADVISORY_LOCK_KEY = 9034091;

const BRANCHES = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'CHEM', 'META'];
const COURSES = ['BTech', 'MTech', 'MCA'];
const ROLE_TEMPLATES = [
    'Software Engineer',
    'Data Engineer',
    'Product Analyst',
    'DevOps Engineer',
    'ML Engineer',
    'Frontend Developer',
    'Backend Developer',
    'QA Engineer',
    'Security Engineer',
    'Business Analyst',
];

export type BaselineSeedLogger = {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
};

function defaultLogger(): BaselineSeedLogger {
    return {
        info: (m) => console.log(m),
        warn: (m) => console.warn(m),
        error: (m, e) => console.error(m, e),
    };
}

function futureDeadline(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d;
}

function stageAfter(deadline: Date, days: number): Date {
    const x = new Date(deadline);
    x.setDate(x.getDate() + days);
    return x;
}

function randInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)] as T;
}

const FIRST_NAMES = [
    'Aarav', 'Vihaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Meera', 'Neha', 'Rohan',
    'Saanvi', 'Tanvi', 'Vedant', 'Yash', 'Zara', 'Arjun', 'Bhavya', 'Dhruv', 'Esha', 'Farhan',
] as const;

const LAST_NAMES = [
    'Agarwal', 'Bansal', 'Chopra', 'Desai', 'Ghosh', 'Iyer', 'Joshi', 'Kapoor', 'Menon', 'Patel',
] as const;

async function acquireSeedLock(prisma: PrismaClient): Promise<boolean> {
    try {
        const rows = await prisma.$queryRaw<{ acquired: boolean }[]>`
            SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS acquired
        `;
        return Boolean(rows[0]?.acquired);
    } catch {
        return true;
    }
}

async function releaseSeedLock(prisma: PrismaClient): Promise<void> {
    try {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    } catch {
        /* ignore */
    }
}

async function readBaselineVersion(prisma: PrismaClient): Promise<string | null> {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    return row?.value ?? null;
}

async function writeBaselineVersion(prisma: PrismaClient): Promise<void> {
    await prisma.systemSetting.upsert({
        where: { key: SETTING_KEY },
        create: { key: SETTING_KEY, value: SETTING_VALUE },
        update: { value: SETTING_VALUE },
    });
}

async function clearBaselineVersion(prisma: PrismaClient): Promise<void> {
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEY } });
}

async function ensureSpoc(prisma: PrismaClient, passwordHash: string, log: BaselineSeedLogger): Promise<User | null> {
    try {
        const u = await prisma.user.upsert({
            where: { email: 'spoc@example.com' },
            update: {
                role: 'SPOC',
                isVerified: true,
                isDisabled: false,
                permJobCreate: true,
                permExportCsv: true,
                permLockProfile: true,
            },
            create: {
                email: 'spoc@example.com',
                password: passwordHash,
                role: 'SPOC',
                isVerified: true,
                permJobCreate: true,
                permExportCsv: true,
                permLockProfile: true,
            },
        });
        return u;
    } catch (e) {
        log.error('[baseline] failed to ensure spoc@example.com', e);
        return null;
    }
}

type JobRow = { id: string; companyName: string; stageCount: number };

async function ensureCompanies(prisma: PrismaClient, log: BaselineSeedLogger): Promise<string[]> {
    const names: string[] = [];
    for (let i = 1; i <= N_COMPANIES; i++) {
        const companyName = `TPC Baseline Corp ${String(i).padStart(3, '0')}`;
        const normalizedName = normalizeCompanyName(companyName);
        if (!normalizedName) continue;

        const rating = Number((3.2 + (i % 17) * 0.1).toFixed(1));
        const reviewCount = 50 + (i * 37) % 2000;

        await prisma.companyProfile.upsert({
            where: { normalizedName },
            update: {
                companyName,
                rating,
                reviewCount,
                highlyRatedFor: ['Learning culture', 'Compensation', 'Peers'].slice(0, 1 + (i % 3)),
                criticallyRatedFor: i % 4 === 0 ? ['Work pressure'] : [],
                source: 'baseline_seed',
                lastSyncedAt: new Date(),
            },
            create: {
                companyName,
                normalizedName,
                rating,
                reviewCount,
                highlyRatedFor: ['Learning culture', 'Compensation', 'Peers'].slice(0, 1 + (i % 3)),
                criticallyRatedFor: i % 4 === 0 ? ['Work pressure'] : [],
                source: 'baseline_seed',
                lastSyncedAt: new Date(),
            },
        });
        names.push(companyName);
    }
    log.info(`[baseline] ensured ${names.length} company profiles`);
    return names;
}

async function ensureJobs(prisma: PrismaClient, spocId: string, companies: string[], log: BaselineSeedLogger): Promise<JobRow[]> {
    const existing = await prisma.job.findMany({
        where: { description: { contains: JOB_TAG } },
        select: { id: true, companyName: true, stages: { select: { id: true } } },
    });
    const rows: JobRow[] = existing.map((j) => ({
        id: j.id,
        companyName: j.companyName,
        stageCount: Math.max(1, j.stages.length),
    }));
    if (rows.length >= N_JOBS) {
        log.info(`[baseline] reusing ${rows.length} baseline jobs`);
        return rows.slice(0, N_JOBS);
    }

    const deadline = futureDeadline();
    const used = new Set(existing.map((j) => j.companyName.trim().toLowerCase()));

    for (let i = 0; i < companies.length && rows.length < N_JOBS; i++) {
        const companyName = companies[i]!;
        const key = companyName.trim().toLowerCase();
        if (used.has(key)) continue;
        used.add(key);

        const role = `${ROLE_TEMPLATES[rows.length % ROLE_TEMPLATES.length]} — ${companyName.slice(0, 24)}`;
        const job = await prisma.job.create({
            data: {
                postedById: spocId,
                role,
                companyName,
                description: `${JOB_TAG} Synthetic hiring track for dashboards and SPOC UI (${companyName}).`,
                jobType: 'Full-Time',
                ctc: `${(7 + (rows.length % 20) * 0.5).toFixed(1)} LPA`,
                eligibleBranches: JSON.stringify(BRANCHES),
                cgpaMin: [0, 6, 6.5][rows.length % 3]!,
                requiredProfileFields: JSON.stringify(['resume', 'cgpa']),
                customQuestions: '[]',
                blockPlaced: true,
                status: 'PUBLISHED',
                applicationDeadline: deadline,
                placementMode: 'ON_CAMPUS',
            },
        });

        const s1 = stageAfter(deadline, 10 + (rows.length % 5));
        const s2 = stageAfter(deadline, 20 + (rows.length % 7));
        const s3 = stageAfter(deadline, 30 + (rows.length % 9));
        const stPack = [
            ['PENDING', 'PENDING', 'PENDING'],
            ['COMPLETED', 'IN_PROGRESS', 'PENDING'],
            ['COMPLETED', 'COMPLETED', 'PENDING'],
        ][rows.length % 3]!;

        await prisma.jobStage.createMany({
            data: [
                { jobId: job.id, name: 'Resume / Shortlist', scheduledDate: s1, status: stPack[0]! },
                { jobId: job.id, name: 'Technical Interview', scheduledDate: s2, status: stPack[1]! },
                { jobId: job.id, name: 'HR / Final', scheduledDate: s3, status: stPack[2]! },
            ],
        });

        rows.push({ id: job.id, companyName, stageCount: 3 });
    }

    log.info(`[baseline] ${rows.length} jobs available for applications`);
    return rows.slice(0, N_JOBS);
}

async function ensureGeneralStudents(
    prisma: PrismaClient,
    passwordHash: string,
    jobs: JobRow[],
    log: BaselineSeedLogger
): Promise<void> {
    if (jobs.length === 0) {
        log.warn('[baseline] skip general students — no jobs');
        return;
    }

    const statuses = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED'];

    for (let n = 1; n <= N_GENERAL_STUDENTS; n++) {
        const idx = n - 1;
        const email = `baseline.gen.${String(n).padStart(3, '0')}@seed.tpcportal.test`;
        const existing = await prisma.user.findUnique({
            where: { email },
            include: { student: { include: { resumes: true } } },
        });

        const hasBaselineApp =
            existing?.student &&
            (await prisma.jobApplication.findFirst({
                where: {
                    studentId: existing.student.id,
                    job: { description: { contains: JOB_TAG } },
                },
            }));

        if (hasBaselineApp) continue;

        const firstName = FIRST_NAMES[idx % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]!;
        const branch = BRANCHES[idx % BRANCHES.length]!;
        const scholarNo = `BLG${String(n).padStart(3, '0')}`;

        const user =
            existing ||
            (await prisma.user.create({
                data: {
                    email,
                    password: passwordHash,
                    role: 'STUDENT',
                    isVerified: true,
                },
            }));

        const student =
            existing?.student ||
            (await prisma.student.create({
                data: {
                    userId: user.id,
                    firstName,
                    lastName,
                    branch,
                    course: pick(COURSES),
                    scholarNo,
                    phone: `9${String(100000000 + (idx * 10007) % 900000000).padStart(9, '0')}`,
                    cgpa: Number((6.4 + (idx % 30) * 0.08).toFixed(2)),
                    city: 'Bengaluru',
                    state: 'KA',
                    linkedin: idx % 5 === 0 ? `https://linkedin.com/in/blg-${n}` : null,
                },
            }));

        let resume = existing?.student?.resumes?.[0];
        if (!resume) {
            resume = await prisma.resume.create({
                data: {
                    studentId: student.id,
                    fileName: `${firstName}_${scholarNo}.pdf`,
                    fileUrl: `/uploads/baseline/${scholarNo}.pdf`,
                    roleName: pick(ROLE_TEMPLATES),
                    isActive: true,
                },
            });
        }

        const job = jobs[idx % jobs.length]!;
        const maxStage = Math.max(0, job.stageCount - 1);
        await prisma.jobApplication.create({
            data: {
                studentId: student.id,
                jobId: job.id,
                resumeId: resume.id,
                applicationData: JSON.stringify({ seed: 'baseline_gen', scholarNo, branch }),
                extraAnswers: JSON.stringify({}),
                status: statuses[idx % statuses.length]!,
                currentStageIndex: randInt(0, maxStage),
                atsScore: 50 + (idx % 45),
                atsExplanation: 'Baseline seed ATS summary.',
                atsMatchedKeywords: JSON.stringify(['java', 'sql', 'communication'].slice(0, 1 + (idx % 3))),
                semanticScore: 48 + (idx % 40),
                skillScore: 50 + (idx % 42),
                skillsMatched: JSON.stringify(['python']),
                skillsMissing: JSON.stringify([]),
                suggestions: JSON.stringify([]),
                appliedAt: new Date(Date.now() - randInt(1, 120) * 24 * 60 * 60 * 1000),
            },
        });
    }
    log.info(`[baseline] general students up to ${N_GENERAL_STUDENTS}`);
}

async function seedPlacedCohort(
    prisma: PrismaClient,
    spocId: string,
    passwordHash: string,
    jobs: JobRow[],
    opts: { prefix: 'chart' | 'alum'; count: number; scholarPrefix: string; log: BaselineSeedLogger }
): Promise<void> {
    const { prefix, count, scholarPrefix, log } = opts;
    if (jobs.length === 0) {
        log.warn(`[baseline] skip ${prefix} cohort — no jobs`);
        return;
    }

    const currentYear = new Date().getFullYear();

    for (let n = 1; n <= count; n++) {
        const idx = n - 1;
        const email = `baseline.${prefix}.${String(n).padStart(3, '0')}@seed.tpcportal.test`;

        const existingUser = await prisma.user.findUnique({
            where: { email },
            include: { student: true },
        });

        const existingAlumni = existingUser?.student
            ? await prisma.alumni.findFirst({ where: { studentId: existingUser.student.id } })
            : null;
        if (existingAlumni) continue;

        const firstName = FIRST_NAMES[(idx + 5) % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[(idx + 2) % LAST_NAMES.length]!;
        const branch = BRANCHES[idx % BRANCHES.length]!;
        const scholarNo = `${scholarPrefix}${String(n).padStart(3, '0')}`;
        const job = jobs[idx % jobs.length]!;
        const placementYear = currentYear - (idx % 6) - 1;
        const placedAt = new Date(placementYear, idx % 12, 8 + (idx % 20));
        const ctcValue = Number((6 + (idx % 18) * 0.55).toFixed(1));
        const ctc = `${ctcValue} LPA`;

        const user =
            existingUser ||
            (await prisma.user.create({
                data: {
                    email,
                    password: passwordHash,
                    role: 'STUDENT',
                    isVerified: true,
                },
            }));

        const student =
            existingUser?.student ||
            (await prisma.student.create({
                data: {
                    userId: user.id,
                    firstName,
                    lastName,
                    branch,
                    course: 'BTech',
                    scholarNo,
                    phone: `8${String(800000000 + (idx * 13001) % 900000000).padStart(9, '0')}`,
                    cgpa: Number((7 + (idx % 12) * 0.12).toFixed(2)),
                    isLocked: true,
                    lockedReason: `Placed at ${job.companyName}`,
                    placementType: 'ON_CAMPUS',
                    linkedin: `https://linkedin.com/in/${prefix}-${scholarNo}`,
                },
            }));

        let resume = await prisma.resume.findFirst({ where: { studentId: student.id } });
        if (!resume) {
            resume = await prisma.resume.create({
                data: {
                    studentId: student.id,
                    fileName: `${firstName}_${scholarNo}.pdf`,
                    fileUrl: `/uploads/baseline/${prefix}/${scholarNo}.pdf`,
                    roleName: pick(ROLE_TEMPLATES),
                    isActive: true,
                },
            });
        }

        const existingApp = await prisma.jobApplication.findFirst({
            where: { studentId: student.id, jobId: job.id },
        });
        if (!existingApp) {
            await prisma.jobApplication.create({
                data: {
                    studentId: student.id,
                    jobId: job.id,
                    resumeId: resume.id,
                    applicationData: JSON.stringify({ seed: `baseline_${prefix}`, scholarNo }),
                    extraAnswers: '{}',
                    status: 'PLACED',
                    currentStageIndex: 2,
                    atsScore: 65 + (idx % 30),
                    atsExplanation: 'Baseline placement cohort.',
                    atsMatchedKeywords: '[]',
                    semanticScore: 70,
                    skillScore: 68,
                    skillsMatched: '[]',
                    skillsMissing: '[]',
                    suggestions: '[]',
                    appliedAt: new Date(placedAt.getTime() - 45 * 24 * 60 * 60 * 1000),
                },
            });
        }

        const hasPlacement = await prisma.placementRecord.findFirst({
            where: { studentId: student.id, jobId: job.id },
        });
        if (!hasPlacement) {
            await prisma.placementRecord.create({
                data: {
                    studentId: student.id,
                    jobId: job.id,
                    companyName: job.companyName,
                    role: `${pick(ROLE_TEMPLATES)} @ ${job.companyName.slice(0, 18)}`,
                    ctc,
                    placementMode: 'ON_CAMPUS',
                    createdBySpocId: spocId,
                    placedAt,
                },
            });
        }

        await prisma.alumni.create({
            data: {
                studentId: student.id,
                userId: user.id,
                name: `${firstName} ${lastName}`,
                branch,
                role: `Engineer — ${job.companyName.slice(0, 28)}`,
                ctc,
                placementYear,
                linkedinUrl: student.linkedin,
                companyName: job.companyName,
            },
        });

        const hasLock = await prisma.profileLock.findFirst({
            where: { studentId: student.id, isActive: true },
        });
        if (!hasLock) {
            await prisma.profileLock.create({
                data: {
                    studentId: student.id,
                    profileLocked: true,
                    lockedById: spocId,
                    reason: `Placed at ${job.companyName} (${JOB_TAG})`,
                    isActive: true,
                    lockedAt: new Date(placedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
                },
            });
        }
    }

    log.info(`[baseline] cohort "${prefix}" up to ${count} placed students + alumni`);
}

export type RunBaselineOptions = {
    force?: boolean;
    passwordPlain?: string;
    logger?: BaselineSeedLogger;
};

export async function ensureSupabaseBaselineSeed(prisma: PrismaClient, logger?: BaselineSeedLogger): Promise<void> {
    const log = logger ?? defaultLogger();
    const force = process.env.FORCE_BASELINE_SEED === 'true';
    const autoSeedFlag = String(process.env.AUTO_BASELINE_SEED || '').toLowerCase();
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const shouldAutoSeed =
        autoSeedFlag === 'true' || (!isProduction && autoSeedFlag !== 'false');
    const disabled = !shouldAutoSeed;

    if (disabled) {
        log.info('[baseline] AUTO_BASELINE_SEED=false — skipped');
        return;
    }

    if (!force) {
        const ver = await readBaselineVersion(prisma);
        if (ver === SETTING_VALUE) {
            log.info('[baseline] already applied — skipped (set FORCE_BASELINE_SEED=true to re-run)');
            return;
        }
    } else {
        await clearBaselineVersion(prisma);
    }

    const gotLock = await acquireSeedLock(prisma);
    if (!gotLock) {
        log.warn('[baseline] another instance is seeding — skipped');
        return;
    }

    try {
        await runSupabaseBaselineSeed(prisma, {
            force,
            passwordPlain: process.env.BASELINE_SEED_PASSWORD || 'Pass@123',
            logger: log,
        });
    } finally {
        await releaseSeedLock(prisma);
    }
}

export async function runSupabaseBaselineSeed(prisma: PrismaClient, options: RunBaselineOptions = {}): Promise<void> {
    const log = options.logger ?? defaultLogger();
    if (options.force) {
        await clearBaselineVersion(prisma);
    }
    const plain = options.passwordPlain ?? (process.env.BASELINE_SEED_PASSWORD || 'Pass@123');
    const passwordHash = await bcrypt.hash(plain, 10);

    const companies = await ensureCompanies(prisma, log);
    const spoc = await ensureSpoc(prisma, passwordHash, log);
    if (!spoc) {
        log.warn('[baseline] aborted — no SPOC user');
        return;
    }

    const jobs = await ensureJobs(prisma, spoc.id, companies, log);
    if (jobs.length === 0) {
        log.warn('[baseline] aborted — no jobs');
        return;
    }

    await ensureGeneralStudents(prisma, passwordHash, jobs, log);
    await seedPlacedCohort(prisma, spoc.id, passwordHash, jobs, {
        prefix: 'chart',
        count: N_CHART_STUDENTS,
        scholarPrefix: 'BLC',
        log,
    });
    await seedPlacedCohort(prisma, spoc.id, passwordHash, jobs, {
        prefix: 'alum',
        count: N_EXTRA_ALUMNI,
        scholarPrefix: 'BLA',
        log,
    });

    await writeBaselineVersion(prisma);
    log.info(`[baseline] complete — ${SETTING_KEY}=${SETTING_VALUE}. New account password: ${plain}`);
}
