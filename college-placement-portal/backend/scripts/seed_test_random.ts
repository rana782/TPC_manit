// Test seed: 50 students, 10 jobs from random CompanyProfile rows, random applications.
// Idempotent: removes prior seedrand*@example.com users then recreates.
// Needs: spoc@example.com + CompanyProfile rows. Run: npm run seed:test-random
import '../src/loadEnv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { importCompanyProfilesFromJson } from '../src/services/companyJsonImport.service';

const prisma = new PrismaClient();

const DEFAULT_PASS = 'Pass@123';
const COHORT_EMAIL = (n: number) => `seedrand${String(n).padStart(2, '0')}@example.com`;

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

const FIRST_NAMES = [
    'Aarav', 'Vihaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Meera', 'Neha', 'Rohan',
    'Saanvi', 'Tanvi', 'Vedant', 'Yash', 'Zara', 'Arjun', 'Bhavya', 'Dhruv', 'Esha', 'Farhan',
    'Gauri', 'Harsh', 'Ira', 'Jai', 'Kiara', 'Laksh', 'Mira', 'Nikhil', 'Ojas', 'Pari',
    'Riya', 'Siddharth', 'Tara', 'Uday', 'Vanya', 'Wafa', 'Yami', 'Zayn', 'Aisha', 'Dev',
    'Kiran', 'Leela', 'Manan', 'Nisha', 'Om', 'Pranav', 'Rhea', 'Sia', 'Tejas', 'Urvi',
];

const LAST_NAMES = [
    'Agarwal', 'Bansal', 'Chopra', 'Desai', 'Eapen', 'Fernandes', 'Ghosh', 'Hegde', 'Iyer', 'Joshi',
    'Kapoor', 'Lobo', 'Menon', 'Nambiar', 'Oberoi', 'Patel', 'Qureshi', 'Reddy', 'Shetty', 'Talwar',
];

const BRANCHES = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'CHEM', 'META'];
const COURSES = ['BTech', 'MTech', 'MCA', 'BSc'];
const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad'];
const STATES = ['MH', 'KA', 'TN', 'TS', 'WB', 'GJ', 'DL', 'RJ'];

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

const JOB_TYPES = ['Full-Time', 'Full-Time', 'Internship'];
const PLACEMENT_MODES = ['ON_CAMPUS', 'OFF_CAMPUS', 'ON_CAMPUS'];
const APP_STATUSES = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED'];

function randInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)] as T;
}

async function cleanupCohort(): Promise<void> {
    const users = await prisma.user.findMany({
        where: { email: { startsWith: 'seedrand' } },
        select: { id: true, student: { select: { id: true } } },
    });
    const studentIds = users.map((u) => u.student?.id).filter((id): id is string => Boolean(id));
    if (!studentIds.length) {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'seedrand' } } });
        return;
    }
    await prisma.jobApplication.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.resume.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

