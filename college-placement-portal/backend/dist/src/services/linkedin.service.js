"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishLinkedInAnnouncement = void 0;
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
const buildPostTemplate = (companyName, students) => {
    const placedList = students
        .map(s => `• ${s.name} (${s.branch}) — ${s.role} @ ${s.ctc}`)
        .join('\n');
    return `🎉 Placement Announcement 🎉\nWe are proud to announce that the following students have been placed at ${companyName}:\n${placedList}\n#Placements #TPCC #PlacementDrive`;
};
const publishLinkedInAnnouncement = (jobId, coordinatorUserId) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Fetch job and all placement records with student profiles
    const job = yield prisma.job.findUnique({
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
    const placedStudents = job.placements.map(pr => ({
        name: `${pr.student.firstName} ${pr.student.lastName}`.trim(),
        branch: pr.student.branch || 'N/A',
        linkedin_url: pr.student.linkedin || '',
        role: pr.role,
        ctc: pr.ctc || 'N/A'
    }));
    const placementYear = new Date().getFullYear();
    const postTemplate = buildPostTemplate(job.companyName, placedStudents);
    const payload = {
        company_name: job.companyName,
        job_id: job.id,
        placement_year: placementYear,
        placed_students: placedStudents,
        post_template: postTemplate
    };
    // 3. Check toggle
    let isEnabled = process.env.ZAPIER_LINKEDIN_ENABLED === 'true';
    try {
        const setting = yield prisma.systemSetting.findUnique({ where: { key: 'ZAPIER_LINKEDIN_ENABLED' } });
        if (setting)
            isEnabled = setting.value === 'true';
    }
    catch (_a) {
        // fallback to env
    }
    // 4. Fire webhook or mock
    let zapStatus = 'MOCKED';
    let responseBody = null;
    if (isEnabled) {
        const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
        if (webhookUrl) {
            try {
                const response = yield axios_1.default.post(webhookUrl, payload);
                zapStatus = 'SUCCESS';
                responseBody = JSON.stringify(response.data);
            }
            catch (err) {
                zapStatus = 'FAILED';
                responseBody = (err === null || err === void 0 ? void 0 : err.message) || 'Webhook POST failed';
                console.error('[LINKEDIN] Zapier webhook failed:', err === null || err === void 0 ? void 0 : err.message);
            }
        }
        else {
            console.log('[LINKEDIN-MOCK] ZAPIER_WEBHOOK_URL not set. Payload:', JSON.stringify(payload, null, 2));
        }
    }
    else {
        console.log('[LINKEDIN-MOCK] Disabled. Payload:', JSON.stringify(payload, null, 2));
    }
    // 5. Save log
    const log = yield prisma.placementAnnouncementLog.create({
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
});
exports.publishLinkedInAnnouncement = publishLinkedInAnnouncement;
