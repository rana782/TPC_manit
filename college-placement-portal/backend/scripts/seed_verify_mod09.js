const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
    const password = await bcrypt.hash('Password@123', 10);

    console.log('Cleaning up Module 09 data...');
    await prisma.actionOverride.deleteMany({});
    await prisma.profileLock.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: '_09@example.com' } } });

    console.log('Seeding Users...');
    // Coordinator
    const coord = await prisma.user.create({
        data: {
            email: 'coord_09@example.com',
            password,
            role: 'COORDINATOR',
            isVerified: true
        }
    });

    // Verified SPOC
    const spocVerified = await prisma.user.create({
        data: {
            email: 'spoc_verified_09@example.com',
            password,
            role: 'SPOC',
            isVerified: true,
            permLockProfile: true
        }
    });

    // Pending SPOC
    const spocPending = await prisma.user.create({
        data: {
            email: 'spoc_pending_09@example.com',
            password,
            role: 'SPOC',
            isVerified: false
        }
    });

    // Student
    const studentUser = await prisma.user.create({
        data: {
            email: 's1_09@example.com',
            password,
            role: 'STUDENT',
            isVerified: true
        }
    });

    const student = await prisma.student.create({
        data: {
            userId: studentUser.id,
            firstName: 'GovTest',
            lastName: 'Student',
            branch: 'CSE',
            cgpa: 9.0,
            isLocked: true,
            lockedReason: 'Locked for Override Test'
        }
    });

    await prisma.profileLock.create({
        data: {
            studentId: student.id,
            lockType: 'DEBARRED',
            lockedById: spocVerified.id,
            reason: 'Seeded Lock',
            isActive: true
        }
    });

    const job = await prisma.job.create({
        data: {
            role: 'Audit Job',
            companyName: 'AuditCorp',
            description: 'To be deleted via override',
            jobType: 'Full-Time',
            ctc: '10 LPA',
            cgpaMin: 0,
            eligibleBranches: '[]',
            requiredProfileFields: '[]',
            customQuestions: '[]',
            status: 'PUBLISHED',
            applicationDeadline: new Date('2026-12-31'),
            postedById: spocVerified.id
        }
    });

    console.log('Module 09 Seeded Successfully!');
    console.log('Coordinator:', coord.email);
    console.log('Pending SPOC:', spocPending.email, 'ID:', spocPending.id);
    console.log('Verified SPOC:', spocVerified.email, 'ID:', spocVerified.id);
    console.log('Student ID:', student.id);
    console.log('Job ID:', job.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
