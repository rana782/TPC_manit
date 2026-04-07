import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { getATSAnalysis, getAbsoluteResumeAnalysis, parseResumeWithLlm } from '../services/atsAnalysis.service';

const prisma = new PrismaClient();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse') as any;
const PDFParse = pdfParseModule?.PDFParse;

const MIN_RESUME_TEXT_LENGTH = 50;
const ATS_DEBUG = String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';

export async function getResumeTextForAts(resume: any): Promise<string> {
    const extracted = await extractResumeText(resume?.fileUrl || '');
    return (extracted || '').trim();
}

export async function getResumeTextForAtsWithMeta(
    resume: any
): Promise<{ text: string; source: 'pdf' | 'empty'; length: number }> {
    const extracted = await extractResumeText(resume?.fileUrl || '');
    const extractedLen = (extracted || '').trim().length;
    return { text: extracted || '', source: extractedLen > 0 ? 'pdf' : 'empty', length: extractedLen };
}

// Utility: extract text from uploaded PDF
async function extractResumeText(fileUrl: string): Promise<string> {
    try {
        const baseName = path.basename(fileUrl || '');
        const candidates = [
            path.resolve(process.cwd(), 'uploads', baseName),
            path.resolve(__dirname, '../../uploads', baseName),
            path.resolve(__dirname, '../../../uploads', baseName)
        ];
        const filePath = candidates.find((candidate) => fs.existsSync(candidate));
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
        const jobText = `${job.role}\n${job.description}`;
        debugLog('Resume Text:', (resumeText || '').slice(0, 100));
        debugLog('Job Desc:', jobText.slice(0, 100));

        if (!resumeText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
            res.status(400).json({
                success: false,
                message: 'Uploaded resume PDF could not be parsed. Please upload a text-based PDF.',
            });
            return;
        }

        debugLog('Resume Length:', resumeText?.length || 0);
        debugLog('JD Length:', jobText?.length || 0);

        const parsedResume = await parseResumeWithLlm(resumeText);
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

// POST /api/ats/score-absolute
// Body: { resumeId: string } — resume-only ATS readiness (0–100), no job description
export const absoluteScoreHandler = async (req: Request, res: Response): Promise<void> => {
    try {
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

        const parsedResume = await parseResumeWithLlm(resumeText);
        const result = await getAbsoluteResumeAnalysis(parsedResume.normalizedText);
        debugLog('Absolute ATS output:', result);

        res.json({
            success: true,
            data: {
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
                analysisType: 'absolute',
            },
        });
    } catch (err: any) {
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

        const jobText = `${job.role}\n${job.description}`;

        const results = await Promise.all(
            resumes.map(async (r) => {
                const resumeText = await getResumeTextForAts(r);
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
                const parsedResume = await parseResumeWithLlm(resumeText);
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
