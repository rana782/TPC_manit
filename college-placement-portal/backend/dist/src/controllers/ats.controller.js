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
exports.updateConfig = exports.getConfig = exports.batchScoreHandler = exports.absoluteScoreHandler = exports.scoreHandler = void 0;
exports.getResumeTextForAts = getResumeTextForAts;
exports.getResumeTextForAtsWithMeta = getResumeTextForAtsWithMeta;
exports.extractResumeText = extractResumeText;
const client_1 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const atsAnalysis_service_1 = require("../services/atsAnalysis.service");
const prisma = new client_1.PrismaClient();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule === null || pdfParseModule === void 0 ? void 0 : pdfParseModule.PDFParse;
const MIN_RESUME_TEXT_LENGTH = 50;
const ATS_DEBUG = String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';
function getResumeTextForAts(resume) {
    return __awaiter(this, void 0, void 0, function* () {
        const extracted = yield extractResumeText((resume === null || resume === void 0 ? void 0 : resume.fileUrl) || '');
        return (extracted || '').trim();
    });
}
function getResumeTextForAtsWithMeta(resume) {
    return __awaiter(this, void 0, void 0, function* () {
        const extracted = yield extractResumeText((resume === null || resume === void 0 ? void 0 : resume.fileUrl) || '');
        const extractedLen = (extracted || '').trim().length;
        return { text: extracted || '', source: extractedLen > 0 ? 'pdf' : 'empty', length: extractedLen };
    });
}
// Utility: extract text from uploaded PDF
function extractResumeText(fileUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const baseName = path_1.default.basename(fileUrl || '');
            const candidates = [
                path_1.default.resolve(process.cwd(), 'uploads', baseName),
                path_1.default.resolve(__dirname, '../../uploads', baseName),
                path_1.default.resolve(__dirname, '../../../uploads', baseName)
            ];
            const filePath = candidates.find((candidate) => fs_1.default.existsSync(candidate));
            if (!filePath)
                return '';
            const buffer = fs_1.default.readFileSync(filePath);
            if (typeof PDFParse !== 'function')
                return '';
            const parser = new PDFParse({ data: buffer });
            const data = yield parser.getText();
            yield parser.destroy();
            return ((data === null || data === void 0 ? void 0 : data.text) || '').trim();
        }
        catch (_a) {
            return ''; // gracefully degrade if pdf-parse fails
        }
    });
}
function debugLog(...args) {
    if (ATS_DEBUG)
        console.log('[ATS_DEBUG]', ...args);
}
// POST /api/ats/score
// Body: { resumeId: string, jobId: string }
const scoreHandler = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { resumeId, jobId } = req.body;
        if (!resumeId || !jobId) {
            res.status(400).json({ success: false, message: 'resumeId and jobId are required' });
            return;
        }
        // Validate ownership
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Student profile not found' });
            return;
        }
        const resume = yield prisma.resume.findFirst({ where: { id: resumeId, studentId: student.id } });
        if (!resume) {
            res.status(404).json({ success: false, message: 'Resume not found' });
            return;
        }
        const job = yield prisma.job.findUnique({ where: { id: jobId } });
        if (!job) {
            res.status(404).json({ success: false, message: 'Job not found' });
            return;
        }
        // Extract text
        const resumeMeta = yield getResumeTextForAtsWithMeta(resume);
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
        debugLog('Resume Length:', (resumeText === null || resumeText === void 0 ? void 0 : resumeText.length) || 0);
        debugLog('JD Length:', (jobText === null || jobText === void 0 ? void 0 : jobText.length) || 0);
        const parsedResume = yield (0, atsAnalysis_service_1.parseResumeWithLlm)(resumeText);
        const result = yield (0, atsAnalysis_service_1.getATSAnalysis)(parsedResume.normalizedText, jobText);
        debugLog('ATS Output:', result);
        // If application already exists, update its ATS fields
        yield prisma.jobApplication.updateMany({
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
                strengths: (_b = result.strengths) !== null && _b !== void 0 ? _b : [],
                suggestions: result.suggestions || [],
                engine: result.provider,
                llmModel: result.provider === 'llm' ? result.model : undefined,
                parserModel: parsedResume.model,
                resumeTextSource: resumeMeta.source,
                resumeTextLength: resumeMeta.length,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.scoreHandler = scoreHandler;
// POST /api/ats/score-absolute
// Body: { resumeId: string } — resume-only ATS readiness (0–100), no job description
const absoluteScoreHandler = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { resumeId } = req.body;
        if (!resumeId) {
            res.status(400).json({ success: false, message: 'resumeId is required' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Student profile not found' });
            return;
        }
        const resume = yield prisma.resume.findFirst({ where: { id: resumeId, studentId: student.id } });
        if (!resume) {
            res.status(404).json({ success: false, message: 'Resume not found' });
            return;
        }
        const resumeMeta = yield getResumeTextForAtsWithMeta(resume);
        const resumeText = resumeMeta.text;
        debugLog('Absolute ATS resume preview:', (resumeText || '').slice(0, 120));
        if (!resumeText || resumeText.trim().length < MIN_RESUME_TEXT_LENGTH) {
            res.status(400).json({
                success: false,
                message: 'Uploaded resume PDF could not be parsed. Please upload a text-based PDF.',
            });
            return;
        }
        const parsedResume = yield (0, atsAnalysis_service_1.parseResumeWithLlm)(resumeText);
        const result = yield (0, atsAnalysis_service_1.getAbsoluteResumeAnalysis)(parsedResume.normalizedText);
        debugLog('Absolute ATS output:', result);
        res.json({
            success: true,
            data: {
                resumeId: resume.id,
                score: result.score,
                explanation: result.explanation,
                strengths: (_b = result.strengths) !== null && _b !== void 0 ? _b : [],
                suggestions: result.suggestions || [],
                engine: result.provider,
                llmModel: result.provider === 'llm' ? result.model : undefined,
                parserModel: parsedResume.model,
                resumeTextSource: resumeMeta.source,
                resumeTextLength: resumeMeta.length,
                analysisType: 'absolute',
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.absoluteScoreHandler = absoluteScoreHandler;
// POST /api/ats/batch-score
// Body: { jobId, resumeIds: string[] } → returns array of { resumeId, score, explanation }
const batchScoreHandler = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false });
            return;
        }
        const { jobId, resumeIds } = req.body;
        if (!jobId || !Array.isArray(resumeIds) || resumeIds.length === 0) {
            res.status(400).json({ success: false, message: 'jobId and resumeIds[] are required' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false });
            return;
        }
        const job = yield prisma.job.findUnique({ where: { id: jobId } });
        if (!job) {
            res.status(404).json({ success: false });
            return;
        }
        const resumes = yield prisma.resume.findMany({
            where: { id: { in: resumeIds }, studentId: student.id },
        });
        const jobText = `${job.role}\n${job.description}`;
        const results = yield Promise.all(resumes.map((r) => __awaiter(void 0, void 0, void 0, function* () {
            const resumeText = yield getResumeTextForAts(r);
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
            const parsedResume = yield (0, atsAnalysis_service_1.parseResumeWithLlm)(resumeText);
            const scored = yield (0, atsAnalysis_service_1.getATSAnalysis)(parsedResume.normalizedText, jobText);
            return Object.assign({ resumeId: r.id, roleName: r.roleName }, scored);
        })));
        // Mark highest scorer as "recommended"
        const maxScore = results.length ? Math.max(...results.map(r => r.score)) : 0;
        const withRecommendation = results.map(r => (Object.assign(Object.assign({}, r), { recommended: r.score === maxScore && maxScore > 0 })));
        res.json({ success: true, data: withRecommendation });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.batchScoreHandler = batchScoreHandler;
// GET /api/ats/config
const getConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let setting = yield prisma.systemSetting.findUnique({ where: { key: 'ATS_WEIGHTS' } });
        if (!setting) {
            // Fresher-friendly defaults: high weight on skills + projects, minimal on experience
            const defaultWeights = {
                skillsMatch: 0.40,
                projects: 0.30,
                certifications: 0.15,
                tools: 0.10,
                experience: 0.05
            };
            setting = yield prisma.systemSetting.create({
                data: { key: 'ATS_WEIGHTS', value: JSON.stringify(defaultWeights) }
            });
        }
        res.json({ success: true, data: JSON.parse(setting.value) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch ATS config' });
    }
});
exports.getConfig = getConfig;
// PUT /api/ats/config
// Body: { skillsMatch: number, experience: number, projects: number, certifications: number, tools: number }
const updateConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const weights = req.body;
        // Basic validation: sum should be close to 1.0
        const values = Object.values(weights);
        if (values.some(v => typeof v !== 'number' || v < 0 || v > 1)) {
            res.status(400).json({ success: false, message: 'Invalid weight format. Expected numbers between 0 and 1.' });
            return;
        }
        const sum = values.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1.0) > 0.01) {
            res.status(400).json({ success: false, message: `Weights must sum to approximately 1.0 (current sum: ${sum.toFixed(2)})` });
            return;
        }
        const setting = yield prisma.systemSetting.upsert({
            where: { key: 'ATS_WEIGHTS' },
            create: { key: 'ATS_WEIGHTS', value: JSON.stringify(weights) },
            update: { value: JSON.stringify(weights) }
        });
        res.json({ success: true, message: 'ATS weights updated successfully', data: JSON.parse(setting.value) });
    }
    catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update ATS config' });
    }
});
exports.updateConfig = updateConfig;
