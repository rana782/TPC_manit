/**
 * Permanent demo: 50 active students, 20 jobs (CompanyProfile), 100 alumni.
 * Idempotent - never deletes rows; only creates missing records.
 */
import { PrismaClient } from '@prisma/client';
import { importCompanyProfilesFromJson } from '../src/services/companyJsonImport.service';

const PERM_JOB_TAG = '[permdemo]';

export const permDemoStudentEmail = (n: number) => `permdemo.student${String(n).padStart(2, '0')}@example.com`;
export const permDemoAlumniEmail = (n: number) => `permdemo.alumni${String(n).padStart(3, '0')}@example.com`;

const TARGET_STUDENTS = 50;
const TARGET_JOBS = 20;
const TARGET_ALUMNI = 100;

const FIRST_NAMES = [
    'Aarav', 'Vihaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Meera', 'Neha', 'Rohan',
    'Saanvi', 'Tanvi', 'Vedant', 'Yash', 'Zara', 'Arjun', 'Bhavya', 'Dhruv', 'Esha', 'Farhan',
    'Gauri', 'Harsh', 'Ira', 'Jai', 'Kiara', 'Laksh', 'Mira', 'Nikhil', 'Ojas', 'Pari',
    'Riya', 'Siddharth', 'Tara', 'Uday', 'Vanya', 'Aisha', 'Dev', 'Kiran', 'Leela', 'Manan',
    'Nisha', 'Om', 'Pranav', 'Rhea', 'Sia', 'Tejas', 'Urvi', 'Vikram', 'Wamiqa', 'Yukti',
];

const LAST_NAMES = [
    'Agarwal', 'Bansal', 'Chopra', 'Desai', 'Eapen', 'Fernandes', 'Ghosh', 'Hegde', 'Iyer', 'Joshi',
    'Kapoor', 'Lobo', 'Menon', 'Nambiar', 'Oberoi', 'Patel', 'Qureshi', 'Reddy', 'Shetty', 'Talwar',
];

const BRANCHES = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'CHEM', 'META'];
const COURSES = ['BTech', 'MTech', 'MCA', 'BSc'];
const ROLE_TEMPLATES = [
    'Software Engineer',
    'Data Engineer',
    'Product Analyst',
    'QA Automation',
    'DevOps Engineer',
    'ML Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Business Analyst',
    'Security Engineer',
];

const APP_STATUSES = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED'];

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

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)] as T;
}

type JobRow = { id: string; companyName: string; stageCount: number };

