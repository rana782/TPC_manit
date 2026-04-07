import '../src/loadEnv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { upsertDemoCompanyProfiles } from '../src/utils/demoCompanyProfiles';
import { importCompanyProfilesFromJson } from '../src/services/companyJsonImport.service';

const prisma = new PrismaClient();

/** Future deadline so student listJobs (deadline >= today) always includes seeded jobs. */
function defaultApplicationDeadline(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d;
}

/** Idempotent: same poster + role + company = one row; safe to run daily/CI. */
async function upsertSeedJob(
    postedById: string,
    job: {
        role: string;
        companyName: string;
        description: string;
        requiredProfileFields: string;
        eligibleBranches?: string;
        ctc?: string;
    }
) {
    const applicationDeadline = defaultApplicationDeadline();
    const existing = await prisma.job.findFirst({
        where: { postedById, role: job.role, companyName: job.companyName },
    });

    const data = {
        description: job.description,
        requiredProfileFields: job.requiredProfileFields,
        eligibleBranches: job.eligibleBranches ?? '[]',
        status: 'PUBLISHED',
        applicationDeadline,
        jobType: 'Full-Time',
        ctc: job.ctc ?? '12 LPA',
        cgpaMin: 0,
        customQuestions: '[]',
        blockPlaced: true,
    };

    if (existing) {
        await prisma.job.update({
            where: { id: existing.id },
            data,
        });
        return;
    }

    await prisma.job.create({
        data: {
            postedById,
            role: job.role,
            companyName: job.companyName,
            ...data,
        },
    });
}

