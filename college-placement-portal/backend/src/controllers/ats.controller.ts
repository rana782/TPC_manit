import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import fs from 'fs';
import { getATSAnalysis, getAbsoluteResumeAnalysis, parseResumeWithLlm } from '../services/atsAnalysis.service';
import {
    buildResumeInputForAtsParser,
    extractFromPublicFileUrl,
    getAtsNanonetsBudgetMs,
    logDocumentExtraction,
    normalizeExtractedText,
    resolveUploadAbsolutePath,
} from '../services/document.service';

import prisma from '../lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse') as any;
const PDFParse = pdfParseModule?.PDFParse;

const MIN_RESUME_TEXT_LENGTH = 50;
const ATS_DEBUG = String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';

export type ResumeExtractionOptions = {
    /** Nanonets HTTP timeout for this call (upload prefetch uses a larger default). */
    nanonetsBudgetMs?: number;
};

export type ResumeTextSource = 'cache' | 'nanonets' | 'pdf' | 'empty';

export type ResumeTextMeta = {
    text: string;
    source: ResumeTextSource;
    length: number;
    extractedJson: unknown | null;
};

/** Plain + structured text for ATS pipeline (after extraction, before parseResumeWithLlm). */
export async function getResumeTextForAts(resume: any, opts?: ResumeExtractionOptions): Promise<string> {
    const meta = await getResumeTextForAtsWithMeta(resume, opts);
    return buildResumeInputForAtsParser(meta);
}

export async function getResumeTextForAtsWithMeta(
    resume: any,
    opts?: ResumeExtractionOptions
): Promise<ResumeTextMeta> {
    const cached = String(resume?.extractedText || '').trim();
    if (cached.length >= MIN_RESUME_TEXT_LENGTH) {
        const j = resume?.extractedJson ?? null;
        logDocumentExtraction({
            context: 'resume_ats',
            source: 'cache',
            success: true,
            timeMs: 0,
            resumeId: resume?.id,
        });
        return { text: cached, source: 'cache', length: cached.length, extractedJson: j };
    }

    const fileUrl = resume?.fileUrl || '';
    const nanoBudget = opts?.nanonetsBudgetMs ?? getAtsNanonetsBudgetMs();
    const nano = await extractFromPublicFileUrl(fileUrl, {
        timeoutMs: nanoBudget,
        context: 'resume_ats',
    });
    if (nano && nano.text.trim().length >= MIN_RESUME_TEXT_LENGTH) {
        const text = normalizeExtractedText(nano.text);
        if (resume?.id) {
            await prisma.resume
                .update({
                    where: { id: resume.id },
                    data: {
                        extractedText: text,
                        extractedJson: nano.extracted_json as Prisma.InputJsonValue,
                    },
                })
                .catch(() => {});
        }
        return {
            text,
            source: 'nanonets',
            length: text.length,
            extractedJson: nano.extracted_json,
        };
    }

    const pdfStarted = Date.now();
    const pdfText = await extractResumeText(fileUrl);
    const trimmed = (pdfText || '').trim();
    if (trimmed.length >= MIN_RESUME_TEXT_LENGTH && resume?.id) {
        await prisma.resume
            .update({
                where: { id: resume.id },
                data: { extractedText: trimmed },
            })
            .catch(() => {});
    }
    logDocumentExtraction({
        context: 'resume_ats',
        source: 'pdf-parse',
        success: trimmed.length >= MIN_RESUME_TEXT_LENGTH,
        timeMs: Date.now() - pdfStarted,
        resumeId: resume?.id,
    });
    return {
        text: trimmed,
        source: trimmed.length > 0 ? 'pdf' : 'empty',
        length: trimmed.length,
        extractedJson: resume?.extractedJson ?? null,
    };
}

