import axios from 'axios';
import prisma from '../lib/prisma';

export interface PlacedStudentInfo {
    name: string;
    branch: string;
    linkedin_url: string;
    role: string;
    ctc: string;
}

export interface LinkedInPayload {
    // Zapier LinkedIn step should map this field to Comment.
    comment: string;
    company_name: string;
    job_id: string;
    placement_year: number;
    placed_students: PlacedStudentInfo[];
    post_template: string;
}

export const DEFAULT_LINKEDIN_TEMPLATE = `🎉 Congratulations from TPC! 🎉
We're thrilled to share this update.
The following students have been placed at {company_name}:
{placed_students}
#Placements #TPCC #PlacementDrive`;

const formatPlacedStudentsForTemplate = (students: PlacedStudentInfo[]): string => {
    if (!students.length) return '• (No placed students yet)';
    return students
        .map((s) => {
            const highlightedName = String(s.name || '').trim().toUpperCase();
            const profile = String(s.linkedin_url || '').trim();
            const linkLine = profile ? `\n  🔗 ${profile}` : '';
            return `• ${highlightedName} (${s.branch}) — ${s.role} @ ${s.ctc}${linkLine}`;
        })
        .join('\n');
};

const getDefaultLinkedInTemplate = async (): Promise<string> => {
    const fallback = DEFAULT_LINKEDIN_TEMPLATE;
    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'LINKEDIN_POST_TEMPLATE' } });
        if (setting?.value?.trim()) return setting.value.trim();
    } catch {
        // fall back to generated template if settings lookup fails
    }
    return fallback;
};

const hasNonEmptyPostTemplate = (value: string | null | undefined): boolean =>
    typeof value === 'string' && value.trim().length > 0;

const normalizeForDuplicateCheck = (value: string): string =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const applyTemplateParams = (template: string, params: Record<string, string>): string => {
    let text = template;
    for (const [key, value] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return text;
};

export const publishLinkedInAnnouncement = async (
    jobId: string,
    coordinatorUserId: string,
    customPostTemplate?: string
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
    const generatedTemplate = await getDefaultLinkedInTemplate();
    const baseTemplate =
        hasNonEmptyPostTemplate(customPostTemplate) ? String(customPostTemplate).trim() : generatedTemplate;
    const placedStudentsText = formatPlacedStudentsForTemplate(placedStudents);
    const postTemplate = applyTemplateParams(baseTemplate, {
        company_name: job.companyName,
        placement_year: String(placementYear),
        placed_count: String(placedStudents.length),
        placed_students: placedStudentsText,
    });

    const payload: LinkedInPayload = {
        comment: postTemplate,
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

    if (!hasNonEmptyPostTemplate(payload.post_template)) {
        zapStatus = 'FAILED';
        responseBody = 'Skipped webhook: post_template is empty.';
        console.warn('[LINKEDIN] Skipped webhook because post_template is empty.');
    } else if (isEnabled) {
        // Prevent duplicate text from reaching LinkedIn (common "Content is a duplicate" failure).
        const recentSuccessLogs = await prisma.placementAnnouncementLog.findMany({
            where: { jobId: job.id, zapStatus: 'SUCCESS' },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { payload: true }
        });
        const currentNormalized = normalizeForDuplicateCheck(payload.post_template);
        const duplicateFound = recentSuccessLogs.some((log) => {
            try {
                const parsed = JSON.parse(log.payload || '{}');
                const previous =
                    typeof parsed?.comment === 'string'
                        ? parsed.comment
                        : typeof parsed?.post_template === 'string'
                          ? parsed.post_template
                          : '';
                return normalizeForDuplicateCheck(previous) === currentNormalized;
            } catch {
                return false;
            }
        });

        if (duplicateFound) {
            zapStatus = 'FAILED';
            responseBody = 'Duplicate content prevented before webhook call. Edit the caption template and publish again.';
        } else {
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
