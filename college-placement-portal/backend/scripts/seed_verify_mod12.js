const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
    const password = await bcrypt.hash('Password@123', 10);

    console.log('Cleaning up Module 12 data...');
    await prisma.alumni.deleteMany({});
    await prisma.placementRecord.deleteMany({});
    await prisma.jobApplication.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: '_12@example.com' } } });

    console.log('Seeding Users...');
    const coord = await prisma.user.create({
        data: {
            email: 'coord_12@example.com',
            password,
            role: 'COORDINATOR',
            isVerified: true
        }
    });

    const spoc = await prisma.user.create({
        data: {
            email: 'spoc_12@example.com',
            password,
            role: 'SPOC',
            isVerified: true
        }
    });

    const branches = ['Computer Science', 'Information Technology', 'Mechanical', 'Electronics'];
    const students = [];

    for (let i = 0; i < 8; i++) {
        const branch = branches[i % branches.length];
        const user = await prisma.user.create({
            data: {
                email: `s${i}_12@example.com`,
                password,
                role: 'STUDENT',
                isVerified: true
            }
        });

        const student = await prisma.student.create({
            data: {
                userId: user.id,
                firstName: `Student${i}`,
                lastName: `Last${i}`,
                branch: branch,
                cgpa: 7.0 + (i * 0.3),
                phone: `900000000${i}`,
                isLocked: i === 1, // Lock the second student for debarment tests
                lockedReason: i === 1 ? 'Violated placement rules (Sample Lock)' : ''
            }
        });

        const resume = await prisma.resume.create({
            data: {
                studentId: student.id,
                fileName: `resume_${i}.pdf`,
                fileUrl: `/uploads/res_${i}.pdf`,
                isActive: true,
                roleName: 'Software Engineer'
            }
        });

        students.push({ student, user, resume });
    }

    console.log('Seeding Jobs...');
    const companies = [
        { name: 'TechGiant', role: 'SDE-1', ctc: '20 LPA' },
        { name: 'DataFlow', role: 'Data Analyst', ctc: '15 LPA' },
        { name: 'MechWorks', role: 'Design Engineer', ctc: '10 LPA' }
    ];

    const jobs = [];
    for (const comp of companies) {
        const job = await prisma.job.create({
            data: {
                role: comp.role,
                companyName: comp.name,
                description: `Hiring for ${comp.role} at ${comp.name}. Needs SQL, Python, Java.`,
                jobType: 'Full-Time',
                ctc: comp.ctc,
                cgpaMin: 0,
                eligibleBranches: JSON.stringify(['CSE', 'IT', 'ECE']),
                requiredProfileFields: '[]',
                customQuestions: '[]',
                status: 'PUBLISHED',
                applicationDeadline: new Date('2026-12-31'),
                postedById: spoc.id
            }
        });
        jobs.push(job);
    }

    console.log('Seeding Applications & Placements...');
    // Placement Logic:
    // TechGiant -> Student0 (CS), Student1 (IT)
    // DataFlow -> Student2 (ME), Student3 (ECE)
    // MechWorks -> Student4 (CS - Out of branch test), Student5 (ME)

    const placementData = [
        { studentIdx: 0, jobIdx: 0 },
        { studentIdx: 1, jobIdx: 0 },
        { studentIdx: 2, jobIdx: 1 },
        { studentIdx: 3, jobIdx: 1 },
        { studentIdx: 4, jobIdx: 2 },
        { studentIdx: 5, jobIdx: 2 }
    ];

    for (const pd of placementData) {
        const s = students[pd.studentIdx];
        const j = jobs[pd.jobIdx];

        await prisma.jobApplication.create({
            data: {
                studentId: s.student.id,
                jobId: j.id,
                resumeId: s.resume.id,
                applicationData: '{}', // Required field
                status: 'ACCEPTED',
                atsScore: 80
            }
        });

        await prisma.placementRecord.create({
            data: {
                studentId: s.student.id,
                jobId: j.id,
                companyName: j.companyName,
                role: j.role,
                ctc: j.ctc,
                placementMode: 'ON_CAMPUS',
                createdBySpocId: spoc.id
            }
        });

        // Also seed manual Alumni for historical comparison
        await prisma.alumni.create({
            data: {
                studentId: s.student.id,
                userId: s.user.id,
                name: `${s.student.firstName} ${s.student.lastName}`,
                branch: s.student.branch,
                role: j.role,
                ctc: j.ctc,
                placementYear: 2025,
                companyName: j.companyName
            }
        });
    }

    console.log('Module 12 Seeded!');
    console.log('Total Students:', students.length);
    console.log('Total Jobs:', jobs.length);
    console.log('Total Alumnis (Manual 2025):', placementData.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