async function ensurePermJobs(prisma: PrismaClient, spocId: string): Promise<JobRow[]> {
    const existing = await prisma.job.findMany({
        where: { description: { contains: PERM_JOB_TAG } },
        select: { id: true, companyName: true, stages: { select: { id: true } } },
    });

    const existingRows: JobRow[] = existing.map((j) => ({
        id: j.id,
        companyName: j.companyName,
        stageCount: Math.max(1, j.stages.length),
    }));

    if (existingRows.length >= TARGET_JOBS) {
        return existingRows.slice(0, TARGET_JOBS);
    }

    const usedCompanies = new Set(existing.map((j) => j.companyName.trim().toLowerCase()));
    const needed = TARGET_JOBS - existing.length;

    const pool = await prisma.$queryRaw<Array<{ companyName: string }>>`
        SELECT "companyName" FROM "CompanyProfile"
        WHERE TRIM("companyName") <> ''
        ORDER BY random()
        LIMIT 80
    `;

    const companies: string[] = [];
    for (const row of pool) {
        const name = row.companyName.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (usedCompanies.has(key)) continue;
        usedCompanies.add(key);
        companies.push(name);
        if (companies.length >= needed) break;
    }

    const fallback = [
        'InnovateTech',
        'TechCorp Solutions',
        'DataMinds Inc.',
        'Round3 Systems',
        'CloudScale Labs',
        'FinEdge Analytics',
        'HealthTech Bio',
        'AutoDrive AI',
    ];
    for (const f of fallback) {
        if (companies.length >= needed) break;
        const key = f.toLowerCase();
        if (usedCompanies.has(key)) continue;
        usedCompanies.add(key);
        companies.push(f);
    }

    if (companies.length < needed) {
        console.warn(
            `[seed] permanent demo: only ${companies.length} new companies for jobs (need ${needed}). Add CompanyProfile rows or run import:companies.`,
        );
    }

    const deadline = futureDeadline();
    const created: JobRow[] = [...existingRows];

    for (let i = 0; i < companies.length && created.length < TARGET_JOBS; i++) {
        const companyName = companies[i]!;
        const role = `${ROLE_TEMPLATES[i % ROLE_TEMPLATES.length]} - ${companyName.slice(0, 28)}`;
        const idx = existing.length + i;

        const job = await prisma.job.create({
            data: {
                postedById: spocId,
                role,
                companyName,
                description: `${PERM_JOB_TAG} Demo hiring track for ${companyName}. Seeded once; safe to keep for feature testing.`,
                jobType: 'Full-Time',
                ctc: `${(8 + (idx % 14) * 0.5).toFixed(1)} LPA`,
                eligibleBranches: JSON.stringify(BRANCHES),
                cgpaMin: [0, 6, 6.5, 7][idx % 4]!,
                requiredProfileFields: JSON.stringify(['resume', 'cgpa']),
                customQuestions: '[]',
                blockPlaced: true,
                status: 'PUBLISHED',
                applicationDeadline: deadline,
                placementMode: 'ON_CAMPUS',
            },
        });

        const s1 = stageAfter(deadline, 8 + (idx % 5));
        const s2 = stageAfter(deadline, 18 + (idx % 7));
        const s3 = stageAfter(deadline, 28 + (idx % 9));
        const statuses = [
            ['PENDING', 'PENDING', 'PENDING'],
            ['COMPLETED', 'IN_PROGRESS', 'PENDING'],
            ['COMPLETED', 'COMPLETED', 'PENDING'],
        ][idx % 3]!;

        await prisma.jobStage.createMany({
            data: [
                { jobId: job.id, name: 'Resume / Shortlist', scheduledDate: s1, status: statuses[0]! },
                { jobId: job.id, name: 'Technical Interview', scheduledDate: s2, status: statuses[1]! },
                { jobId: job.id, name: 'HR / Final', scheduledDate: s3, status: statuses[2]! },
            ],
        });

        created.push({ id: job.id, companyName, stageCount: 3 });
    }

    return created.slice(0, TARGET_JOBS);
}

