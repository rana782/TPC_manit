const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
    const password = await bcrypt.hash('Password@123', 10);

    console.log('Cleaning up Module 08 data...');
    await prisma.profileLock.deleteMany({});
    await prisma.placementRecord.deleteMany({});
    await prisma.jobApplication.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: '_08@example.com' } } });

    console.log('Seeding Users...');
    const coordinator = await prisma.user.create({
        data: {
            email: 'coord_verify_08@example.com',
            password,
            role: 'COORDINATOR',
            isVerified: true
        }
    });

    const spoc = await prisma.user.create({
        data: {
            email: 'spoc_verify_08@example.com',
            password,
            role: 'SPOC',
            isVerified: true,
            permLockProfile: true // Vital for this module
        }
    });

    const studentUser = await prisma.user.create({
        data: {
            email: 's1_08@example.com',
            password,
            role: 'STUDENT',
            isVerified: true
        }
    });

    const student = await prisma.student.create({
        data: {
            userId: studentUser.id,
            firstName: 'LockTest',
            lastName: 'Student',
            branch: 'CSE',
            cgpa: 8.5,
            isLocked: false
        }
    });

    const resume = await prisma.resume.create({
        data: {
            studentId: student.id,
            fileName: 'test.pdf',
            fileUrl: '/uploads/test.pdf',
            isActive: true
        }
    });

    console.log('Seeding a Job for apply-block verification...');
    const job = await prisma.job.create({
        data: {
            role: 'Blocked SDE',
            companyName: 'LockCorp',
            description: 'Trial Job',
            jobType: 'Full-Time',
            ctc: '12 LPA',
            cgpaMin: 0,
            eligibleBranches: '[]',
            requiredProfileFields: '[]',
            customQuestions: '[]',
            status: 'PUBLISHED',
            applicationDeadline: new Date('2026-12-31'),
            postedById: spoc.id
        }
    });

    console.log('Module 08 Seeded successfully!');
    console.log('Student ID:', student.id);
    console.log('Job ID:', job.id);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
