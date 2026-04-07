import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

export interface PlacedStudentInfo {
    name: string;
    branch: string;
    linkedin_url: string;
    role: string;
    ctc: string;
}

export interface LinkedInPayload {
    company_name: string;
    job_id: string;
    placement_year: number;
    placed_students: PlacedStudentInfo[];
    post_template: string;
}

const buildPostTemplate = (companyName: string, students: PlacedStudentInfo[]): string => {
    const placedList = students
        .map(s => `• ${s.name} (${s.branch}) — ${s.role} @ ${s.ctc}`)
        .join('\n');
    return `🎉 Placement Announcement 🎉\nWe are proud to announce that the following students have been placed at ${companyName}:\n${placedList}\n#Placements #TPCC #PlacementDrive`;
};

export const publishLinkedInAnnouncement = async (
    jobId: string,
    coordinatorUserId: string
): Promise<{ success: boolean; log: any }> => {
    // 1. Fetch job and all placement records with student profiles
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
            placements: {
                include: {
                    student: {
                        select: { firstName: true, lastName: true, branch: true, linkedin: true }
                    }
                }
            }
        }
    });

    if (!job) {
        throw new Error(`Job ${jobId} not found`);
    }

    // 2. Build placed_students array from PlacementRecord + Student
    const placedStudents: PlacedStudentInfo[] = job.placements.map(pr => ({
        name: `${pr.student.firstName} ${pr.student.lastName}`.trim(),
        branch: pr.student.branch || 'N/A',
        linkedin_url: pr.student.linkedin || '',
        role: pr.role,
        ctc: pr.ctc || 'N/A'
    }));

    const placementYear = new Date().getFullYear();
    const postTemplate = buildPostTemplate(job.companyName, placedStudents);

    const payload: LinkedInPayload = {
        company_name: job.companyName,
        job_id: job.id,
        placement_year: placementYear,
        placed_students: placedStudents,
        post_template: postTemplate
    };

    // 3. Check toggle
    let isEnabled = process.env.ZAPIER_LINKEDIN_ENABLED === 'true';
    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'ZAPIER_LINKEDIN_ENABLED' } });
        if (setting) isEnabled = setting.value === 'true';
    } catch {
        // fallback to env
    }

    // 4. Fire webhook or mock
    let zapStatus = 'MOCKED';
    let responseBody: string | null = null;

    if (isEnabled) {
        const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
        if (webhookUrl) {
            try {
                const response = await axios.post(webhookUrl, payload);
                zapStatus = 'SUCCESS';
                responseBody = JSON.stringify(response.data);
            } catch (err: any) {
                zapStatus = 'FAILED';
                responseBody = err?.message || 'Webhook POST failed';
                console.error('[LINKEDIN] Zapier webhook failed:', err?.message);
            }
        } else {
            console.log('[LINKEDIN-MOCK] ZAPIER_WEBHOOK_URL not set. Payload:', JSON.stringify(payload, null, 2));
        }
    } else {
        console.log('[LINKEDIN-MOCK] Disabled. Payload:', JSON.stringify(payload, null, 2));
    }

    // 5. Save log
    const log = await prisma.placementAnnouncementLog.create({
        data: {
            jobId: job.id,
            companyName: job.companyName,
            placementYear,
            postedByUserId: coordinatorUserId,
            zapStatus,
            responseBody,
            payload: JSON.stringify(payload),
            postedAt: zapStatus === 'SUCCESS' ? new Date() : null
        }
    });

    return {
        success: zapStatus === 'SUCCESS' || zapStatus === 'MOCKED',
        log
    };
};