async function ensurePermStudents(prisma: PrismaClient, passwordHash: string, jobs: JobRow[]): Promise<void> {
    if (jobs.length === 0) {
        console.warn('[seed] permanent demo: no jobs - skip students');
        return;
    }

    for (let n = 1; n <= TARGET_STUDENTS; n++) {
        const idx = n - 1;
        const email = permDemoStudentEmail(n);

        const existing = await prisma.user.findUnique({
            where: { email },
            include: { student: { include: { applications: true, resumes: true } } },
        });

        if (existing?.student && existing.student.applications.length > 0) {
            continue;
        }

        const firstName = FIRST_NAMES[idx % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]!;
        const branch = BRANCHES[idx % BRANCHES.length]!;
        const course = pick(COURSES);
        const scholarNo = `PDM-S${String(n).padStart(2, '0')}`;
        const cgpa = Number((6.5 + (idx % 25) * 0.1 + (idx % 7) * 0.05).toFixed(2));

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
                    course,
                    scholarNo,
                    phone: `9${String(100000000 + (idx * 10007) % 900000000).padStart(9, '0')}`,
                    cgpa,
                    linkedin: idx % 3 === 0 ? `https://linkedin.com/in/${firstName.toLowerCase()}-pdms-${n}` : null,
                    city: 'Mumbai',
                    state: 'MH',
                },
            }));

        let resume = existing?.student?.resumes?.[0];
        if (!resume) {
            resume = await prisma.resume.create({
                data: {
                    studentId: student.id,
                    fileName: `${firstName}_${lastName}_pdms.pdf`,
                    fileUrl: `/uploads/permdemo/${scholarNo}.pdf`,
                    roleName: pick(ROLE_TEMPLATES),
                    isActive: true,
                },
            });
        }

        const primaryJob = jobs[idx % jobs.length]!;
        const maxStage = Math.max(0, primaryJob.stageCount - 1);
        const currentStageIndex = randInt(0, maxStage);
        const ats = 55 + (idx % 40);

        await prisma.jobApplication.create({
            data: {
                studentId: student.id,
                jobId: primaryJob.id,
                resumeId: resume.id,
                applicationData: JSON.stringify({ seed: 'permdemo', scholarNo, branch, cgpa }),
                extraAnswers: JSON.stringify({ motivation: `Interested in ${primaryJob.companyName}` }),
                status: pick(APP_STATUSES),
                currentStageIndex,
                atsScore: ats,
                atsExplanation: `Demo ATS summary for ${firstName}.`,
                atsMatchedKeywords: JSON.stringify(['java', 'sql', 'communication'].slice(0, 1 + (idx % 3))),
                semanticScore: 50 + (idx % 35),
                skillScore: 52 + (idx % 38),
                skillsMatched: JSON.stringify(['python', 'typescript']),
                skillsMissing: JSON.stringify([]),
                suggestions: JSON.stringify([]),
                appliedAt: new Date(Date.now() - randInt(1, 40) * 24 * 60 * 60 * 1000),
            },
        });

        if (idx % 3 === 0 && jobs.length > 1) {
            let second = jobs[randInt(0, jobs.length - 1)]!;
            let guard = 0;
            while (second.id === primaryJob.id && guard++ < 20) {
                second = jobs[randInt(0, jobs.length - 1)]!;
            }
            if (second.id !== primaryJob.id) {
                const maxS2 = Math.max(0, second.stageCount - 1);
                await prisma.jobApplication.create({
                    data: {
                        studentId: student.id,
                        jobId: second.id,
                        resumeId: resume.id,
                        applicationData: JSON.stringify({ seed: 'permdemo_second', scholarNo }),
                        extraAnswers: '{}',
                        status: 'APPLIED',
                        currentStageIndex: randInt(0, maxS2),
                        atsScore: Math.max(0, ats - 5),
                        atsExplanation: 'Second application (permanent demo)',
                        atsMatchedKeywords: '[]',
                        semanticScore: 60,
                        skillScore: 58,
                        skillsMatched: '[]',
                        skillsMissing: '[]',
                        suggestions: '[]',
                        appliedAt: new Date(),
                    },
                });
            }
        }
    }
}

