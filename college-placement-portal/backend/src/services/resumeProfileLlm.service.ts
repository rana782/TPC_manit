import OpenAI from 'openai';
import { getAtsChatModelCandidates, getAtsLlmApiKeyCandidates, getAtsLlmBaseUrl } from '../utils/env';

type ResumeLlmProfile = {
    skills: string[];
    projects: string[];
    targetRoles: string[];
    summary: string;
    provider: 'llm' | 'fallback';
    model?: string;
};

type CacheEntry = {
    expiresAt: number;
    profile: ResumeLlmProfile;
};

const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
const PROFILE_TIMEOUT_MS = Number(process.env.RECOMMEND_LLM_TIMEOUT_MS || 6500);
const profileCache = new Map<string, CacheEntry>();

const SKILL_ALIASES: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    nodejs: 'node',
    'node.js': 'node',
    postgres: 'postgresql',
    postgre: 'postgresql',
    py: 'python',
    ml: 'machine learning',
};

function normalizeSkill(token: string): string {
    const t = token.trim().toLowerCase().replace(/\s+/g, ' ');
    return SKILL_ALIASES[t] || t;
}

function flattenTextValues(input: unknown, out: string[] = []): string[] {
    if (input == null) return out;
    if (typeof input === 'string') {
        out.push(input);
        return out;
    }
    if (Array.isArray(input)) {
        for (const item of input) flattenTextValues(item, out);
        return out;
    }
    if (typeof input === 'object') {
        for (const value of Object.values(input as Record<string, unknown>)) {
            flattenTextValues(value, out);
        }
    }
    return out;
}

function normalizeArray(input: unknown, limit = 25, normalize = false): string[] {
    if (!Array.isArray(input)) return [];
    const out: string[] = [];
    for (const v of input) {
        const s = String(v || '').trim();
        if (!s) continue;
        const n = normalize ? normalizeSkill(s) : s;
        if (!n) continue;
        if (!out.includes(n)) out.push(n);
        if (out.length >= limit) break;
    }
    return out;
}

function parseModelJson(raw: string): any | null {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(trimmed.slice(start, end + 1));
            } catch {
                return null;
            }
        }
        return null;
    }
}

function buildPrompt(text: string, roleHint?: string | null): string {
    return `You are an expert resume profiler for job recommendation.
Extract precise, normalized profile signals from the resume text.
Return ONLY valid JSON with this exact schema:
{
  "skills": string[],
  "projects": string[],
  "targetRoles": string[],
  "summary": string
}

Rules:
- Keep skills technical and normalized (e.g., javascript, react, node, sql, machine learning).
- targetRoles must be realistic job roles inferred from projects + skills.
- Do not invent facts not present in resume text.
- Use concise items, max 25 skills, max 8 projects, max 8 targetRoles.
- Output JSON only, no markdown.

Role hint from user/resume (if any): ${roleHint || 'none'}

Resume text:
${text}`;
}

function extractCompletionText(completion: OpenAI.Chat.Completions.ChatCompletion): string {
    const msg = completion.choices?.[0]?.message as any;
    if (!msg) return '';
    const c = msg.content;
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (Array.isArray(c)) {
        return c
            .map((part: unknown) => {
                if (typeof part === 'string') return part;
                const p = part as { type?: string; text?: string };
                return p?.type === 'text' && p.text ? p.text : '';
            })
            .join('')
            .trim();
    }
    return '';
}

function createClient(apiKey: string): OpenAI {
    const configuredBase = getAtsLlmBaseUrl();
    const keyLooksOpenRouter = apiKey.startsWith('sk-or-v1-');
    const baseURL =
        !keyLooksOpenRouter && configuredBase?.includes('openrouter.ai')
            ? undefined
            : configuredBase;
    const usingOpenRouter = keyLooksOpenRouter || baseURL?.includes('openrouter.ai') === true;
    const opts: ConstructorParameters<typeof OpenAI>[0] = {
        apiKey,
        timeout: PROFILE_TIMEOUT_MS,
    };
    if (baseURL) opts.baseURL = baseURL;
    if (usingOpenRouter) {
        const referer = process.env.OPENROUTER_HTTP_REFERER || process.env.PORT_UI_URL || 'http://localhost:3000';
        opts.defaultHeaders = {
            'HTTP-Referer': referer,
            'X-Title': 'College Placement Portal',
        };
    }
    return new OpenAI(opts);
}

function fallbackProfile(heuristicSkills: string[], heuristicRoles: string[]): ResumeLlmProfile {
    return {
        skills: heuristicSkills.slice(0, 25),
        projects: [],
        targetRoles: heuristicRoles.slice(0, 8),
        summary: '',
        provider: 'fallback',
    };
}

async function analyzeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('resume profile timeout')), timeoutMs);
        promise
            .then((res) => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

export async function getResumeLlmProfile(params: {
    cacheKey: string;
    extractedJson: unknown;
    extractedText: string | null;
    roleHint?: string | null;
    heuristicSkills: string[];
    heuristicRoles: string[];
}): Promise<ResumeLlmProfile> {
    const cached = profileCache.get(params.cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.profile;

    const fallback = fallbackProfile(params.heuristicSkills, params.heuristicRoles);
    const apiKeys = getAtsLlmApiKeyCandidates();
    if (apiKeys.length === 0) {
        profileCache.set(params.cacheKey, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, profile: fallback });
        return fallback;
    }

    const blobs = flattenTextValues(params.extractedJson);
    if (params.extractedText) blobs.push(params.extractedText);
    const text = blobs.join('\n').replace(/\s+/g, ' ').slice(0, 14000).trim();
    if (!text) {
        profileCache.set(params.cacheKey, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, profile: fallback });
        return fallback;
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: 'You are a strict JSON extractor. Return only one JSON object.',
        },
        { role: 'user', content: buildPrompt(text, params.roleHint) },
    ];

    for (const apiKey of apiKeys) {
        const client = createClient(apiKey);
        const models = getAtsChatModelCandidates();
        for (const model of models) {
            try {
                const completion = await analyzeWithTimeout(
                    client.chat.completions.create({ model, messages, temperature: 0.1, max_tokens: 600 }),
                    PROFILE_TIMEOUT_MS
                );
                const parsed = parseModelJson(extractCompletionText(completion));
                const skills = normalizeArray(parsed?.skills, 25, true);
                const projects = normalizeArray(parsed?.projects, 8, false);
                const targetRoles = normalizeArray(parsed?.targetRoles, 8, false);
                const summary = String(parsed?.summary || '').trim().slice(0, 400);
                if (skills.length === 0 && targetRoles.length === 0) continue;

                const profile: ResumeLlmProfile = {
                    skills: skills.length ? skills : fallback.skills,
                    projects,
                    targetRoles: targetRoles.length ? targetRoles : fallback.targetRoles,
                    summary,
                    provider: 'llm',
                    model,
                };
                profileCache.set(params.cacheKey, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, profile });
                return profile;
            } catch {
                // Try next model/key quickly; fallback at the end.
            }
        }
    }

    profileCache.set(params.cacheKey, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, profile: fallback });
    return fallback;
}