async function main(): Promise<void> {
    console.log('[seed:test-random] Starting...');

    await importCompanyProfilesFromJson(prisma, () => {});

    const spoc = await prisma.user.findUnique({ where: { email: 'spoc@example.com' } });
    if (!spoc) {
        console.error('[seed:test-random] Missing spoc@example.com. Run: npx prisma db seed');
        process.exit(1);
    }

    const prevRandJobs = await prisma.job.findMany({
        where: { postedById: spoc.id, description: { contains: '[seedrand]' } },
        select: { id: true },
    });
    const prevIds = prevRandJobs.map((j) => j.id);
    if (prevIds.length) {
        await prisma.jobApplication.deleteMany({ where: { jobId: { in: prevIds } } });
        await prisma.jobStage.deleteMany({ where: { jobId: { in: prevIds } } });
        await prisma.job.deleteMany({ where: { id: { in: prevIds } } });
        console.log(`[seed:test-random] Removed ${prevIds.length} previous seedrand jobs.`);
    }

    const companies = await prisma.$queryRaw<Array<{ companyName: string }>>`
        SELECT "companyName" FROM "CompanyProfile"
        WHERE TRIM("companyName") <> ''
        ORDER BY random()
        LIMIT 10
    `;

    if (companies.length < 10) {
        console.warn(
            `[seed:test-random] Only ${companies.length} companies in CompanyProfile; using available rows.`,
        );
    }
    if (companies.length === 0) {
        console.error('[seed:test-random] No CompanyProfile rows. Run full seed or: npm run import:companies');
        process.exit(1);
    }

    await cleanupCohort();

    const passwordHash = await bcrypt.hash(DEFAULT_PASS, 10);
    const deadline = futureDeadline();

    type JobRow = { id: string; companyName: string; stageCount: number };
    const createdJobs: JobRow[] = [];

    for (let i = 0; i < companies.length; i++) {
        const companyName = companies[i]!.companyName.trim();
        const role = `${ROLE_TEMPLATES[i % ROLE_TEMPLATES.length]} - ${companyName.slice(0, 24)}`;
        const cgpaMin = [0, 6, 6.5, 7, 7.5][i % 5]!;
        const eligibleBranches = JSON.stringify(BRANCHES.slice(0, randInt(4, BRANCHES.length)));
        const requiredFields = JSON.stringify(
            [['resume', 'cgpa'], ['resume'], ['resume', 'cgpa', 'linkedin'], ['cgpa']][i % 4],
        );

        const job = await prisma.job.create({
            data: {
                postedById: spoc.id,
                role,
                companyName,
                description: `[seedrand] Test hiring: ${role} at ${companyName}. Stack varies by team; campus drive ${new Date().getFullYear() + (i % 2)}. Seeded for QA.`,
                jobType: pick(JOB_TYPES),
                ctc: `${(8 + (i % 12) * 0.75 + (i % 3) * 0.2).toFixed(1)} LPA`,
                jdPath: i % 2 === 0 ? null : `/uploads/seed-jd-${i}.pdf`,
                jnfPath: i % 3 === 0 ? null : `/uploads/seed-jnf-${i}.pdf`,
                eligibleBranches,
                cgpaMin: Math.round(cgpaMin * 10) / 10,
                requiredProfileFields: requiredFields,
                customQuestions: JSON.stringify(
                    i % 2 === 0
                        ? []
                        : [{ label: 'Why this role?', type: 'text', required: false }],
                ),
                blockPlaced: i % 2 === 0,
                status: 'PUBLISHED',
                applicationDeadline: deadline,
                placementMode: pick(PLACEMENT_MODES),
            },
        });

        const s1 = stageAfter(deadline, 8 + (i % 5));
        const s2 = stageAfter(deadline, 18 + (i % 7));
        const s3 = stageAfter(deadline, 28 + (i % 9));
        const statuses = [
            ['PENDING', 'PENDING', 'PENDING'],
            ['COMPLETED', 'IN_PROGRESS', 'PENDING'],
            ['COMPLETED', 'COMPLETED', 'PENDING'],
        ][i % 3]!;

        await prisma.jobStage.createMany({
            data: [
                { jobId: job.id, name: 'Resume / Shortlist', scheduledDate: s1, status: statuses[0]! },
                { jobId: job.id, name: 'Technical Interview', scheduledDate: s2, status: statuses[1]! },
                { jobId: job.id, name: 'HR / Final', scheduledDate: s3, status: statuses[2]! },
            ],
        });

        createdJobs.push({ id: job.id, companyName, stageCount: 3 });
    }

    for (let n = 1; n <= 50; n++) {
        const idx = n - 1;
        const email = COHORT_EMAIL(n);
        const firstName = FIRST_NAMES[idx % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]!;
        const branch = BRANCHES[idx % BRANCHES.length]!;
        const course = pick(COURSES);
        const scholarNo = `SR${String(n).padStart(4, '0')}`;
        const cgpa = Number((6.5 + (idx % 25) * 0.1 + (idx % 7) * 0.05).toFixed(2));
        const backlogs = idx % 7 === 0 ? 1 : idx % 11 === 0 ? 2 : 0;
        const tenth = 65 + (idx % 30);
        const twelfth = 60 + (idx % 35);

        const user = await prisma.user.create({
            data: {
                email,
                password: passwordHash,
                role: 'STUDENT',
                isVerified: true,
            },
        });

        const student = await prisma.student.create({
            data: {
                userId: user.id,
                firstName,
                lastName,
                branch,
                course,
                scholarNo,
                phone: `9${String(100000000 + (idx * 10007) % 900000000).padStart(9, '0')}`,
                dob: new Date(2002 + (idx % 4), idx % 12, 10 + (idx % 18)),
                tenthPct: tenth,
                tenthYear: 2018 + (idx % 2),
                twelfthPct: twelfth,
                twelfthYear: 2020 + (idx % 2),
                semester: idx % 8,
                cgpa,
                sgpa: Number((cgpa - 0.1 + (idx % 3) * 0.05).toFixed(2)),
                backlogs,
                linkedin: idx % 3 === 0 ? `https://linkedin.com/in/${firstName.toLowerCase()}-${n}` : null,
                leetcode: idx % 4 === 0 ? `u${scholarNo}` : null,
                codechef: idx % 5 === 0 ? `${firstName}${n}` : null,
                city: pick(CITIES),
                state: pick(STATES),
                pincode: `${400000 + (idx % 900)}`,
                address: `${randInt(1, 999)} Test Street, Block ${idx % 10}`,
                placementType: idx % 6 === 0 ? 'OFF_CAMPUS' : null,
            },
        });

        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                fileName: `${firstName}_${lastName}_resume_${n}.pdf`,
                fileUrl: `/uploads/seedrand/${scholarNo}.pdf`,
                roleName: pick(ROLE_TEMPLATES),
                isActive: true,
            },
        });

        const primaryJob = createdJobs[randInt(0, createdJobs.length - 1)]!;

        const maxStage = Math.max(0, primaryJob.stageCount - 1);
        const currentStageIndex = randInt(0, maxStage);
        const ats = 55 + (idx % 40);
        const sem = 50 + (idx % 35);
        const skill = 52 + (idx % 38);

        await prisma.jobApplication.create({
            data: {
                studentId: student.id,
                jobId: primaryJob.id,
                resumeId: resume.id,
                applicationData: JSON.stringify({
                    seed: 'seedrand',
                    scholarNo,
                    branch,
                    cgpa,
                }),
                extraAnswers: JSON.stringify({
                    motivation: `Interested in ${primaryJob.companyName} - seeded ${n}`,
                }),
                status: pick(APP_STATUSES),
                currentStageIndex,
                atsScore: ats,
                atsExplanation: `Seeded ATS summary for ${firstName}; keyword match ${ats}%.`,
                atsMatchedKeywords: JSON.stringify(['java', 'sql', 'communication'].slice(0, 1 + (idx % 3))),
                semanticScore: sem,
                skillScore: skill,
                skillsMatched: JSON.stringify(['python', 'typescript', 'docker'].slice(0, 1 + (idx % 3))),
                skillsMissing: JSON.stringify(['kafka'].filter(() => idx % 2 === 0)),
                suggestions: JSON.stringify(['Add project links']),
                appliedAt: new Date(Date.now() - randInt(1, 40) * 24 * 60 * 60 * 1000),
            },
        });

        if (idx % 3 === 0 && createdJobs.length > 1) {
            let secondJob = createdJobs[randInt(0, createdJobs.length - 1)]!;
            let guard = 0;
            while (secondJob.id === primaryJob.id && guard++ < 15) {
                secondJob = createdJobs[randInt(0, createdJobs.length - 1)]!;
            }
            if (secondJob.id !== primaryJob.id) {
                const maxS2 = Math.max(0, secondJob.stageCount - 1);
                await prisma.jobApplication.create({
                    data: {
                        studentId: student.id,
                        jobId: secondJob.id,
                        resumeId: resume.id,
                        applicationData: JSON.stringify({ seed: 'seedrand_second', scholarNo }),
                        extraAnswers: '{}',
                        status: 'APPLIED',
                        currentStageIndex: randInt(0, maxS2),
                        atsScore: Math.max(0, ats - 5),
                        atsExplanation: 'Second application (subset of cohort)',
                        atsMatchedKeywords: '[]',
                        semanticScore: Math.max(0, sem - 3),
                        skillScore: Math.max(0, skill - 4),
                        skillsMatched: '[]',
                        skillsMissing: '[]',
                        suggestions: '[]',
                        appliedAt: new Date(),
                    },
                });
            }
        }
    }

    console.log('[seed:test-random] Done.');
    console.log(`  Students: 50 (${COHORT_EMAIL(1)} ... ${COHORT_EMAIL(50)})`);
    console.log(`  Password: ${DEFAULT_PASS}`);
    console.log(`  Jobs: ${createdJobs.length} (one per company)`);
    console.log('  Companies:', companies.map((c) => c.companyName.trim()).join(', '));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