async function ensurePermAlumni(prisma: PrismaClient, spocId: string, passwordHash: string, jobs: JobRow[]): Promise<void> {
    if (jobs.length === 0) {
        console.warn('[seed] permanent demo: no jobs - skip alumni');
        return;
    }

    const currentYear = new Date().getFullYear();

    for (let n = 1; n <= TARGET_ALUMNI; n++) {
        const idx = n - 1;
        const email = permDemoAlumniEmail(n);

        const existingUser = await prisma.user.findUnique({
            where: { email },
            include: { student: { include: { alumniRecords: true } } },
        });

        if (existingUser?.student?.alumniRecords && existingUser.student.alumniRecords.length > 0) {
            continue;
        }

        const firstName = FIRST_NAMES[(idx + 17) % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[(idx + 3) % LAST_NAMES.length]!;
        const branch = BRANCHES[idx % BRANCHES.length]!;
        const scholarNo = `PDM-A${String(n).padStart(3, '0')}`;
        const job = jobs[idx % jobs.length]!;
        const placementYear = currentYear - (idx % 8) - 1;
        const placedAt = new Date(placementYear, idx % 12, 10 + (idx % 18));
        const ctcValue = Number((6.5 + (idx % 12) * 0.6).toFixed(1));
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
                    cgpa: Number((7 + ((idx % 14) * 0.15)).toFixed(2)),
                    isLocked: true,
                    lockedReason: `Placed at ${job.companyName}`,
                    placementType: 'ON_CAMPUS',
                    linkedin: `https://linkedin.com/in/${firstName.toLowerCase()}-pdma-${String(n).padStart(3, '0')}`,
                },
            }));

        let resume = await prisma.resume.findFirst({ where: { studentId: student.id } });
        if (!resume) {
            resume = await prisma.resume.create({
                data: {
                    studentId: student.id,
                    fileName: `${firstName}_${lastName}_pdma.pdf`,
                    fileUrl: `/uploads/permdemo/alumni/${scholarNo}.pdf`,
                    roleName: job.companyName,
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
                    applicationData: JSON.stringify({ seed: 'permdemo_alumni', scholarNo }),
                    extraAnswers: '{}',
                    status: 'PLACED',
                    currentStageIndex: 2,
                    atsScore: 70 + (idx % 25),
                    atsExplanation: 'Permanent demo alumni placement.',
                    atsMatchedKeywords: '[]',
                    semanticScore: 72,
                    skillScore: 70,
                    skillsMatched: '[]',
                    skillsMissing: '[]',
                    suggestions: '[]',
                    appliedAt: new Date(placedAt.getTime() - 60 * 24 * 60 * 60 * 1000),
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
                    role: `Alumni role - ${job.companyName.slice(0, 20)}`,
                    ctc,
                    placementMode: 'ON_CAMPUS',
                    createdBySpocId: spocId,
                    placedAt,
                },
            });
        }

        const hasAlumni = await prisma.alumni.findFirst({ where: { studentId: student.id } });
        if (!hasAlumni) {
            await prisma.alumni.create({
                data: {
                    studentId: student.id,
                    userId: user.id,
                    name: `${firstName} ${lastName}`,
                    branch,
                    role: `Software Engineer - ${job.companyName.slice(0, 24)}`,
                    ctc,
                    placementYear,
                    linkedinUrl: student.linkedin,
                    companyName: job.companyName,
                },
            });
        }

        const hasLock = await prisma.profileLock.findFirst({
            where: { studentId: student.id, isActive: true },
        });
        if (!hasLock) {
            await prisma.profileLock.create({
                data: {
                    studentId: student.id,
                    profileLocked: true,
                    lockedById: spocId,
                    reason: `Placed at ${job.companyName} (${PERM_JOB_TAG})`,
                    isActive: true,
                    lockedAt: new Date(placedAt.getTime() + 24 * 60 * 60 * 1000),
                },
            });
        }
    }
}

export async function seedPermanentDemo(prisma: PrismaClient, passwordHash: string): Promise<void> {
    const spoc = await prisma.user.findUnique({ where: { email: 'spoc@example.com' } });
    if (!spoc) {
        console.log('[seed] permanent demo skipped (no spoc@example.com)');
        return;
    }

    await importCompanyProfilesFromJson(prisma, () => {});

    const jobs = await ensurePermJobs(prisma, spoc.id);
    console.log(`[seed] permanent demo: ${jobs.length} jobs tagged ${PERM_JOB_TAG}`);

    await ensurePermStudents(prisma, passwordHash, jobs);
    console.log(`[seed] permanent demo: up to ${TARGET_STUDENTS} active students (${permDemoStudentEmail(1)} ...)`);

    await ensurePermAlumni(prisma, spoc.id, passwordHash, jobs);
    console.log(`[seed] permanent demo: up to ${TARGET_ALUMNI} alumni (${permDemoAlumniEmail(1)} ...)`);
}