/** Job text for ATS: role, description, plus optional JD file (`jdPath`) via document extraction with fallback. */
export async function getJobTextForAts(job: {
    role: string;
    description: string | null;
    jdPath?: string | null;
}): Promise<string> {
    const parts: string[] = [job.role, job.description || ''].filter((s) => String(s || '').trim().length > 0);
    const base = parts.join('\n');

    if (!job.jdPath || !String(job.jdPath).trim()) {
        return base;
    }

    const nano = await extractFromPublicFileUrl(job.jdPath, {
        timeoutMs: getAtsNanonetsBudgetMs(),
        context: 'jd_ats',
    });
    if (nano?.text?.trim()) {
        return `${base}\n\n--- JD document (extracted) ---\n${normalizeExtractedText(nano.text)}`;
    }

    const fallback = await extractResumeText(job.jdPath);
    if (fallback?.trim()) {
        return `${base}\n\n--- JD document (extracted) ---\n${normalizeExtractedText(fallback)}`;
    }

    return base;
}

// Utility: extract text from uploaded PDF (fallback when Nanonets is off or fails)
async function extractResumeText(fileUrl: string): Promise<string> {
    try {
        const filePath = resolveUploadAbsolutePath(fileUrl);
        if (!filePath) return '';
        const buffer = fs.readFileSync(filePath);
        if (typeof PDFParse !== 'function') return '';
        const parser = new PDFParse({ data: buffer });
        const data = await parser.getText();
        await parser.destroy();
        return (data?.text || '').trim();
    } catch {
        return ''; // gracefully degrade if pdf-parse fails
    }
}

function debugLog(...args: unknown[]) {
    if (ATS_DEBUG) console.log('[ATS_DEBUG]', ...args);
}

