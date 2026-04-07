import { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { upsertDemoCompanyProfiles } from '../utils/demoCompanyProfiles';

const router = Router();
const prisma = new PrismaClient();

router.get('/seed-ui', async (req: Request, res: Response) => {
    try {
        const EMAIL = 'ui_student@example.com';
        const PASS = 'Password@123';

        // Ensure student exists
        let user = await prisma.user.findUnique({ where: { email: EMAIL } });
        if (!user) {
            const hash = await bcrypt.hash(PASS, 10);
            user = await prisma.user.create({
                data: { email: EMAIL, password: hash, role: 'STUDENT', isVerified: true },
            });
            await prisma.student.create({
                data: { userId: user.id, firstName: 'UI', lastName: 'Tester', branch: 'CS', course: 'B.Tech', cgpa: 8.5, linkedin: 'https://linkedin.com/in/uitester' },
            });
        }

        const student = await prisma.student.findUnique({ where: { userId: user.id } });
        if (student) {
            await prisma.student.update({ where: { id: student.id }, data: { cgpa: 8.5, linkedin: 'https://linkedin.com/in/uitester', isLocked: false, lockedReason: null } });
        }

        // Ensure resumes exist
        const resumes = await prisma.resume.findMany({ where: { studentId: student!.id } });
        if (resumes.length === 0) {
            await prisma.resume.create({ data: { studentId: student!.id, fileName: 'Frontend.pdf', fileUrl: '/uploads/fe.pdf', isActive: true, roleName: 'Frontend Engineer Profile. Strong React skills.' } });
            await prisma.resume.create({ data: { studentId: student!.id, fileName: 'Backend.pdf', fileUrl: '/uploads/be.pdf', isActive: true, roleName: 'Backend Engineer Profile.' } });
            await prisma.resume.create({ data: { studentId: student!.id, fileName: 'Random.pdf', fileUrl: '/uploads/r.pdf', isActive: true, roleName: 'I like painting.' } });
        }

        // Ensure SPOC and job exist
        let spoc = await prisma.user.findUnique({ where: { email: 'ui_spoc@example.com' } });
        if (!spoc) {
            spoc = await prisma.user.create({
                data: { email: 'ui_spoc@example.com', password: await bcrypt.hash(PASS, 10), role: 'SPOC', isVerified: true, permJobCreate: true, permExportCsv: true, permLockProfile: true },
            });
        } else {
            // Ensure existing SPOC has permissions
            await prisma.user.update({ where: { id: spoc.id }, data: { permJobCreate: true, permExportCsv: true, permLockProfile: true } });
        }

        const customQ = JSON.stringify([
            { id: 'q1', label: 'Why do you want to join our team?', type: 'textarea', required: true },
            { id: 'q2', label: 'Link to your portfolio', type: 'url', required: false }
        ]);
        const reqFields = JSON.stringify(['resume', 'cgpa', 'linkedin']);
        const eligBranches = JSON.stringify(['CSE', 'IT', 'ECE', 'CS']);

        const jobs = await prisma.job.findMany({ where: { postedById: spoc.id } });
        if (jobs.length === 0) {
            await prisma.job.create({
                data: {
                    role: 'Senior Frontend Developer',
                    companyName: 'InnovateTech',
                    description: 'Looking for a dedicated frontend engineer experienced in React, TypeScript, and modern state management.',
                    requiredProfileFields: reqFields,
                    eligibleBranches: eligBranches,
                    customQuestions: customQ,
                    status: 'PUBLISHED',
                    postedById: spoc.id,
                    applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });
        } else {
            // Update existing InnovateTech job to have custom questions
            const innovate = jobs.find(j => j.companyName === 'InnovateTech');
            if (innovate) {
                await prisma.job.update({ where: { id: innovate.id }, data: { customQuestions: customQ, requiredProfileFields: reqFields, eligibleBranches: eligBranches } });
            }
        }

        // Clean existing applications by this student for InnovateTech so apply tests start fresh
        if (student) {
            const innovateJob = await prisma.job.findFirst({ where: { companyName: 'InnovateTech' } });
            if (innovateJob) {
                await prisma.jobApplication.deleteMany({ where: { studentId: student.id, jobId: innovateJob.id } });
            }
        }

        await upsertDemoCompanyProfiles(prisma);

        res.json({ success: true, message: 'Seeded successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-locked', async (req: Request, res: Response) => {
    try {
        const EMAIL = 'ui_locked@example.com';
        const PASS = 'Password@123';

        let user = await prisma.user.findUnique({ where: { email: EMAIL } });
        if (!user) {
            const hash = await bcrypt.hash(PASS, 10);
            user = await prisma.user.create({
                data: { email: EMAIL, password: hash, role: 'STUDENT', isVerified: true },
            });
            await prisma.student.create({
                data: { userId: user.id, firstName: 'Locked', lastName: 'Student', branch: 'CS', course: 'B.Tech', isLocked: true, lockedReason: 'Placed at Google via on-campus drive' },
            });
        } else {
            await prisma.student.update({ where: { userId: user.id }, data: { isLocked: true, lockedReason: 'Placed at Google via on-campus drive' } });
        }

        res.json({ success: true, message: 'Locked student seeded' });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-timeline', async (req: Request, res: Response) => {
    try {
        const PASS = 'Password@123';

        // 1. Ensure coordinator exists
        let coord = await prisma.user.findUnique({ where: { email: 'ui_coord@example.com' } });
        if (!coord) {
            coord = await prisma.user.create({
                data: { email: 'ui_coord@example.com', password: await bcrypt.hash(PASS, 10), role: 'COORDINATOR', isVerified: true },
            });
        }

        // 2. Get student + InnovateTech job
        const studentUser = await prisma.user.findUnique({ where: { email: 'ui_student@example.com' } });
        if (!studentUser) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });

        const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });
        if (!student) return res.status(400).json({ success: false, message: 'Student profile missing' });

        // Unlock student for this test
        await prisma.student.update({ where: { id: student.id }, data: { isLocked: false, lockedReason: null } });

        const innovateJob = await prisma.job.findFirst({ where: { companyName: 'InnovateTech' } });
        if (!innovateJob) return res.status(400).json({ success: false, message: 'InnovateTech job missing — run /seed-ui first' });

        // Ensure job has ON_CAMPUS placement mode so declareResults locks students
        await prisma.job.update({ where: { id: innovateJob.id }, data: { placementMode: 'ON_CAMPUS' } });

        // 3. Clean old stages for this job
        await prisma.jobStage.deleteMany({ where: { jobId: innovateJob.id } });

        // 4. Clean old placement records, profile locks for this student
        await prisma.placementRecord.deleteMany({ where: { studentId: student.id } }).catch(() => {});
        await prisma.profileLock.deleteMany({ where: { studentId: student.id } }).catch(() => {});

        // 5. Ensure student has an application for InnovateTech
        const resumes = await prisma.resume.findMany({ where: { studentId: student.id } });
        let app = await prisma.jobApplication.findFirst({ where: { studentId: student.id, jobId: innovateJob.id } });
        if (!app) {
            app = await prisma.jobApplication.create({
                data: {
                    studentId: student.id,
                    jobId: innovateJob.id,
                    resumeId: resumes[0]?.id || '',
                    applicationData: JSON.stringify({ resume: '/uploads/fe.pdf' }),
                    extraAnswers: JSON.stringify({}),
                    status: 'APPLIED',
                    currentStageIndex: 0,
                    atsScore: 76,
                    atsExplanation: 'Good match',
                    atsMatchedKeywords: JSON.stringify(['react', 'typescript']),
                },
            });
        } else {
            // Reset status back to APPLIED
            await prisma.jobApplication.update({ where: { id: app.id }, data: { status: 'APPLIED', currentStageIndex: 0 } });
        }

        res.json({ success: true, message: 'Timeline seed ready', jobId: innovateJob.id, applicationId: app.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-locking', async (req: Request, res: Response) => {
    try {
        const PASS = 'Password@123';

        // Ensure coordinator
        let coord = await prisma.user.findUnique({ where: { email: 'ui_coord@example.com' } });
        if (!coord) {
            coord = await prisma.user.create({
                data: { email: 'ui_coord@example.com', password: await bcrypt.hash(PASS, 10), role: 'COORDINATOR', isVerified: true },
            });
        }

        // Get student
        const studentUser = await prisma.user.findUnique({ where: { email: 'ui_student@example.com' } });
        if (!studentUser) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });
        const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });
        if (!student) return res.status(400).json({ success: false, message: 'Student profile missing' });

        // Unlock student, clear old locks/placements
        await prisma.student.update({ where: { id: student.id }, data: { isLocked: false, lockedReason: null, placementType: null } });
        await prisma.profileLock.deleteMany({ where: { studentId: student.id } }).catch(() => {});
        await prisma.placementRecord.deleteMany({ where: { studentId: student.id } }).catch(() => {});

        // Ensure application exists
        const innovateJob = await prisma.job.findFirst({ where: { companyName: 'InnovateTech' } });
        if (!innovateJob) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });

        const resumes = await prisma.resume.findMany({ where: { studentId: student.id } });
        let app = await prisma.jobApplication.findFirst({ where: { studentId: student.id, jobId: innovateJob.id } });
        if (!app) {
            app = await prisma.jobApplication.create({
                data: {
                    studentId: student.id, jobId: innovateJob.id, resumeId: resumes[0]?.id || '',
                    applicationData: JSON.stringify({ resume: '/uploads/fe.pdf' }), extraAnswers: JSON.stringify({}),
                    status: 'APPLIED', currentStageIndex: 0, atsScore: 76, atsExplanation: 'Good match', atsMatchedKeywords: JSON.stringify(['react']),
                },
            });
        } else {
            await prisma.jobApplication.update({ where: { id: app.id }, data: { status: 'APPLIED', currentStageIndex: 0 } });
        }

        res.json({ success: true, message: 'Locking seed ready', studentId: student.id, jobId: innovateJob.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-coordinator', async (req: Request, res: Response) => {
    try {
        const PASS = 'Password@123';

        // 1. Ensure coordinator
        let coord = await prisma.user.findUnique({ where: { email: 'ui_coord@example.com' } });
        if (!coord) {
            coord = await prisma.user.create({
                data: { email: 'ui_coord@example.com', password: await bcrypt.hash(PASS, 10), role: 'COORDINATOR', isVerified: true },
            });
        } else {
            // Reset password + verification on every seed run for deterministic UI tests
            await prisma.user.update({
                where: { id: coord.id },
                data: {
                    password: await bcrypt.hash(PASS, 10),
                    role: 'COORDINATOR',
                    isVerified: true
                }
            });
        }

        // 2. Create a pending (unverified) SPOC for approval testing
        const PENDING_EMAIL = 'ui_pending_spoc@example.com';
        let pendingSpoc = await prisma.user.findUnique({ where: { email: PENDING_EMAIL } });
        if (!pendingSpoc) {
            pendingSpoc = await prisma.user.create({
                data: { email: PENDING_EMAIL, password: await bcrypt.hash(PASS, 10), role: 'SPOC', isVerified: false, permJobCreate: false, permExportCsv: false, permLockProfile: false },
            });
        } else {
            // Reset to unverified for re-testing
            await prisma.user.update({ where: { id: pendingSpoc.id }, data: { isVerified: false, permJobCreate: false, permExportCsv: false, permLockProfile: false } });
        }

        // 3. Lock the student so we can test override unlock
        const studentUser = await prisma.user.findUnique({ where: { email: 'ui_student@example.com' } });
        if (studentUser) {
            const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });
            if (student) {
                await prisma.student.update({ where: { id: student.id }, data: { isLocked: true, lockedReason: 'Locked for override test', placementType: 'ON_CAMPUS' } });
                // Ensure a ProfileLock record exists for the override to find
                const existingLock = await prisma.profileLock.findFirst({ where: { studentId: student.id, isActive: true } });
                if (!existingLock) {
                    const spoc = await prisma.user.findUnique({ where: { email: 'ui_spoc@example.com' } });
                    if (spoc) {
                        await prisma.profileLock.create({
                            data: { studentId: student.id, profileLocked: true, lockedById: spoc.id, reason: 'Locked for override test', isActive: true }
                        });
                    }
                }
            }
        }

        res.json({ success: true, message: 'Coordinator seed ready', pendingSpocEmail: PENDING_EMAIL });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-notifications', async (req: Request, res: Response) => {
    try {
        const PASS = 'Password@123';
        const fs = require('fs');
        const path = require('path');

        // 1. Clear mock server log
        const logFile = path.join(__dirname, '../../tmp/mock_payloads.log');
        if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '');

        // 2. Get student
        const studentUser = await prisma.user.findUnique({ where: { email: 'ui_student@example.com' } });
        if (!studentUser) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });
        const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });
        if (!student) return res.status(400).json({ success: false, message: 'Student missing' });

        // Unlock + set phone for WhatsApp
        await prisma.student.update({ where: { id: student.id }, data: { isLocked: false, lockedReason: null, phone: '9876543210' } });

        // 3. Clear old notifications and logs for this student
        await prisma.notification.deleteMany({ where: { userId: studentUser.id } });
        await prisma.notificationLog.deleteMany({ where: { userId: studentUser.id } });

        // 4. Enable WhatsApp integration
        await prisma.systemSetting.upsert({ where: { key: 'WHATSAPP_ENABLED' }, create: { key: 'WHATSAPP_ENABLED', value: 'true' }, update: { value: 'true' } });

        // 5. Ensure InnovateTech job exists with ON_CAMPUS mode and clean stages
        const innovateJob = await prisma.job.findFirst({ where: { companyName: 'InnovateTech' } });
        if (!innovateJob) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });
        await prisma.job.update({ where: { id: innovateJob.id }, data: { placementMode: 'ON_CAMPUS' } });
        await prisma.jobStage.deleteMany({ where: { jobId: innovateJob.id } });

        // 6. Ensure application exists
        const resumes = await prisma.resume.findMany({ where: { studentId: student.id } });
        await prisma.jobApplication.deleteMany({ where: { studentId: student.id, jobId: innovateJob.id } });
        const app = await prisma.jobApplication.create({
            data: {
                studentId: student.id, jobId: innovateJob.id, resumeId: resumes[0]?.id || '',
                applicationData: JSON.stringify({ resume: '/uploads/fe.pdf' }), extraAnswers: JSON.stringify({}),
                status: 'APPLIED', currentStageIndex: 0, atsScore: 76, atsExplanation: 'Good match', atsMatchedKeywords: JSON.stringify(['react']),
            },
        });

        // 7. Clean placement records and locks
        await prisma.placementRecord.deleteMany({ where: { studentId: student.id } }).catch(() => {});
        await prisma.profileLock.deleteMany({ where: { studentId: student.id } }).catch(() => {});

        res.json({ success: true, message: 'Notifications seed ready', jobId: innovateJob.id, applicationId: app.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-analytics', async (req: Request, res: Response) => {
    try {
        // 1. Get test entities
        const studentUser = await prisma.user.findUnique({ where: { email: 'ui_student@example.com' } });
        if (!studentUser) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });
        const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });
        if (!student) return res.status(400).json({ success: false, message: 'Student missing' });

        const innovateJob = await prisma.job.findFirst({ where: { companyName: 'InnovateTech' } });
        if (!innovateJob) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });

        const spocUser = await prisma.user.findUnique({ where: { email: 'ui_spoc@example.com' } });

        // 2. Unlock student, set LinkedIn URL
        await prisma.student.update({
            where: { id: student.id },
            data: { isLocked: false, lockedReason: null, linkedin: 'https://linkedin.com/in/ui-tester', branch: 'CSE', phone: '9876543210' }
        });

        // 3. Ensure accepted application for InnovateTech exists
        let app = await prisma.jobApplication.findFirst({ where: { studentId: student.id, jobId: innovateJob.id } });
        if (!app) {
            const resume = await prisma.resume.findFirst({ where: { studentId: student.id } });
            if (resume) {
                app = await prisma.jobApplication.create({
                    data: { studentId: student.id, jobId: innovateJob.id, resumeId: resume.id, applicationData: '{}', status: 'ACCEPTED', currentStageIndex: 0, atsScore: 72, atsExplanation: 'Good match' }
                });
            }
        } else {
            await prisma.jobApplication.update({ where: { id: app.id }, data: { status: 'ACCEPTED', currentStageIndex: 0, atsScore: 72 } });
        }

        // 4. Ensure PlacementRecord exists
        await prisma.placementRecord.deleteMany({ where: { studentId: student.id, jobId: innovateJob.id } });
        await prisma.placementRecord.create({
            data: { studentId: student.id, jobId: innovateJob.id, companyName: innovateJob.companyName, role: innovateJob.role, ctc: '18 LPA', placementMode: 'ON_CAMPUS', createdBySpocId: spocUser?.id || '' }
        });

        // 5. Ensure Alumni record exists for InnovateTech
        await prisma.alumni.deleteMany({ where: { studentId: student.id, companyName: 'InnovateTech' } });
        await prisma.alumni.create({
            data: {
                studentId: student.id, userId: studentUser.id,
                name: `${student.firstName} ${student.lastName}`.trim(),
                branch: student.branch || 'CSE', role: innovateJob.role, ctc: '18 LPA',
                placementYear: new Date().getFullYear(), linkedinUrl: 'https://linkedin.com/in/ui-tester',
                companyName: 'InnovateTech'
            }
        });

        // 6. Reset ATS weights to defaults
        const defaultWeights = { skillsMatch: 0.40, projects: 0.30, certifications: 0.15, tools: 0.10, experience: 0.05 };
        await prisma.systemSetting.upsert({
            where: { key: 'ATS_WEIGHTS' },
            create: { key: 'ATS_WEIGHTS', value: JSON.stringify(defaultWeights) },
            update: { value: JSON.stringify(defaultWeights) }
        });

        res.json({ success: true, message: 'Analytics seed ready', jobId: innovateJob.id, studentId: student.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-ui-linkedin', async (req: Request, res: Response) => {
    try {
        const fs = require('fs');
        const path = require('path');

        // 1. Clear mock server log
        const logFile = path.join(__dirname, '../../tmp/mock_payloads.log');
        if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '');

        // 2. Get student + job
        const studentUser = await prisma.user.findUnique({ where: { email: 'ui_student@example.com' } });
        if (!studentUser) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });
        const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });
        if (!student) return res.status(400).json({ success: false, message: 'Student missing' });

        const innovateJob = await prisma.job.findFirst({ where: { companyName: 'InnovateTech' } });
        if (!innovateJob) return res.status(400).json({ success: false, message: 'Run /seed-ui first' });

        // 3. Update student: unlock, set LinkedIn URL
        await prisma.student.update({
            where: { id: student.id },
            data: { isLocked: false, lockedReason: null, linkedin: 'https://linkedin.com/in/ui-tester', phone: '9876543210' }
        });

        // 4. Clear old placement records and create a fresh one
        await prisma.placementRecord.deleteMany({ where: { studentId: student.id, jobId: innovateJob.id } });
        const spoc = await prisma.user.findUnique({ where: { email: 'ui_spoc@example.com' } });
        await prisma.placementRecord.create({
            data: {
                studentId: student.id, jobId: innovateJob.id, companyName: innovateJob.companyName,
                role: innovateJob.role, ctc: '18 LPA', placementMode: 'ON_CAMPUS',
                createdBySpocId: spoc?.id || ''
            }
        });

        // 5. Clear old PlacementAnnouncementLogs
        await prisma.placementAnnouncementLog.deleteMany({ where: { jobId: innovateJob.id } });

        // 6. Enable ZAPIER_LINKEDIN_ENABLED
        await prisma.systemSetting.upsert({
            where: { key: 'ZAPIER_LINKEDIN_ENABLED' },
            create: { key: 'ZAPIER_LINKEDIN_ENABLED', value: 'true' },
            update: { value: 'true' }
        });

        res.json({ success: true, message: 'LinkedIn seed ready', jobId: innovateJob.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/seed-spoc-round3', async (req: Request, res: Response) => {
    try {
        const PASS = 'Password@123';
        const stageDates = [
            new Date('2030-01-10T00:00:00.000Z'),
            new Date('2030-01-15T00:00:00.000Z'),
            new Date('2030-01-20T00:00:00.000Z')
        ];

        let spoc = await prisma.user.findUnique({ where: { email: 'ui_spoc@example.com' } });
        if (!spoc) {
            spoc = await prisma.user.create({
                data: {
                    email: 'ui_spoc@example.com',
                    password: await bcrypt.hash(PASS, 10),
                    role: 'SPOC',
                    isVerified: true,
                    permJobCreate: true,
                    permExportCsv: true,
                    permLockProfile: true
                }
            });
        }

        const students = [] as any[];
        for (let i = 1; i <= 3; i += 1) {
            const email = `round3_student_${i}@example.com`;
            let user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                user = await prisma.user.create({
                    data: { email, password: await bcrypt.hash(PASS, 10), role: 'STUDENT', isVerified: true }
                });
            }
            let student = await prisma.student.findUnique({ where: { userId: user.id } });
            if (!student) {
                student = await prisma.student.create({
                    data: {
                        userId: user.id,
                        firstName: `Round3${i}`,
                        lastName: 'Student',
                        scholarNo: `R3SCH${i}`,
                        branch: 'CSE',
                        course: 'B.Tech',
                        cgpa: 8 + i * 0.1
                    }
                });
            }

            let resume = await prisma.resume.findFirst({ where: { studentId: student.id } });
            if (!resume) {
                resume = await prisma.resume.create({
                    data: {
                        studentId: student.id,
                        fileName: `round3_${i}.pdf`,
                        fileUrl: `/uploads/round3_${i}.pdf`
                    }
                });
            }
            students.push({ user, student, resume });
        }

        let job = await prisma.job.findFirst({ where: { companyName: 'Round3 Systems', role: 'SDE I' } });
        if (!job) {
            job = await prisma.job.create({
                data: {
                    role: 'SDE I',
                    companyName: 'Round3 Systems',
                    description: 'Round 3 deterministic seed job.',
                    jobType: 'Full-Time',
                    ctc: '12',
                    cgpaMin: 7,
                    requiredProfileFields: '["resume"]',
                    eligibleBranches: '["CSE"]',
                    customQuestions: '[]',
                    status: 'PUBLISHED',
                    blockPlaced: true,
                    applicationDeadline: new Date('2030-01-05T00:00:00.000Z'),
                    postedById: spoc.id
                }
            });
        } else {
            await prisma.job.update({
                where: { id: job.id },
                data: { status: 'PUBLISHED', postedById: spoc.id }
            });
        }

        await prisma.jobStage.deleteMany({ where: { jobId: job.id } });
        await prisma.jobStage.createMany({
            data: [
                { jobId: job.id, name: 'OA', scheduledDate: stageDates[0], status: 'COMPLETED' },
                { jobId: job.id, name: 'Technical Interview', scheduledDate: stageDates[1], status: 'PENDING' },
                { jobId: job.id, name: 'HR', scheduledDate: stageDates[2], status: 'PENDING' }
            ]
        });

        for (let i = 0; i < students.length; i += 1) {
            const currentStageIndex = i === 0 ? 0 : i === 1 ? 1 : 2;
            const status = i === 2 ? 'SHORTLISTED' : 'APPLIED';
            const existing = await prisma.jobApplication.findFirst({
                where: { studentId: students[i].student.id, jobId: job.id }
            });
            if (existing) {
                await prisma.jobApplication.update({
                    where: { id: existing.id },
                    data: { status, currentStageIndex, atsScore: 75 + i }
                });
            } else {
                await prisma.jobApplication.create({
                    data: {
                        studentId: students[i].student.id,
                        jobId: job.id,
                        resumeId: students[i].resume.id,
                        applicationData: JSON.stringify({ resume: students[i].resume.fileUrl }),
                        extraAnswers: JSON.stringify({}),
                        status,
                        currentStageIndex,
                        atsScore: 75 + i,
                        atsExplanation: 'Round 3 seeded application',
                        atsMatchedKeywords: JSON.stringify(['react', 'node'])
                    }
                });
            }
            await prisma.student.update({
                where: { id: students[i].student.id },
                data: { isLocked: false, lockedReason: null, placementType: null }
            });
            await prisma.profileLock.updateMany({
                where: { studentId: students[i].student.id, isActive: true },
                data: { isActive: false }
            });
        }

        res.json({ success: true, message: 'SPOC round3 seed ready', jobId: job.id });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