/** Demo jobs with custom timelines + applicants at different stage indices (idempotent). */
async function seedTimelineDemos(passwordHash: string) {
    const spoc = await prisma.user.findUnique({ where: { email: 'spoc@example.com' } });
    if (!spoc) return;

    const demoStudents = [
        { email: 'tl_stage1@example.com', firstName: 'Alice', lastName: 'Alpha' },
        { email: 'tl_stage2@example.com', firstName: 'Bob', lastName: 'Beta' },
        { email: 'tl_stage3@example.com', firstName: 'Carol', lastName: 'Gamma' },
    ];

    const studentRecords: { id: string; resumeId: string }[] = [];

    for (const ds of demoStudents) {
        const u = await prisma.user.upsert({
            where: { email: ds.email },
            update: { password: passwordHash, role: 'STUDENT', isVerified: true },
            create: {
                email: ds.email,
                password: passwordHash,
                role: 'STUDENT',
                isVerified: true,
            },
        });
        const scholarNo = `SCH-${ds.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12)}`;
        const st = await prisma.student.upsert({
            where: { userId: u.id },
            update: {
                firstName: ds.firstName,
                lastName: ds.lastName,
                branch: 'CSE',
                course: 'BTech',
                scholarNo,
                phone: '9876500001',
                cgpa: 8.2,
            },
            create: {
                userId: u.id,
                firstName: ds.firstName,
                lastName: ds.lastName,
                branch: 'CSE',
                course: 'BTech',
                scholarNo,
                phone: '9876500001',
                cgpa: 8.2,
            },
        });
        let resume = await prisma.resume.findFirst({ where: { studentId: st.id } });
        if (!resume) {
            resume = await prisma.resume.create({
                data: {
                    studentId: st.id,
                    fileName: 'demo.pdf',
                    fileUrl: '/uploads/demo-timeline.pdf',
                },
            });
        }
        studentRecords.push({ id: st.id, resumeId: resume.id });
    }

    const deadline = defaultApplicationDeadline();
    const mkStageDate = (daysAfterDeadline: number) => {
        const d = new Date(deadline);
        d.setDate(d.getDate() + daysAfterDeadline);
        return d;
    };

    const jobA = await prisma.job.upsert({
        where: { id: '00000000-0000-4000-8000-00000000a001' },
        update: {
            description: 'Seeded job A — dynamic timeline (Aptitude → Tech → HR).',
            status: 'PUBLISHED',
            applicationDeadline: deadline,
            requiredProfileFields: JSON.stringify(['resume']),
            postedById: spoc.id,
        },
        create: {
            id: '00000000-0000-4000-8000-00000000a001',
            role: 'Engineering Campus Hire',
            companyName: 'Seed Timeline Alpha',
            description: 'Seeded job A — dynamic timeline (Aptitude → Tech → HR).',
            postedById: spoc.id,
            applicationDeadline: deadline,
            status: 'PUBLISHED',
            requiredProfileFields: JSON.stringify(['resume']),
            eligibleBranches: '[]',
            customQuestions: '[]',
            blockPlaced: true,
            jobType: 'Full-Time',
            ctc: '18 LPA',
            cgpaMin: 0,
        },
    });

    await prisma.jobStage.deleteMany({ where: { jobId: jobA.id } });
    await prisma.$transaction([
        prisma.jobStage.create({
            data: {
                jobId: jobA.id,
                name: 'Aptitude Test',
                scheduledDate: mkStageDate(10),
                status: 'PENDING',
            },
        }),
        prisma.jobStage.create({
            data: {
                jobId: jobA.id,
                name: 'Technical Interview',
                scheduledDate: mkStageDate(20),
                status: 'PENDING',
            },
        }),
        prisma.jobStage.create({
            data: {
                jobId: jobA.id,
                name: 'HR Interview',
                scheduledDate: mkStageDate(30),
                status: 'PENDING',
            },
        }),
    ]);

    await prisma.jobApplication.deleteMany({ where: { jobId: jobA.id } });
    const appsA = [
        { studentIdx: 0, stageIdx: 0 },
        { studentIdx: 1, stageIdx: 1 },
        { studentIdx: 2, stageIdx: 2 },
    ];
    for (const a of appsA) {
        const sr = studentRecords[a.studentIdx];
        await prisma.jobApplication.create({
            data: {
                studentId: sr.id,
                jobId: jobA.id,
                resumeId: sr.resumeId,
                applicationData: '{}',
                extraAnswers: '{}',
                status: 'APPLIED',
                currentStageIndex: a.stageIdx,
                atsScore: 70 + a.stageIdx,
                atsExplanation: 'Seeded',
                atsMatchedKeywords: '[]',
                semanticScore: 70,
                skillScore: 70,
                skillsMatched: '[]',
                skillsMissing: '[]',
                suggestions: '[]',
            },
        });
    }

    const jobB = await prisma.job.upsert({
        where: { id: '00000000-0000-4000-8000-00000000b002' },
        update: {
            description: 'Seeded job B — different custom timeline.',
            status: 'PUBLISHED',
            applicationDeadline: deadline,
            requiredProfileFields: JSON.stringify(['resume']),
            postedById: spoc.id,
        },
        create: {
            id: '00000000-0000-4000-8000-00000000b002',
            role: 'Product Analyst',
            companyName: 'Seed Timeline Beta',
            description: 'Seeded job B — different custom timeline.',
            postedById: spoc.id,
            applicationDeadline: deadline,
            status: 'PUBLISHED',
            requiredProfileFields: JSON.stringify(['resume']),
            eligibleBranches: '[]',
            customQuestions: '[]',
            blockPlaced: true,
            jobType: 'Full-Time',
            ctc: '14 LPA',
            cgpaMin: 0,
        },
    });

    await prisma.jobStage.deleteMany({ where: { jobId: jobB.id } });
    await prisma.$transaction([
        prisma.jobStage.create({
            data: {
                jobId: jobB.id,
                name: 'Resume Shortlist',
                scheduledDate: mkStageDate(12),
                status: 'PENDING',
            },
        }),
        prisma.jobStage.create({
            data: {
                jobId: jobB.id,
                name: 'OA',
                scheduledDate: mkStageDate(22),
                status: 'PENDING',
            },
        }),
        prisma.jobStage.create({
            data: {
                jobId: jobB.id,
                name: 'Manager Round',
                scheduledDate: mkStageDate(32),
                status: 'PENDING',
            },
        }),
    ]);

    await prisma.jobApplication.deleteMany({ where: { jobId: jobB.id } });
    await prisma.jobApplication.create({
        data: {
            studentId: studentRecords[0].id,
            jobId: jobB.id,
            resumeId: studentRecords[0].resumeId,
            applicationData: '{}',
            extraAnswers: '{}',
            status: 'APPLIED',
            currentStageIndex: 0,
            atsScore: 75,
            atsExplanation: 'Seeded',
            atsMatchedKeywords: '[]',
            semanticScore: 72,
            skillScore: 74,
            skillsMatched: '[]',
            skillsMissing: '[]',
            suggestions: '[]',
        },
    });
    await prisma.jobApplication.create({
        data: {
            studentId: studentRecords[1].id,
            jobId: jobB.id,
            resumeId: studentRecords[1].resumeId,
            applicationData: '{}',
            extraAnswers: '{}',
            status: 'APPLIED',
            currentStageIndex: 1,
            atsScore: 68,
            atsExplanation: 'Seeded',
            atsMatchedKeywords: '[]',
            semanticScore: 65,
            skillScore: 70,
            skillsMatched: '[]',
            skillsMissing: '[]',
            suggestions: '[]',
        },
    });

    console.log(
        '[seed] Timeline demos: Seed Timeline Alpha / Seed Timeline Beta | demo students:',
        demoStudents.map((d) => d.email).join(', '),
    );
}