// POST /api/ats/score
// Body: { resumeId: string, jobId: string }
export const scoreHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

        const { resumeId, jobId } = req.body;
        if (!resumeId || !jobId) {
            res.status(400).json({ success: false, message: 'resumeId and jobId are required' });
            return;
        }

        // Validate ownership
        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false, message: 'Student profile not found' }); return; }

        const resume = await prisma.resume.findFirst({ where: { id: resumeId, studentId: student.id } });
        if (!resume) { res.status(404).json({ success: false, message: 'Resume not found' }); return; }

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) { res.status(404).json({ success: false, message: 'Job not found' }); return; }

        // Extract text
        const resumeMeta = await getResumeTextForAtsWithMeta(resume);
        const resumeText = resumeMeta.text;
        const jobText = await getJobTextForAts(job);
        debugLog('Resume Text:', (resumeText || '').slice(0, 100));
        debugLog('Job Desc:', jobText.slice(0, 100));

        if (!resumeText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
            res.status(400).json({
                success: false,
                message: 'Uploaded resume PDF could not be parsed. Please upload a text-based PDF.',
            });
            return;
        }

        const resumeForParser = buildResumeInputForAtsParser(resumeMeta);
        debugLog('Resume Length:', resumeForParser?.length || 0);
        debugLog('JD Length:', jobText?.length || 0);

        const parsedResume = await parseResumeWithLlm(resumeForParser);
        const result = await getATSAnalysis(parsedResume.normalizedText, jobText);
        debugLog('ATS Output:', result);

        // If application already exists, update its ATS fields
        await prisma.jobApplication.updateMany({
            where: { studentId: student.id, jobId: job.id },
            data: {
                atsScore: result.score,
                atsExplanation: result.explanation,
                atsMatchedKeywords: JSON.stringify(result.matchedKeywords),
                semanticScore: result.semanticScore,
                skillScore: result.skillScore,
                skillsMatched: JSON.stringify(result.skillsMatched),
                skillsMissing: JSON.stringify(result.skillsMissing),
                suggestions: JSON.stringify(result.suggestions || []),
            },
        });

        res.json({
            success: true,
            data: {
                resumeId: resume.id,
                jobId: job.id,
                score: result.score,
                matchScore: result.matchScore,
                semanticScore: result.semanticScore,
                skillScore: result.skillScore,
                explanation: result.explanation,
                matchedKeywords: result.matchedKeywords,
                skillsMatched: result.skillsMatched,
                skillsMissing: result.skillsMissing,
                matchedSkills: result.skillsMatched,
                missingSkills: result.skillsMissing,
                strengths: result.strengths ?? [],
                suggestions: result.suggestions || [],
                engine: result.provider,
                llmModel: result.provider === 'llm' ? result.model : undefined,
                parserModel: parsedResume.model,
                resumeTextSource: resumeMeta.source,
                resumeTextLength: resumeMeta.length,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// POST /api/ats/score-absolute
// Body: { resumeId: string, stream?: boolean } — resume-only ATS readiness (0–100), no job description
// When stream is true (or query ?stream=1), responds with NDJSON: status → partial → done
export const absoluteScoreHandler = async (req: Request, res: Response): Promise<void> => {
    const streamNdjson =
        req.body?.stream === true ||
        req.body?.stream === 'true' ||
        req.query?.stream === '1' ||
        req.query?.stream === 'true';

    try {
        let clientClosed = false;
        req.on('close', () => {
            clientClosed = true;
        });
        const ensureClientOpen = () => {
            if (clientClosed) {
                const err = new Error('client disconnected');
                (err as any).code = 'CLIENT_ABORT';
                throw err;
            }
        };
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { resumeId } = req.body;
        if (!resumeId) {
            res.status(400).json({ success: false, message: 'resumeId is required' });
            return;
        }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Student profile not found' });
            return;
        }

        const resume = await prisma.resume.findFirst({ where: { id: resumeId, studentId: student.id } });
        if (!resume) {
            res.status(404).json({ success: false, message: 'Resume not found' });
            return;
        }

        const resumeMeta = await getResumeTextForAtsWithMeta(resume);
        const resumeText = resumeMeta.text;
        debugLog('Absolute ATS resume preview:', (resumeText || '').slice(0, 120));

        if (!resumeText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
            res.status(400).json({
                success: false,
                message: 'Uploaded resume PDF could not be parsed. Please upload a text-based PDF.',
            });
            return;
        }

        const resumeForParser = buildResumeInputForAtsParser(resumeMeta);

        const buildPayload = (parsedResume: Awaited<ReturnType<typeof parseResumeWithLlm>>, result: Awaited<ReturnType<typeof getAbsoluteResumeAnalysis>>) => ({
            resumeId: resume.id,
            score: result.score,
            explanation: result.explanation,
            strengths: result.strengths ?? [],
            suggestions: result.suggestions || [],
            engine: result.provider,
            llmModel: result.provider === 'llm' ? result.model : undefined,
            parserModel: parsedResume.model,
            resumeTextSource: resumeMeta.source,
            resumeTextLength: resumeMeta.length,
            analysisType: 'absolute' as const,
        });

        if (streamNdjson) {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            (res as any).flushHeaders?.();

            const writeLine = (obj: unknown) => {
                res.write(`${JSON.stringify(obj)}\n`);
                (res as any).flush?.();
            };

            writeLine({ type: 'status', phase: 'resume', message: 'Reading resume text…' });
            await sleep(15);
            ensureClientOpen();

            writeLine({ type: 'status', phase: 'parser', message: 'Structuring resume for scoring…' });
            const parsedResume = await parseResumeWithLlm(resumeForParser);
            ensureClientOpen();
            writeLine({
                type: 'partial',
                data: { parserModel: parsedResume.model, resumeTextLength: resumeMeta.length },
            });

            writeLine({ type: 'status', phase: 'analysis', message: 'Computing ATS readiness score…' });
            const result = await getAbsoluteResumeAnalysis(parsedResume.normalizedText);
            ensureClientOpen();
            debugLog('Absolute ATS output:', result);

            const engine = result.provider === 'openai' || result.provider === 'llm' ? result.provider : 'fallback';
            writeLine({ type: 'partial', data: { score: result.score, engine } });
            await sleep(20);
            writeLine({ type: 'partial', data: { explanation: result.explanation } });
            await sleep(20);
            writeLine({ type: 'partial', data: { strengths: result.strengths ?? [] } });
            await sleep(20);
            writeLine({ type: 'partial', data: { suggestions: result.suggestions || [] } });

            const full = buildPayload(parsedResume, result);
            writeLine({ type: 'done', data: full });
            res.end();
            return;
        }

        const parsedResume = await parseResumeWithLlm(resumeForParser);
        const result = await getAbsoluteResumeAnalysis(parsedResume.normalizedText);
        debugLog('Absolute ATS output:', result);

        res.json({
            success: true,
            data: buildPayload(parsedResume, result),
        });
    } catch (err: any) {
        if (err?.code === 'CLIENT_ABORT') {
            return;
        }
        if (res.headersSent) {
            try {
                res.write(`${JSON.stringify({ type: 'error', message: err?.message || 'Server error' })}\n`);
            } catch {
                /* ignore */
            }
            res.end();
            return;
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/ats/batch-score
// Body: { jobId, resumeIds: string[] } → returns array of { resumeId, score, explanation }
export const batchScoreHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) { res.status(401).json({ success: false }); return; }

        const { jobId, resumeIds } = req.body;
        if (!jobId || !Array.isArray(resumeIds) || resumeIds.length === 0) {
            res.status(400).json({ success: false, message: 'jobId and resumeIds[] are required' }); return;
        }

        const student = await prisma.student.findUnique({ where: { userId } });
        if (!student) { res.status(404).json({ success: false }); return; }

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) { res.status(404).json({ success: false }); return; }

        const resumes = await prisma.resume.findMany({
            where: { id: { in: resumeIds }, studentId: student.id },
        });

        const jobText = await getJobTextForAts(job);

        const results = await Promise.all(
            resumes.map(async (r) => {
                const resumeMeta = await getResumeTextForAtsWithMeta(r);
                const resumeText = resumeMeta.text;
                if (!resumeText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
                    return {
                        resumeId: r.id,
                        roleName: r.roleName,
                        score: 0,
                        matchScore: 0,
                        semanticScore: 0,
                        skillScore: 0,
                        explanation: 'Resume parsing failed',
                        matchedKeywords: [],
                        skillsMatched: [],
                        skillsMissing: [],
                        suggestions: []
                    };
                }
                const resumeForParser = buildResumeInputForAtsParser(resumeMeta);
                const parsedResume = await parseResumeWithLlm(resumeForParser);
                const scored = await getATSAnalysis(parsedResume.normalizedText, jobText);
                return { resumeId: r.id, roleName: r.roleName, ...scored };
            })
        );

        // Mark highest scorer as "recommended"
        const maxScore = results.length ? Math.max(...results.map(r => r.score)) : 0;
        const withRecommendation = results.map(r => ({
            ...r,
            recommended: r.score === maxScore && maxScore > 0,
        }));

        res.json({ success: true, data: withRecommendation });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/ats/config
export const getConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        let setting = await prisma.systemSetting.findUnique({ where: { key: 'ATS_WEIGHTS' } });
        if (!setting) {
            // Fresher-friendly defaults: high weight on skills + projects, minimal on experience
            const defaultWeights = {
                skillsMatch:    0.40,
                projects:       0.30,
                certifications: 0.15,
                tools:          0.10,
                experience:     0.05
            };
            setting = await prisma.systemSetting.create({
                data: { key: 'ATS_WEIGHTS', value: JSON.stringify(defaultWeights) }
            });
        }
        res.json({ success: true, data: JSON.parse(setting.value) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: 'Failed to fetch ATS config' });
    }
};

// PUT /api/ats/config
// Body: { skillsMatch: number, experience: number, projects: number, certifications: number, tools: number }
export const updateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const weights = req.body;
        // Basic validation: sum should be close to 1.0
        const values = Object.values(weights) as number[];
        if (values.some(v => typeof v !== 'number' || v < 0 || v > 1)) {
            res.status(400).json({ success: false, message: 'Invalid weight format. Expected numbers between 0 and 1.' });
            return;
        }

        const sum = values.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1.0) > 0.01) {
            res.status(400).json({ success: false, message: `Weights must sum to approximately 1.0 (current sum: ${sum.toFixed(2)})` });
            return;
        }

        const setting = await prisma.systemSetting.upsert({
            where: { key: 'ATS_WEIGHTS' },
            create: { key: 'ATS_WEIGHTS', value: JSON.stringify(weights) },
            update: { value: JSON.stringify(weights) }
        });

        res.json({ success: true, message: 'ATS weights updated successfully', data: JSON.parse(setting.value) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: 'Failed to update ATS config' });
    }
};

export { extractResumeText };
