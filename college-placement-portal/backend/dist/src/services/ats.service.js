"use strict";
/**
 * ATS (Applicant Tracking Score) Service
 * ----------------------------------------
 * Toggle via ATS_ENGINE env var:
 *   - "openai"  → Embeddings cosine similarity (OpenAI or OpenRouter-compatible base URL)
 *   - "sbert"   → Local keyword-match stub (works offline / in tests)
 *
 * Fresher-friendly weighting:
 *   Skills 40% | Projects 30% | Certifications 15% | Tools 10% | Experience 5%
 */
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
exports.scoreResume = scoreResume;
const openai_1 = __importDefault(require("openai"));
const client_1 = require("@prisma/client");
const env_1 = require("../utils/env");
function createEmbeddingClient() {
    const apiKey = (0, env_1.getOpenAiApiKey)() || '';
    const baseURL = (0, env_1.getAtsLlmBaseUrl)();
    const opts = { apiKey };
    if (baseURL)
        opts.baseURL = baseURL;
    if (baseURL === null || baseURL === void 0 ? void 0 : baseURL.includes('openrouter.ai')) {
        opts.defaultHeaders = {
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || process.env.PORT_UI_URL || 'http://localhost:3000',
            'X-Title': 'College Placement Portal',
        };
    }
    return new openai_1.default(opts);
}
/** OpenAI direct: text-embedding-3-small; OpenRouter: openai/text-embedding-3-small */
function getEmbeddingModelName() {
    const explicit = (0, env_1.normalizeEnvKey)(process.env.ATS_EMBEDDING_MODEL);
    if (explicit)
        return explicit;
    const base = (0, env_1.getAtsLlmBaseUrl)() || '';
    const key = (0, env_1.getOpenAiApiKey)();
    if (base.includes('openrouter.ai') || (key === null || key === void 0 ? void 0 : key.startsWith('sk-or-v1-'))) {
        return 'openai/text-embedding-3-small';
    }
    return 'text-embedding-3-small';
}
const prisma = new client_1.PrismaClient();
// ─── Keyword lists for fresher weighting categories ───────────────────────────
const SKILL_KEYWORDS = [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'kotlin',
    'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring',
    'sql', 'nosql', 'mongodb', 'postgresql', 'redis', 'graphql', 'rest', 'api',
    'machine learning', 'deep learning', 'nlp', 'computer vision', 'pandas', 'numpy', 'tensorflow',
];
const PROJECT_KEYWORDS = [
    'project', 'built', 'developed', 'created', 'implemented', 'designed', 'architected',
    'open source', 'github', 'portfolio', 'hackathon', 'capstone', 'thesis',
];
const CERT_KEYWORDS = [
    'certified', 'certification', 'aws', 'azure', 'gcp', 'google cloud', 'coursera', 'udemy',
    'hackerrank', 'leetcode', 'credential', 'badge', 'nptel',
];
const TOOL_KEYWORDS = [
    'git', 'docker', 'kubernetes', 'jenkins', 'ci/cd', 'linux', 'bash', 'jira',
    'postman', 'figma', 'vs code', 'intellij', 'webpack', 'vite',
];
const EXPERIENCE_KEYWORDS = [
    'internship', 'intern', 'experience', 'worked', 'employed', 'industry', 'company',
    'full-time', 'part-time', 'freelance', 'startup',
];
const SKILL_DICTIONARY = [
    'java', 'javascript', 'typescript', 'python', 'react', 'node', 'express', 'sql',
    'mongodb', 'postgresql', 'docker', 'kubernetes', 'aws', 'azure', 'gcp',
    'spring', 'django', 'flask', 'redis', 'graphql', 'rest', 'git'
];
// ─── Helpers ──────────────────────────────────────────────────────────────────
function isAtsDebugEnabled() {
    return String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';
}
function atsDebugLog(...args) {
    if (isAtsDebugEnabled()) {
        console.log('[ATS_DEBUG]', ...args);
    }
}
function preprocessText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s\+\#\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function tokenize(text) {
    const normalized = preprocessText(text);
    return normalized.split(' ').filter(Boolean);
}
function keywordHitRate(tokens, keywords) {
    const matched = keywords.filter(kw => tokens.some(t => t.includes(kw.toLowerCase()) || kw.toLowerCase().includes(t)));
    return matched.length / Math.max(keywords.length, 1);
}
function fetchDynamicWeights() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const setting = yield prisma.systemSetting.findUnique({ where: { key: 'ATS_WEIGHTS' } });
            if (setting)
                return JSON.parse(setting.value);
        }
        catch (_a) {
            // use default
        }
        return { skillsMatch: 0.4, projects: 0.3, certifications: 0.15, tools: 0.1, experience: 0.05 };
    });
}
function extractSkills(text) {
    const normalized = preprocessText(text);
    return SKILL_DICTIONARY.filter((skill) => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(normalized);
    });
}
function computeSkillScore(resumeText, jobText) {
    const resumeSkills = new Set(extractSkills(resumeText));
    const jobSkills = new Set(extractSkills(jobText));
    const matched = [...jobSkills].filter((skill) => resumeSkills.has(skill));
    const missing = [...jobSkills].filter((skill) => !resumeSkills.has(skill));
    const totalJobSkills = Math.max(jobSkills.size, 1);
    const score = Math.round((matched.length / totalJobSkills) * 100);
    return { score, matched, missing };
}
function computeWeightedScore(resumeTokens, jobTokens) {
    return __awaiter(this, void 0, void 0, function* () {
        const combined = [...resumeTokens, ...jobTokens];
        const w = yield fetchDynamicWeights();
        const weights = [
            [SKILL_KEYWORDS, w.skillsMatch || 0.40, []],
            [PROJECT_KEYWORDS, w.projects || 0.30, []],
            [CERT_KEYWORDS, w.certifications || 0.15, []],
            [TOOL_KEYWORDS, w.tools || 0.10, []],
            [EXPERIENCE_KEYWORDS, w.experience || 0.05, []],
        ];
        let totalScore = 0;
        const allMatched = [];
        for (const [keywords, weight] of weights) {
            const resumeHit = keywordHitRate(resumeTokens, keywords);
            const jobHit = keywordHitRate(jobTokens, keywords);
            // Score high if resume matches what job requires
            const categoryScore = jobHit > 0 ? Math.min(resumeHit / jobHit, 1.0) : resumeHit;
            totalScore += categoryScore * weight;
            // Collect matched keywords
            const matched = keywords.filter(kw => resumeTokens.some(t => t.includes(kw.toLowerCase())) &&
                jobTokens.some(t => t.includes(kw.toLowerCase())));
            allMatched.push(...matched);
        }
        return { score: Math.round(totalScore * 100), matched: [...new Set(allMatched)] };
    });
}
// ─── SBERT stub (offline-safe) ────────────────────────────────────────────────
function sbertScore(resumeText, jobText) {
    return __awaiter(this, void 0, void 0, function* () {
        const preprocessedResume = preprocessText(resumeText);
        const preprocessedJob = preprocessText(jobText);
        const resumeTokens = tokenize(preprocessedResume);
        const jobTokens = tokenize(preprocessedJob);
        const { score, matched } = yield computeWeightedScore(resumeTokens, jobTokens);
        const { score: skillScore, matched: skillsMatched, missing: skillsMissing } = computeSkillScore(preprocessedResume, preprocessedJob);
        const semanticScore = score;
        const finalScore = Math.round(0.6 * semanticScore + 0.4 * skillScore);
        const explanation = skillsMatched.length > 0
            ? `Semantic: ${semanticScore}%. Skill overlap: ${skillScore}%. Matched: ${skillsMatched.slice(0, 5).join(', ')}.`
            : 'Low keyword overlap detected. Consider tailoring your resume to match the job description more closely.';
        atsDebugLog('Resume Text:', preprocessedResume.slice(0, 100));
        atsDebugLog('Job Desc:', preprocessedJob.slice(0, 100));
        atsDebugLog('Similarity:', semanticScore);
        atsDebugLog('Skill Score:', skillScore);
        return {
            score: finalScore,
            matchScore: finalScore,
            semanticScore,
            skillScore,
            explanation,
            matchedKeywords: matched,
            skillsMatched,
            skillsMissing,
            suggestions: []
        };
    });
}
// ─── OpenAI embedding path ────────────────────────────────────────────────────
function openaiScore(resumeText, jobText) {
    return __awaiter(this, void 0, void 0, function* () {
        const openai = createEmbeddingClient();
        const embeddingModel = getEmbeddingModelName();
        const preprocessedResume = preprocessText(resumeText);
        const preprocessedJob = preprocessText(jobText);
        const [resumeEmbed, jobEmbed] = yield Promise.all([
            openai.embeddings.create({ model: embeddingModel, input: preprocessedResume.slice(0, 8000) }),
            openai.embeddings.create({ model: embeddingModel, input: preprocessedJob.slice(0, 8000) }),
        ]);
        const a = resumeEmbed.data[0].embedding;
        const b = jobEmbed.data[0].embedding;
        atsDebugLog('Embedding Length:', a === null || a === void 0 ? void 0 : a.length);
        if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
            throw new Error('Invalid embedding vectors for ATS similarity calculation');
        }
        // Cosine similarity
        const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
        const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
        const denominator = magA * magB;
        const similarity = denominator === 0 ? 0 : dot / denominator;
        if (!Number.isFinite(similarity)) {
            throw new Error('Cosine similarity produced invalid value');
        }
        const semanticScore = Math.round(Math.min(Math.max(similarity, 0), 1) * 100);
        const { score: keywordScore, matched } = yield computeWeightedScore(tokenize(preprocessedResume), tokenize(preprocessedJob));
        const { score: skillScore, matched: skillsMatched, missing: skillsMissing } = computeSkillScore(preprocessedResume, preprocessedJob);
        const blendedSemantic = Math.round((semanticScore + keywordScore) / 2);
        const finalScore = Math.round(0.6 * blendedSemantic + 0.4 * skillScore);
        const explanation = matched.length > 0 || skillsMatched.length > 0
            ? `Semantic: ${blendedSemantic}%. Skill overlap: ${skillScore}%. Matched: ${(skillsMatched.length ? skillsMatched : matched).slice(0, 5).join(', ')}.`
            : `Semantic similarity score: ${blendedSemantic}%. No strong skill overlaps found.`;
        atsDebugLog('Resume Text:', preprocessedResume.slice(0, 100));
        atsDebugLog('Job Desc:', preprocessedJob.slice(0, 100));
        atsDebugLog('Similarity:', similarity);
        return {
            score: finalScore,
            matchScore: finalScore,
            semanticScore: blendedSemantic,
            skillScore,
            explanation,
            matchedKeywords: matched,
            skillsMatched,
            skillsMissing,
            suggestions: []
        };
    });
}
// ─── Public API ───────────────────────────────────────────────────────────────
function scoreResume(resumeText, jobText) {
    return __awaiter(this, void 0, void 0, function* () {
        const processedResume = preprocessText(resumeText);
        const processedJob = preprocessText(jobText);
        const engine = (process.env.ATS_ENGINE || 'sbert').toLowerCase();
        if (engine === 'openai' && (0, env_1.getOpenAiApiKey)()) {
            try {
                return yield openaiScore(processedResume, processedJob);
            }
            catch (err) {
                console.warn('[ATS] OpenAI scoring failed, falling back to SBERT stub:', err.message);
            }
        }
        // Default: SBERT stub (synchronous, offline-safe)
        return yield sbertScore(processedResume, processedJob);
    });
}
