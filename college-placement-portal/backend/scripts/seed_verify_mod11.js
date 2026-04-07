const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
    const password = await bcrypt.hash('Password@123', 10);

    console.log('Cleaning up Module 11 data...');
    await prisma.placementAnnouncementLog.deleteMany({});
    await prisma.placementRecord.deleteMany({});
    await prisma.jobApplication.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: '_11@example.com' } } });

    console.log('Seeding Users...');
    const coord = await prisma.user.create({
        data: {
            email: 'coord_11@example.com',
            password,
            role: 'COORDINATOR',
            isVerified: true
        }
    });

    const studentUser = await prisma.user.create({
        data: {
            email: 's1_11@example.com',
            password,
            role: 'STUDENT',
            isVerified: true
        }
    });

    const student = await prisma.student.create({
        data: {
            userId: studentUser.id,
            firstName: 'LinkedIn',
            lastName: 'Star',
            branch: 'Information Technology',
            cgpa: 9.2,
            phone: '9876543210',
            linkedin: 'https://linkedin.com/in/linkedinstar',
            isLocked: true
        }
    });

    const job = await prisma.job.create({
        data: {
            role: 'Principal Engineer',
            companyName: 'SocialMediaCo',
            description: 'Lead the next generation of social networking.',
            jobType: 'Full-Time',
            ctc: '50 LPA',
            cgpaMin: 0,
            eligibleBranches: '[]',
            requiredProfileFields: '[]',
            customQuestions: '[]',
            status: 'PUBLISHED',
            applicationDeadline: new Date('2026-12-31'),
            postedById: coord.id
        }
    });

    console.log('Creating Placement Record...');
    const placement = await prisma.placementRecord.create({
        data: {
            studentId: student.id,
            jobId: job.id,
            companyName: job.companyName,
            role: job.role,
            ctc: job.ctc,
            placementMode: 'ON_CAMPUS',
            createdBySpocId: coord.id
        }
    });

    console.log('Module 11 Seeded!');
    console.log('Job ID:', job.id);
    console.log('Coordinator Email: coord_11@example.com');
}

main().catch(console.error).finally(() => prisma.$disconnect());
