import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedForAtsTest() {
    const EMAIL = 'demo_student@example.com';
    const PASS = 'Password@123';

    // Create Student
    let user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) {
        const hash = await bcrypt.hash(PASS, 10);
        user = await prisma.user.create({
            data: { email: EMAIL, password: hash, role: 'STUDENT', isVerified: true },
        });
        await prisma.student.create({
            data: { userId: user.id, firstName: 'Demo', lastName: 'Student', branch: 'CS', course: 'B.Tech' },
        });
    }

    const student = await prisma.student.findUnique({ where: { userId: user.id } });

    // Add two Resumes to see ranking
    const existingResumes = await prisma.resume.findMany({ where: { studentId: student!.id } });
    if (existingResumes.length === 0) {
        await prisma.resume.create({
            data: { studentId: student!.id, roleName: 'Frontend Developer', fileName: 'frontend_resume.pdf', fileUrl: '/uploads/dummy_frontend.pdf', isActive: true },
        });
        await prisma.resume.create({
            data: { studentId: student!.id, roleName: 'Backend Developer', fileName: 'backend_resume.pdf', fileUrl: '/uploads/dummy_backend.pdf', isActive: true },
        });
    }

    // Create SPOC & Job
    let spoc = await prisma.user.findUnique({ where: { email: 'demo_spoc@example.com' } });
    if (!spoc) {
        spoc = await prisma.user.create({
            data: { email: 'demo_spoc@example.com', password: await bcrypt.hash(PASS, 10), role: 'SPOC', isVerified: true },
        });
    }

    const jobs = await prisma.job.findMany({ where: { postedById: spoc.id } });
    if (jobs.length === 0) {
        await prisma.job.create({
            data: {
                title: 'Senior React Engineer',
                company: 'TechCorp',
                description: 'Need a specialized frontend engineer with React and TypeScript.',
                requiredProfileFields: ['resume'],
                postedById: spoc.id,
                deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });
    }

    console.log('Seeded successfully. Login with demo_student@example.com / Password@123');
}

seedForAtsTest()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
