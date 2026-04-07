require('ts-node').register();
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { scoreResume }  = require('../src/services/ats.service');
const path = require('path');
const fs   = require('fs');

const prisma = new PrismaClient();

// ── PDF text extraction (same logic as ats.controller.ts) ──────────────────────
async function extractResumeText(fileUrl) {
    try {
        const filePath = path.resolve(process.cwd(), 'uploads', path.basename(fileUrl));
        if (!fs.existsSync(filePath)) return '';
        const buffer = fs.readFileSync(filePath);
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text || '';
    } catch {
        return '';
    }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run() {
    const args = process.argv.slice(2);
    const jobIdIdx = args.indexOf('--job_id');
    if (jobIdIdx === -1 || !args[jobIdIdx + 1]) {
        console.error('Usage: node recompute_ats_for_job.js --job_id <uuid>');
        process.exit(1);
    }

    const jobId = args[jobIdIdx + 1];
    console.log(`\n[ATS Recompute] Fetching Job: ${jobId} …`);

    try {
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) { console.error('[ATS Recompute] Job not found!'); process.exit(1); }

        const applications = await prisma.jobApplication.findMany({
            where: { jobId },
            include: { resume: true }
        });

        if (applications.length === 0) {
            console.log('[ATS Recompute] No applications found for this job.');
            return;
        }

        console.log(`[ATS Recompute] Found ${applications.length} application(s). Scoring…\n`);

        const jobText = `${job.role}\n${job.description || ''}`;

        for (const app of applications) {
            if (!app.resume) {
                console.warn(`  → [SKIP] Application ${app.id}: no attached resume`);
                continue;
            }

            // Extract text from PDF, fall back to resume role/filename hint
            const resumeText = await extractResumeText(app.resume.fileUrl)
                || app.resume.roleName
                || app.resume.fileName
                || '';

            // Run through the same scoring pipeline used during application
            const result = await scoreResume(resumeText, jobText);

            await prisma.jobApplication.update({
                where: { id: app.id },
                data: {
                    atsScore:           result.score,
                    atsExplanation:     result.explanation,
                    atsMatchedKeywords: result.matchedKeywords
                }
            });

            console.log(`  ✓ App [${app.id}] → Score: ${result.score}/100  |  Matches: ${result.matchedKeywords.slice(0, 4).join(', ')}`);
        }

        console.log(`\n[ATS Recompute] Done — ${applications.length} application(s) updated.\n`);

    } catch (e) {
        console.error('[ATS Recompute] Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

run();
