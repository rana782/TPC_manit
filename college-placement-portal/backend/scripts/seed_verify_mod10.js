const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
    const password = await bcrypt.hash('Password@123', 10);

    console.log('Cleaning up Module 10 data...');
    await prisma.notificationLog.deleteMany({});
    await prisma.jobApplication.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: '_10@example.com' } } });

    console.log('Seeding Users...');
    const spoc = await prisma.user.create({
        data: {
            email: 'spoc_10@example.com',
            password,
            role: 'SPOC',
            isVerified: true,
            permJobCreate: true
        }
    });

    const studentUser = await prisma.user.create({
        data: {
            email: 's1_10@example.com',
            password,
            role: 'STUDENT',
            isVerified: true
        }
    });

    const student = await prisma.student.create({
        data: {
            userId: studentUser.id,
            firstName: 'Notify',
            lastName: 'Student',
            branch: 'CSE',
            cgpa: 8.5,
            phone: '9123456789', // Target for WhatsApp
            isLocked: false
        }
    });

    const resume = await prisma.resume.create({
        data: {
            studentId: student.id,
            fileName: 'resume.pdf',
            fileUrl: '/uploads/res.pdf',
            isActive: true
        }
    });

    const job = await prisma.job.create({
        data: {
            role: 'Notification SDE',
            companyName: 'NotifyCorp',
            description: 'Testing Notifications',
            jobType: 'Full-Time',
            ctc: '15 LPA',
            cgpaMin: 0,
            eligibleBranches: '[]',
            requiredProfileFields: '[]',
            customQuestions: '[]',
            status: 'PUBLISHED',
            applicationDeadline: new Date('2026-12-31'),
            postedById: spoc.id
        }
    });

    console.log('Module 10 Seeded!');
    console.log('Student ID:', student.id);
    console.log('Job ID:', job.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