async function seedFiftyStudentLifecycle(passwordHash: string) {
    const spoc = await prisma.user.findUnique({ where: { email: 'spoc@example.com' } });
    if (!spoc) return;

    // Ensure the rating-integrated company dataset is present before assigning companies.
    await importCompanyProfilesFromJson(prisma, (msg) => console.log(msg));

    const profileCompanies = await prisma.companyProfile.findMany({
        where: { companyName: { not: '' } },
        orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
        select: { companyName: true },
        take: 24,
    });
    const fallbackCompanies = ['InnovateTech', 'TechCorp Solutions', 'DataMinds Inc.', 'Round3 Systems'];
    const companies = Array.from(new Set([...profileCompanies.map((c) => c.companyName.trim()), ...fallbackCompanies])).filter(Boolean);
    if (!companies.length) return;

    const branches = ['CSE', 'ECE', 'MECH', 'CIVIL', 'EEE', 'IT'];
    const rolePool = ['Software Engineer', 'Data Analyst', 'Business Analyst', 'QA Engineer', 'DevOps Engineer', 'Product Analyst'];

    const cohortPrefix = 'alumni.seed';
    const existingUsers = await prisma.user.findMany({
        where: { email: { startsWith: cohortPrefix } },
        select: { id: true, email: true, student: { select: { id: true } } },
    });
    const existingStudentIds = existingUsers.map((u) => u.student?.id).filter((id): id is string => Boolean(id));
    if (existingStudentIds.length) {
        await prisma.alumni.deleteMany({ where: { studentId: { in: existingStudentIds } } });
        await prisma.profileLock.deleteMany({ where: { studentId: { in: existingStudentIds } } });
        await prisma.placementRecord.deleteMany({ where: { studentId: { in: existingStudentIds } } });
        await prisma.jobApplication.deleteMany({ where: { studentId: { in: existingStudentIds } } });
        await prisma.resume.deleteMany({ where: { studentId: { in: existingStudentIds } } });
        await prisma.student.deleteMany({ where: { id: { in: existingStudentIds } } });
    }
    if (existingUsers.length) {
        await prisma.user.deleteMany({ where: { id: { in: existingUsers.map((u) => u.id) } } });
    }

    const applicationDeadline = defaultApplicationDeadline();
    const lifecycleJobs: Array<{ id: string; companyName: string; role: string }> = [];
    const companySlice = companies.slice(0, 12);
    for (let i = 0; i < companySlice.length; i += 1) {
        const companyName = companySlice[i];
        const role = `Lifecycle ${rolePool[i % rolePool.length]}`;
        await upsertSeedJob(spoc.id, {
            role,
            companyName,
            description: `Lifecycle-seeded hiring track for ${companyName}.`,
            requiredProfileFields: JSON.stringify(['resume', 'cgpa', 'linkedin']),
            eligibleBranches: JSON.stringify(branches),
            ctc: `${(8.5 + (i % 7)).toFixed(1)} LPA`,
        });

        const job = await prisma.job.findFirst({
            where: { postedById: spoc.id, role, companyName },
            select: { id: true, companyName: true, role: true },
        });
        if (!job) continue;

        lifecycleJobs.push(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: 'PUBLISHED', placementMode: 'ON_CAMPUS', applicationDeadline },
        });
        await prisma.jobStage.deleteMany({ where: { jobId: job.id } });
        await prisma.jobStage.createMany({
            data: [
                {
                    jobId: job.id,
                    name: 'Resume Shortlist',
                    scheduledDate: new Date(applicationDeadline.getTime() + 7 * 24 * 60 * 60 * 1000),
                    status: 'COMPLETED',
                },
                {
                    jobId: job.id,
                    name: 'Technical Interview',
                    scheduledDate: new Date(applicationDeadline.getTime() + 14 * 24 * 60 * 60 * 1000),
                    status: 'COMPLETED',
                },
                {
                    jobId: job.id,
                    name: 'HR Round',
                    scheduledDate: new Date(applicationDeadline.getTime() + 21 * 24 * 60 * 60 * 1000),
                    status: 'PENDING',
                },
            ],
        });
    }
    if (!lifecycleJobs.length) return;

    const firstNames = [
        'Aarav', 'Aditi', 'Rohan', 'Sneha', 'Kunal', 'Isha', 'Nikhil', 'Meera', 'Arjun', 'Pooja',
        'Vikas', 'Naina', 'Sahil', 'Priya', 'Manav', 'Ritika', 'Harsh', 'Diya', 'Krish', 'Ananya',
    ];
    const lastNames = ['Sharma', 'Verma', 'Singh', 'Patel', 'Rao', 'Gupta', 'Mehta', 'Nair', 'Iyer', 'Joshi'];
    const currentYear = new Date().getFullYear();

    for (let i = 1; i <= 50; i += 1) {
        const idx = i - 1;
        const email = `${cohortPrefix}${String(i).padStart(2, '0')}@example.com`;
        const firstName = firstNames[idx % firstNames.length];
        const lastName = lastNames[idx % lastNames.length];
        const branch = branches[idx % branches.length];
        const job = lifecycleJobs[idx % lifecycleJobs.length];
        const scholarNo = `SEED${String(i).padStart(4, '0')}`;
        const placementYear = currentYear - (idx % 5);
        const placedAt = new Date(placementYear, idx % 12, 10 + (idx % 18));
        const ctcValue = Number((6.5 + (idx % 10) * 0.7 + (idx % 3) * 0.2).toFixed(1));
        const ctc = `${ctcValue} LPA`;

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
                course: 'BTech',
                scholarNo,
                phone: `90000${String(10000 + i).slice(-5)}`,
                cgpa: Number((7 + ((idx % 14) * 0.15)).toFixed(2)),
                isLocked: true,
                lockedReason: `Placed at ${job.companyName}`,
                placementType: 'ON_CAMPUS',
                linkedin: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${String(i).padStart(2, '0')}`,
            },
        });
        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                fileName: `${firstName}_${lastName}_resume.pdf`,
                fileUrl: `/uploads/lifecycle/${scholarNo}.pdf`,
                roleName: job.role,
                isActive: true,
            },
        });

        await prisma.jobApplication.create({
            data: {
                studentId: student.id,
                jobId: job.id,
                resumeId: resume.id,
                applicationData: JSON.stringify({ source: 'seed_lifecycle', scholarNo }),
                extraAnswers: JSON.stringify({ motivation: 'Campus placement lifecycle seed data' }),
                status: 'PLACED',
                currentStageIndex: 2,
                atsScore: 72 + (idx % 21),
                atsExplanation: 'Lifecycle seed candidate with complete placement journey.',
                atsMatchedKeywords: JSON.stringify(['communication', 'problem-solving', 'teamwork']),
                semanticScore: 70 + (idx % 20),
                skillScore: 68 + (idx % 22),
                skillsMatched: JSON.stringify(['typescript', 'sql']),
                skillsMissing: JSON.stringify([]),
                suggestions: JSON.stringify([]),
                appliedAt: new Date(placedAt.getTime() - 45 * 24 * 60 * 60 * 1000),
            },
        });

        await prisma.placementRecord.create({
            data: {
                studentId: student.id,
                jobId: job.id,
                companyName: job.companyName,
                role: job.role,
                ctc,
                placementMode: 'ON_CAMPUS',
                createdBySpocId: spoc.id,
                placedAt,
            },
        });

        await prisma.alumni.create({
            data: {
                studentId: student.id,
                userId: user.id,
                name: `${firstName} ${lastName}`,
                branch,
                role: job.role,
                ctc,
                placementYear,
                linkedinUrl: student.linkedin,
                companyName: job.companyName,
            },
        });

        await prisma.profileLock.create({
            data: {
                studentId: student.id,
                profileLocked: true,
                lockedById: spoc.id,
                reason: `Placed at ${job.companyName}`,
                isActive: true,
                lockedAt: new Date(placedAt.getTime() + 24 * 60 * 60 * 1000),
            },
        });
    }

    console.log(`[seed] Lifecycle cohort created: 50 students placed across ${companySlice.length} rating companies.`);
}

async function main() {
    console.log('Seeding database (idempotent)...');

    const DEFAULT_PASS = 'Pass@123';
    const passwordHash = await bcrypt.hash(DEFAULT_PASS, 10);

    const users = [
        { email: 'student@example.com', role: 'STUDENT' as const },
        { email: 'spoc@example.com', role: 'SPOC' as const },
        { email: 'coord@example.com', role: 'COORDINATOR' as const },
        { email: 'ui_student@example.com', role: 'STUDENT' as const },
        { email: 'ui_spoc@example.com', role: 'SPOC' as const },
        { email: 'ui_coord@example.com', role: 'COORDINATOR' as const },
    ];

    for (const u of users) {
        const spocPerms =
            u.role === 'SPOC'
                ? { permJobCreate: true, permExportCsv: true, permLockProfile: true }
                : {};
        const scholarNo = `SCH-${u.email
            .split('@')[0]
            .replace(/[^a-zA-Z0-9]/g, '')
            .toUpperCase()
            .slice(0, 12)}`;

        const createdUser = await prisma.user.upsert({
            where: { email: u.email },
            update: {
                password: passwordHash,
                role: u.role,
                isVerified: true,
                ...spocPerms,
            },
            create: {
                email: u.email,
                password: passwordHash,
                role: u.role,
                isVerified: true,
                ...spocPerms,
            },
        });

        if (u.role === 'STUDENT') {
            await prisma.student.upsert({
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
            await upsertSeedJob(createdUser.id, {
                role: 'Software Engineer',
                companyName: 'TechCorp Solutions',
                description:
                    'Join our backend team building high-performance microservices. Looking for solid DSA and TypeScript skills.',
                requiredProfileFields: JSON.stringify(['cgpa', 'department', 'resume']),
            });
            await upsertSeedJob(createdUser.id, {
                role: 'Data Analyst',
                companyName: 'DataMinds Inc.',
                description: 'Help us drive business intelligence. Strong SQL and Python required.',
                requiredProfileFields: JSON.stringify(['cgpa', 'resume']),
            });
        }
    }

    await seedTimelineDemos(passwordHash);

    await upsertDemoCompanyProfiles(prisma);
    await seedFiftyStudentLifecycle(passwordHash);

    console.log('Seed complete.');
    console.log('Default password for all seeded users:', DEFAULT_PASS);
    console.log(
        'Accounts: student@example.com, spoc@example.com, coord@example.com, ui_student@example.com, ui_spoc@example.com, ui_coord@example.com'
    );
    console.log('SPOC-seeded jobs are PUBLISHED with deadlines ~6 months ahead (visible on Job Board).');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
