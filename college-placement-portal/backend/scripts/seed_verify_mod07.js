const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
    const password = await bcrypt.hash('Password@123', 10);

    console.log('Cleaning up Module 07 data...');
    await prisma.jobApplication.deleteMany({});
    await prisma.jobStage.deleteMany({});
    await prisma.placementRecord.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: '_07@example.com' } } });

    console.log('Seeding SPOC...');
    const spoc = await prisma.user.create({
        data: {
            email: 'spoc_verify_07@example.com',
            password,
            role: 'SPOC',
            isVerified: true,
            permJobCreate: true
        }
    });

    console.log('Seeding Job...');
    const job = await prisma.job.create({
        data: {
            role: 'SDE-1',
            companyName: 'TimelineCorp',
            description: 'Test Job for Module 07',
            jobType: 'Full-Time',
            ctc: '20 LPA',
            cgpaMin: 0,
            eligibleBranches: '[]',
            requiredProfileFields: '[]',
            customQuestions: '[]',
            status: 'PUBLISHED',
            placementMode: 'ON_CAMPUS',
            applicationDeadline: new Date('2026-12-31'),
            postedById: spoc.id
        }
    });

    console.log('Seeding 3 Students with applications...');
    const studentEmails = ['s1_07@example.com', 's2_07@example.com', 's3_07@example.com'];
    
    for (const email of studentEmails) {
        const user = await prisma.user.create({
            data: {
                email,
                password,
                role: 'STUDENT',
                isVerified: true
            }
        });

        const student = await prisma.student.create({
            data: {
                userId: user.id,
                firstName: email.split('@')[0],
                lastName: 'Test',
                branch: 'CSE',
                cgpa: 9.0,
                isLocked: false
            }
        });

        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                fileName: 'resume.pdf',
                fileUrl: '/uploads/res.pdf'
            }
        });

        await prisma.jobApplication.create({
            data: {
                studentId: student.id,
                jobId: job.id,
                resumeId: resume.id,
                applicationData: '{}',
                status: 'APPLIED'
            }
        });
    }

    console.log('Module 07 Seeded successfully!');
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
