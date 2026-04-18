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

import OpenAI from 'openai';
import { getAtsLlmBaseUrl, getOpenAiApiKey, normalizeEnvKey } from '../utils/env';
import prisma from '../lib/prisma';

function createEmbeddingClient(): OpenAI {
    const apiKey = getOpenAiApiKey() || '';
    const baseURL = getAtsLlmBaseUrl();
    const opts: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
    if (baseURL) opts.baseURL = baseURL;
    if (baseURL?.includes('openrouter.ai')) {
        opts.defaultHeaders = {
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || process.env.PORT_UI_URL || 'http://localhost:3000',
            'X-Title': 'College Placement Portal',
        };
    }
    return new OpenAI(opts);
}

/** OpenAI direct: text-embedding-3-small; OpenRouter: openai/text-embedding-3-small */
function getEmbeddingModelName(): string {
    const explicit = normalizeEnvKey(process.env.ATS_EMBEDDING_MODEL);
    if (explicit) return explicit;
    const base = getAtsLlmBaseUrl() || '';
    const key = getOpenAiApiKey();
    if (base.includes('openrouter.ai') || key?.startsWith('sk-or-v1-')) {
        return 'openai/text-embedding-3-small';
    }
    return 'text-embedding-3-small';
}


export interface AtsResult {
    score: number;             // Backward-compatible ATS score
    matchScore: number;        // New alias for API consumers
    semanticScore: number;     // Semantic similarity contribution (0-100)
    skillScore: number;        // Skill overlap contribution (0-100)
    explanation: string;       // Human-readable match summary
    matchedKeywords: string[]; // Backward-compatible keyword list
    skillsMatched: string[];
    skillsMissing: string[];
    suggestions?: string[];
    strengths?: string[];
}

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
function isAtsDebugEnabled(): boolean {
    return String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';
}

function atsDebugLog(...args: unknown[]) {
    if (isAtsDebugEnabled()) {
        console.log('[ATS_DEBUG]', ...args);
    }
}

function preprocessText(text: string): string {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s\+\#\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text: string): string[] {
    const normalized = preprocessText(text);
    return normalized.split(' ').filter(Boolean);
}

function keywordHitRate(tokens: string[], keywords: string[]): number {
    const matched = keywords.filter(kw => tokens.some(t => t.includes(kw.toLowerCase()) || kw.toLowerCase().includes(t)));
    return matched.length / Math.max(keywords.length, 1);
}

async function fetchDynamicWeights() {
    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: 'ATS_WEIGHTS' } });
        if (setting) return JSON.parse(setting.value);
    } catch {
        // use default
    }
    return { skillsMatch: 0.4, projects: 0.3, certifications: 0.15, tools: 0.1, experience: 0.05 };
}

function extractSkills(text: string): string[] {
    const normalized = preprocessText(text);
    return SKILL_DICTIONARY.filter((skill) => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(normalized);
    });
}

function computeSkillScore(resumeText: string, jobText: string): { score: number; matched: string[]; missing: string[] } {
    const resumeSkills = new Set(extractSkills(resumeText));
    const jobSkills = new Set(extractSkills(jobText));
    const matched = [...jobSkills].filter((skill) => resumeSkills.has(skill));
    const missing = [...jobSkills].filter((skill) => !resumeSkills.has(skill));
    const totalJobSkills = Math.max(jobSkills.size, 1);
    const score = Math.round((matched.length / totalJobSkills) * 100);
    return { score, matched, missing };
}

async function computeWeightedScore(resumeTokens: string[], jobTokens: string[]): Promise<{ score: number; matched: string[] }> {
    const combined = [...resumeTokens, ...jobTokens];
    const w = await fetchDynamicWeights();

    const weights: [string[], number, string[]][] = [
        [SKILL_KEYWORDS, w.skillsMatch || 0.40, []],
        [PROJECT_KEYWORDS, w.projects || 0.30, []],
        [CERT_KEYWORDS, w.certifications || 0.15, []],
        [TOOL_KEYWORDS, w.tools || 0.10, []],
        [EXPERIENCE_KEYWORDS, w.experience || 0.05, []],
    ];

    let totalScore = 0;
    const allMatched: string[] = [];

    for (const [keywords, weight] of weights) {
        const resumeHit = keywordHitRate(resumeTokens, keywords);
        const jobHit = keywordHitRate(jobTokens, keywords);
        // Score high if resume matches what job requires
        const categoryScore = jobHit > 0 ? Math.min(resumeHit / jobHit, 1.0) : resumeHit;
        totalScore += categoryScore * weight;

        // Collect matched keywords
        const matched = keywords.filter(kw =>
            resumeTokens.some(t => t.includes(kw.toLowerCase())) &&
            jobTokens.some(t => t.includes(kw.toLowerCase()))
        );
        allMatched.push(...matched);
    }

    return { score: Math.round(totalScore * 100), matched: [...new Set(allMatched)] };
}

// ─── SBERT stub (offline-safe) ────────────────────────────────────────────────
async function sbertScore(resumeText: string, jobText: string): Promise<AtsResult> {
    const preprocessedResume = preprocessText(resumeText);
    const preprocessedJob = preprocessText(jobText);
    const resumeTokens = tokenize(preprocessedResume);
    const jobTokens = tokenize(preprocessedJob);
    const { score, matched } = await computeWeightedScore(resumeTokens, jobTokens);
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
}

// ─── OpenAI embedding path ────────────────────────────────────────────────────
async function openaiScore(resumeText: string, jobText: string): Promise<AtsResult> {
    const openai = createEmbeddingClient();
    const embeddingModel = getEmbeddingModelName();
    const preprocessedResume = preprocessText(resumeText);
    const preprocessedJob = preprocessText(jobText);

    const [resumeEmbed, jobEmbed] = await Promise.all([
        openai.embeddings.create({ model: embeddingModel, input: preprocessedResume.slice(0, 8000) }),
        openai.embeddings.create({ model: embeddingModel, input: preprocessedJob.slice(0, 8000) }),
    ]);

    const a = resumeEmbed.data[0].embedding;
    const b = jobEmbed.data[0].embedding;
    atsDebugLog('Embedding Length:', a?.length);

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
    const { score: keywordScore, matched } = await computeWeightedScore(tokenize(preprocessedResume), tokenize(preprocessedJob));
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
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function scoreResume(resumeText: string, jobText: string): Promise<AtsResult> {
    const processedResume = preprocessText(resumeText);
    const processedJob = preprocessText(jobText);
    const engine = (process.env.ATS_ENGINE || 'sbert').toLowerCase();

    if (engine === 'openai' && getOpenAiApiKey()) {
        try {
            return await openaiScore(processedResume, processedJob);
        } catch (err) {
            console.warn('[ATS] OpenAI scoring failed, falling back to SBERT stub:', (err as Error).message);
        }
    }

    // Default: SBERT stub (synchronous, offline-safe)
    return await sbertScore(processedResume, processedJob);
}
