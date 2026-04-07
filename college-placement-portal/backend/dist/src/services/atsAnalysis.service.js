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
exports.parseResumeWithLlm = parseResumeWithLlm;
exports.getAbsoluteResumeAnalysis = getAbsoluteResumeAnalysis;
exports.getATSAnalysis = getATSAnalysis;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../utils/env");
const ATS_DEBUG = String(process.env.ATS_DEBUG || '').toLowerCase() === 'true';
const ATS_TIMEOUT_MS = Number(process.env.ATS_TIMEOUT_MS || 12000);
/** OpenRouter + Qwen is slower; allow override via ATS_TIMEOUT_MS. */
const OPENROUTER_MIN_TIMEOUT_MS = 60000;
const FRESHER_ABSOLUTE_WEIGHTS = {
    projects: 0.32,
    education: 0.20,
    experienceInternship: 0.18,
    skills: 0.18,
    coCurricular: 0.07,
    parseability: 0.05,
};
/** Keep scores in a hireable band (avoid negative UX from sub-60 scores). */
function clampScoreHireable(value) {
    const num = Number(value);
    if (!Number.isFinite(num))
        return 70;
    const rounded = Math.round(num);
    return Math.min(95, Math.max(60, rounded));
}
function clampAbsoluteScore(value) {
    const num = Number(value);
    // Fresher-first UX: avoid harshly low absolute ATS scores.
    if (!Number.isFinite(num))
        return 68;
    const rounded = Math.round(num);
    return Math.min(95, Math.max(55, rounded));
}
function toStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 20);
}
function normalizeSuggestionWithExample(s) {
    const text = String(s || '').trim();
    if (!text)
        return '';
    const hasCorrection = /correction\s*:|fix\s*:|change\s*:|replace\s*:/i.test(text);
    const hasExample = /example\s*:/i.test(text);
    if (hasCorrection && hasExample)
        return text;
    return `Correction: ${text} Example: Rewrite one resume line with concrete impact, e.g. "Built placement portal in React + Node; reduced application processing time by 30%."`;
}
function enforceSuggestionFormat(items) {
    return items
        .map(normalizeSuggestionWithExample)
        .filter(Boolean)
        .slice(0, 5);
}
function buildPrompt(resumeText, jobDescription) {
    return `You are an ATS system.
Compare the following resume and job description.
Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "matchScore": number,
  "semanticScore": number,
  "skillScore": number,
  "matchedSkills": string[],
  "missingSkills": string[],
  "strengths": string[],
  "suggestions": string[]
}

STRICT rules:
- matchScore, semanticScore, and skillScore MUST each be integers between 60 and 95 inclusive (realistic, constructive band).
- strengths: 2–5 short positive observations about the resume vs the role.
- suggestions: 2–5 explicit corrections. Each suggestion MUST include:
  1) what is wrong/missing,
  2) what exact correction to make,
  3) one concrete example line the candidate can directly use.
  Suggested format for each item:
  "Issue: ... | Correction: ... | Example: ..."
- Do not include markdown or text outside the JSON object.

Resume:
${resumeText}

Job Description:
${jobDescription}
`;
}
function buildAbsolutePrompt(resumeText) {
    return `You are an ATS (applicant tracking system) expert.
Evaluate ONLY the resume text below for overall ATS readiness and document quality.
Do NOT compare this resume to any job description or role — the score must reflect the resume alone.

This candidate is a FRESHER. Evaluate with fresher-appropriate weighting:
- Projects: 32%
- Education: 20%
- Internship/Experience: 18% (do NOT over-penalize if full-time experience is missing)
- Skills/Keywords: 18%
- Co-curricular/leadership/achievements: 7%
- Parseability/format quality: 5%

Consider: parseability (clear sections, standard headings), quantified impact, skills and keywords, length and density, spelling/clarity, and whether content would index well in typical ATS software.

Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "projectsScore": number,
  "educationScore": number,
  "experienceInternshipScore": number,
  "skillsScore": number,
  "coCurricularScore": number,
  "parseabilityScore": number,
  "atsScore": number,
  "strengths": string[],
  "suggestions": string[]
}

STRICT rules:
- Each component score MUST be an integer from 0 to 100.
- atsScore MUST be an integer from 55 to 95 unless the resume is severely incomplete/unreadable.
- strengths: 2–5 short positives about the resume itself.
- suggestions: 2–5 explicit corrections for ATS and clarity (do not mention a specific job or JD).
  Each suggestion MUST include:
  1) what is wrong/missing,
  2) what exact correction to make,
  3) one concrete example line the candidate can directly use.
  Suggested format for each item:
  "Issue: ... | Correction: ... | Example: ..."
- Do not include markdown or text outside the JSON object.

Resume text:
${resumeText}
`;
}
function buildResumeParsePrompt(resumeText) {
    return `You are a resume parser for ATS scoring.
Extract and normalize this resume into structured JSON for a FRESHER candidate.
Do NOT invent facts and do NOT compare against any job description.

Return ONLY valid JSON with this exact structure:
{
  "education": string[],
  "projects": string[],
  "experienceInternships": string[],
  "skills": string[],
  "coCurricular": string[],
  "certifications": string[],
  "summary": string
}

Rules:
- Keep each array item concise and factual.
- Include empty arrays when a section is missing.
- "summary" must be 1-3 short lines combining the candidate's strongest factual points.
- Output JSON only.

Resume text:
${resumeText}
`;
}
function normalizeParsedResumeForAts(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return null;
    const asList = (value) => Array.isArray(value)
        ? value.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20)
        : [];
    const education = asList(parsed.education);
    const projects = asList(parsed.projects);
    const experienceInternships = asList(parsed.experienceInternships);
    const skills = asList(parsed.skills);
    const coCurricular = asList(parsed.coCurricular);
    const certifications = asList(parsed.certifications);
    const summary = String(parsed.summary || '').trim();
    const lines = [];
    if (summary)
        lines.push(`Summary: ${summary}`);
    if (education.length)
        lines.push(`Education: ${education.join(' | ')}`);
    if (projects.length)
        lines.push(`Projects: ${projects.join(' | ')}`);
    if (experienceInternships.length)
        lines.push(`Experience/Internships: ${experienceInternships.join(' | ')}`);
    if (skills.length)
        lines.push(`Skills: ${skills.join(' | ')}`);
    if (coCurricular.length)
        lines.push(`Co-curricular: ${coCurricular.join(' | ')}`);
    if (certifications.length)
        lines.push(`Certifications: ${certifications.join(' | ')}`);
    const out = lines.join('\n').trim();
    return out.length > 0 ? out : null;
}
function clamp01To100(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
}
function getComponentScore(parsed, keys) {
    for (const k of keys) {
        const v = parsed === null || parsed === void 0 ? void 0 : parsed[k];
        if (v !== undefined && v !== null && Number.isFinite(Number(v))) {
            return clamp01To100(v);
        }
    }
    return null;
}
function computeFresherWeightedAbsolute(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return null;
    const projects = getComponentScore(parsed, ['projectsScore', 'projectScore']);
    const education = getComponentScore(parsed, ['educationScore', 'academicsScore']);
    const experienceInternship = getComponentScore(parsed, ['experienceInternshipScore', 'experienceScore', 'internshipScore']);
    const skills = getComponentScore(parsed, ['skillsScore', 'skillScore']);
    const coCurricular = getComponentScore(parsed, ['coCurricularScore', 'cocurricularScore', 'activitiesScore']);
    const parseability = getComponentScore(parsed, ['parseabilityScore', 'formatScore', 'readabilityScore']);
    const hasAll = projects !== null &&
        education !== null &&
        experienceInternship !== null &&
        skills !== null &&
        coCurricular !== null &&
        parseability !== null;
    if (!hasAll)
        return null;
    const weighted = projects * FRESHER_ABSOLUTE_WEIGHTS.projects +
        education * FRESHER_ABSOLUTE_WEIGHTS.education +
        experienceInternship * FRESHER_ABSOLUTE_WEIGHTS.experienceInternship +
        skills * FRESHER_ABSOLUTE_WEIGHTS.skills +
        coCurricular * FRESHER_ABSOLUTE_WEIGHTS.coCurricular +
        parseability * FRESHER_ABSOLUTE_WEIGHTS.parseability;
    return Math.round(weighted);
}
function parseModelJson(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed)
        return null;
    const normalizeJsonish = (input) => {
        let t = input.trim();
        t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        // Quote bare keys: { score: 70 } -> { "score": 70 }
        t = t.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
        // Remove trailing commas
        t = t.replace(/,\s*([}\]])/g, '$1');
        return t;
    };
    try {
        return JSON.parse(trimmed);
    }
    catch (_a) {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            }
            catch (_b) {
                const start = trimmed.indexOf('{');
                const end = trimmed.lastIndexOf('}');
                if (start >= 0 && end > start) {
                    try {
                        return JSON.parse(trimmed.slice(start, end + 1));
                    }
                    catch (_c) {
                        try {
                            return JSON.parse(normalizeJsonish(trimmed.slice(start, end + 1)));
                        }
                        catch (_d) {
                            return null;
                        }
                    }
                }
            }
        }
        try {
            return JSON.parse(normalizeJsonish(trimmed));
        }
        catch (_e) {
            return null;
        }
        return null;
    }
}
function resultFromParsed(parsed) {
    if (!parsed)
        return null;
    const matchScore = clampScoreHireable(parsed.matchScore);
    const semanticScore = clampScoreHireable(parsed.semanticScore);
    const skillScore = clampScoreHireable(parsed.skillScore);
    const skillsMatched = toStringArray(parsed.matchedSkills);
    const skillsMissing = toStringArray(parsed.missingSkills);
    let strengths = toStringArray(parsed.strengths);
    let suggestions = toStringArray(parsed.suggestions);
    if (strengths.length === 0)
        strengths = ['Relevant skills and content identified in your resume'];
    if (suggestions.length === 0) {
        suggestions = [
            'Issue: Resume bullets are generic. | Correction: Align bullets with JD keywords and measurable outcomes. | Example: "Implemented REST APIs in Node.js used by 3 modules, reducing response time by 28%."',
        ];
    }
    suggestions = enforceSuggestionFormat(suggestions);
    const explanation = `Semantic: ${semanticScore}%. Skill overlap: ${skillScore}%.`;
    return {
        score: matchScore,
        matchScore,
        semanticScore,
        skillScore,
        explanation,
        matchedKeywords: [...skillsMatched],
        skillsMatched,
        skillsMissing,
        strengths,
        suggestions,
        provider: 'llm',
    };
}
function absoluteFromParsed(parsed) {
    if (!parsed)
        return null;
    const weighted = computeFresherWeightedAbsolute(parsed);
    const score = clampAbsoluteScore(weighted !== null && weighted !== void 0 ? weighted : parsed.atsScore);
    let strengths = toStringArray(parsed.strengths);
    let suggestions = toStringArray(parsed.suggestions);
    if (strengths.length === 0)
        strengths = ['Content is present and can be refined for ATS parsers'];
    if (suggestions.length === 0) {
        suggestions = [
            'Issue: Sections are not ATS-friendly. | Correction: Use standard headings and a skills block. | Example: "TECHNICAL SKILLS: Java, Python, SQL, React, Node.js".',
            'Issue: Project bullets lack impact metrics. | Correction: Add quantified outcomes. | Example: "Built attendance app for 120 students; reduced manual tracking effort by 40%."',
        ];
    }
    suggestions = enforceSuggestionFormat(suggestions);
    const explanation = `Standalone ATS readiness (fresher-weighted): ${score}/100.`;
    return { score, strengths, suggestions, explanation, provider: 'llm' };
}
function buildFallbackAbsoluteAts(reason) {
    const hint = reason ? ` (${reason})` : '';
    return {
        score: 70,
        strengths: ['Resume structure is acceptable', 'Core information can be strengthened for ATS parsers'],
        suggestions: ['Use standard section headings', 'Ensure the PDF uses selectable text', 'Add quantified bullets where possible'],
        explanation: `Estimated standalone ATS score — analysis used a fallback${hint}.`,
        provider: 'fallback',
    };
}
function buildFallbackAts(reason) {
    const hint = reason ? ` (${reason})` : '';
    return {
        score: 70,
        matchScore: 70,
        semanticScore: 70,
        skillScore: 70,
        explanation: `Estimated compatibility — ATS analysis used a fallback${hint}.`,
        matchedKeywords: [],
        skillsMatched: [],
        skillsMissing: [],
        strengths: ['Resume structure is acceptable', 'Profile details can be expanded for stronger matching'],
        suggestions: ['Add more projects aligned with your target role', 'Ensure your resume PDF uses selectable text for best parsing'],
        provider: 'fallback',
    };
}
function getLlmFailureReason(err) {
    var _a, _b;
    const e = err;
    const status = Number(e === null || e === void 0 ? void 0 : e.status);
    const code = String((e === null || e === void 0 ? void 0 : e.code) || ((_a = e === null || e === void 0 ? void 0 : e.error) === null || _a === void 0 ? void 0 : _a.code) || '').toLowerCase();
    const type = String((e === null || e === void 0 ? void 0 : e.type) || ((_b = e === null || e === void 0 ? void 0 : e.error) === null || _b === void 0 ? void 0 : _b.type) || '').toLowerCase();
    const msg = String((e === null || e === void 0 ? void 0 : e.message) || '').toLowerCase();
    if (status === 401 || code === 'invalid_api_key' || msg.includes('invalid api key')) {
        return 'invalid API key';
    }
    if (status === 429 && (code === 'insufficient_quota' || type === 'insufficient_quota' || msg.includes('quota'))) {
        return 'LLM provider quota exceeded';
    }
    if (status === 429) {
        return 'LLM provider rate limited';
    }
    if (status === 403) {
        return 'LLM request forbidden';
    }
    if (status === 400) {
        return 'LLM request rejected';
    }
    if (status >= 500 && status < 600) {
        return 'LLM provider service error';
    }
    return 'LLM request failed';
}
function createAtsLlmClient() {
    const apiKey = (0, env_1.getOpenAiApiKey)() || '';
    const baseURL = (0, env_1.getAtsLlmBaseUrl)();
    const timeoutMs = (0, env_1.isAtsUsingOpenRouter)() ? Math.max(ATS_TIMEOUT_MS, OPENROUTER_MIN_TIMEOUT_MS) : ATS_TIMEOUT_MS;
    const opts = {
        apiKey,
        timeout: timeoutMs,
    };
    if (baseURL) {
        opts.baseURL = baseURL;
    }
    if (baseURL === null || baseURL === void 0 ? void 0 : baseURL.includes('openrouter.ai')) {
        const referer = process.env.OPENROUTER_HTTP_REFERER || process.env.PORT_UI_URL || 'http://localhost:3000';
        opts.defaultHeaders = {
            'HTTP-Referer': referer,
            'X-Title': 'College Placement Portal',
        };
    }
    return new openai_1.default(opts);
}
/** Pull text from chat completion (handles string, content parts, some reasoning fields). */
function extractCompletionText(completion) {
    var _a, _b;
    const msg = (_b = (_a = completion.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message;
    if (!msg)
        return '';
    const c = msg.content;
    if (typeof c === 'string' && c.trim())
        return c.trim();
    if (Array.isArray(c)) {
        const joined = c
            .map((part) => {
            if (typeof part === 'string')
                return part;
            const p = part;
            if ((p === null || p === void 0 ? void 0 : p.type) === 'text' && p.text)
                return p.text;
            return '';
        })
            .join('');
        if (joined.trim())
            return joined.trim();
    }
    if (typeof msg.reasoning === 'string' && msg.reasoning.trim())
        return msg.reasoning.trim();
    return '';
}
/**
 * OpenRouter + Qwen: do NOT use response_format json_object by default — many models return empty
 * content or invalid JSON when forced. We rely on the prompt + parseModelJson instead.
 * Direct OpenAI: optional json_object (ATS_JSON_RESPONSE_FORMAT=true by default).
 */
function chatCompletionWithJsonRetry(client, args) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const baseArgs = Object.assign(Object.assign({}, args), { max_tokens: (_a = args.max_tokens) !== null && _a !== void 0 ? _a : 4096 });
        if ((0, env_1.isAtsUsingOpenRouter)()) {
            if (ATS_DEBUG) {
                // eslint-disable-next-line no-console
                console.log('[ATS] OpenRouter/Qwen chat.completions (no response_format json_object)', {
                    model: baseArgs.model,
                });
            }
            return client.chat.completions.create(baseArgs);
        }
        const allowJson = String(process.env.ATS_JSON_RESPONSE_FORMAT || 'true').toLowerCase() !== 'false';
        if (allowJson) {
            try {
                return yield client.chat.completions.create(Object.assign(Object.assign({}, baseArgs), { response_format: { type: 'json_object' } }));
            }
            catch (err) {
                const status = Number(err === null || err === void 0 ? void 0 : err.status);
                if (status === 400) {
                    if (ATS_DEBUG)
                        console.warn('[ATS] JSON response_format rejected; retrying without it');
                    return client.chat.completions.create(baseArgs);
                }
                throw err;
            }
        }
        return client.chat.completions.create(baseArgs);
    });
}
function warnAts(msg, err) {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test')
        return;
    if (err !== undefined) {
        // eslint-disable-next-line no-console
        console.warn('[ATS]', msg, err);
        return;
    }
    // eslint-disable-next-line no-console
    console.warn('[ATS]', msg);
}
function shouldTryNextModel(err) {
    const status = Number(err === null || err === void 0 ? void 0 : err.status);
    // Model unavailable, quota, rate-limit, or temporary upstream issues.
    return [402, 404, 408, 409, 429, 502, 503, 504].includes(status);
}
function analyzeWithOpenAI(resumeText, jobText) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiKey = (0, env_1.getOpenAiApiKey)();
        if (!apiKey) {
            warnAts('Qwen/OpenRouter not called: set ATS_LLM_API_KEY (or OPENROUTER_API_KEY) in backend/.env and restart.');
            return buildFallbackAts('ATS_LLM / OPENAI API key not set');
        }
        const openai = createAtsLlmClient();
        const prompt = buildPrompt(resumeText, jobText);
        const messages = [
            {
                role: 'system',
                content: 'You output only one JSON object matching the user schema. No markdown. All keys must be present as in the user prompt.',
            },
            { role: 'user', content: prompt },
        ];
        const candidates = (0, env_1.getAtsChatModelCandidates)();
        let lastErr;
        for (const model of candidates) {
            try {
                const completion = yield chatCompletionWithJsonRetry(openai, { model, messages, temperature: 0.2 });
                const raw = extractCompletionText(completion);
                const parsed = parseModelJson(raw);
                const out = resultFromParsed(parsed);
                if (!out) {
                    warnAts(`model returned non-JSON, trying next: ${model}`);
                    continue;
                }
                out.model = model;
                return out;
            }
            catch (err) {
                lastErr = err;
                if (shouldTryNextModel(err)) {
                    warnAts(`model failed, trying next: ${model}`, err);
                    continue;
                }
                throw err;
            }
        }
        if (lastErr)
            throw lastErr;
        return buildFallbackAts('invalid JSON from LLM');
    });
}
/** Parse uploaded resume text via LLM before ATS scoring. */
function parseResumeWithLlm(resumeText) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiKey = (0, env_1.getOpenAiApiKey)();
        if (!apiKey) {
            throw new Error('ATS_LLM API key not set');
        }
        const openai = createAtsLlmClient();
        const prompt = buildResumeParsePrompt(resumeText);
        const messages = [
            {
                role: 'system',
                content: 'You are a strict JSON resume parser for ATS processing. Return only one JSON object and no markdown.',
            },
            { role: 'user', content: prompt },
        ];
        const candidates = (0, env_1.getAtsChatModelCandidates)();
        let lastErr;
        for (const model of candidates) {
            try {
                const completion = yield chatCompletionWithJsonRetry(openai, { model, messages, temperature: 0.1 });
                const raw = extractCompletionText(completion);
                const parsed = parseModelJson(raw);
                const normalized = normalizeParsedResumeForAts(parsed);
                if (!normalized) {
                    warnAts(`resume parser returned invalid JSON, trying next: ${model}`);
                    continue;
                }
                return { normalizedText: normalized, model };
            }
            catch (err) {
                lastErr = err;
                if (shouldTryNextModel(err)) {
                    warnAts(`resume parser model failed, trying next: ${model}`, err);
                    continue;
                }
                throw err;
            }
        }
        throw lastErr || new Error('Resume parsing via LLM failed');
    });
}
function analyzeAbsoluteWithOpenAI(resumeText) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiKey = (0, env_1.getOpenAiApiKey)();
        if (!apiKey) {
            warnAts('Qwen/OpenRouter not called: set ATS_LLM_API_KEY (or OPENROUTER_API_KEY) in backend/.env and restart.');
            return buildFallbackAbsoluteAts('ATS_LLM / OPENAI API key not set');
        }
        const openai = createAtsLlmClient();
        const prompt = buildAbsolutePrompt(resumeText);
        const messages = [
            {
                role: 'system',
                content: 'You output only one JSON object matching the user schema. No markdown. Evaluate the resume alone — never compare to a job description.',
            },
            { role: 'user', content: prompt },
        ];
        const candidates = (0, env_1.getAtsChatModelCandidates)();
        let lastErr;
        for (const model of candidates) {
            try {
                const completion = yield chatCompletionWithJsonRetry(openai, { model, messages, temperature: 0.2 });
                const raw = extractCompletionText(completion);
                const parsed = parseModelJson(raw);
                const out = absoluteFromParsed(parsed);
                if (!out) {
                    warnAts(`absolute model returned non-JSON, trying next: ${model}`);
                    continue;
                }
                out.model = model;
                return out;
            }
            catch (err) {
                lastErr = err;
                if (shouldTryNextModel(err)) {
                    warnAts(`absolute model failed, trying next: ${model}`, err);
                    continue;
                }
                throw err;
            }
        }
        if (lastErr)
            throw lastErr;
        return buildFallbackAbsoluteAts('invalid JSON from LLM');
    });
}
/** Resume-only absolute ATS readiness (0–100). No job description. */
function getAbsoluteResumeAnalysis(resumeText) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(resumeText === null || resumeText === void 0 ? void 0 : resumeText.trim())) {
            return buildFallbackAbsoluteAts('missing resume text');
        }
        try {
            return yield analyzeAbsoluteWithOpenAI(resumeText);
        }
        catch (err) {
            warnAts('LLM request failed (absolute):', err);
            return buildFallbackAbsoluteAts(getLlmFailureReason(err));
        }
    });
}
/** Resume vs job ATS scoring via OpenAI-compatible Chat Completions (JSON). Falls back if key missing or request fails. */
function getATSAnalysis(resumeText, jobText) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(resumeText === null || resumeText === void 0 ? void 0 : resumeText.trim()) || !(jobText === null || jobText === void 0 ? void 0 : jobText.trim())) {
            return buildFallbackAts('missing resume or job text');
        }
        try {
            return yield analyzeWithOpenAI(resumeText, jobText);
        }
        catch (err) {
            warnAts('LLM request failed (resume vs job):', err);
            return buildFallbackAts(getLlmFailureReason(err));
        }
    });
}
