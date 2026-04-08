import '../src/loadEnv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { upsertDemoCompanyProfiles } from '../src/utils/demoCompanyProfiles';
import { seedPermanentDemo } from './seedPermanentDemo';

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
    await seedPermanentDemo(prisma, passwordHash);

    console.log('Seed complete.');
    console.log('Default password for all seeded users:', DEFAULT_PASS);
    console.log(
        'Accounts: student@example.com, spoc@example.com, coord@example.com, ui_student@example.com, ui_spoc@example.com, ui_coord@example.com'
    );
    console.log(
        'Permanent demo (additive, not removed on re-seed): permdemo.student01..50@example.com, permdemo.alumni001..100@example.com, jobs with [permdemo] in description.'
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
