"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEnvKey = normalizeEnvKey;
exports.getOpenAiApiKey = getOpenAiApiKey;
exports.getAtsLlmApiKey = getAtsLlmApiKey;
exports.getAtsLlmBaseUrl = getAtsLlmBaseUrl;
exports.isAtsUsingOpenRouter = isAtsUsingOpenRouter;
exports.getAtsChatModel = getAtsChatModel;
exports.getAtsChatModelCandidates = getAtsChatModelCandidates;
/**
 * Normalize a secret from process.env (trim, strip BOM, strip wrapping quotes).
 */
function normalizeEnvKey(raw) {
    if (raw == null || typeof raw !== 'string')
        return undefined;
    const t = raw.replace(/^\uFEFF/, '').trim().replace(/^["']|["']$/g, '');
    return t.length > 0 ? t : undefined;
}
/**
 * API key for ATS LLM (OpenRouter + Qwen, OpenAI, or compatible). Priority:
 *   ATS_LLM_API_KEY → OPENROUTER_API_KEY → OPENAI_API_KEY
 * OpenRouter keys often start with `sk-or-v1-`.
 */
function getOpenAiApiKey() {
    return getAtsLlmApiKey();
}
/** Preferred name — same as getOpenAiApiKey (legacy alias). */
function getAtsLlmApiKey() {
    return (normalizeEnvKey(process.env.ATS_LLM_API_KEY) ||
        normalizeEnvKey(process.env.OPENROUTER_API_KEY) ||
        normalizeEnvKey(process.env.OPENAI_API_KEY));
}
/** OpenAI-compatible base URL (e.g. https://openrouter.ai/api/v1). Omit for api.openai.com. */
function getAtsLlmBaseUrl() {
    const explicit = normalizeEnvKey(process.env.ATS_LLM_BASE_URL) || normalizeEnvKey(process.env.OPENAI_API_BASE_URL);
    if (explicit)
        return explicit;
    const key = getAtsLlmApiKey();
    if (key === null || key === void 0 ? void 0 : key.startsWith('sk-or-v1-')) {
        return 'https://openrouter.ai/api/v1';
    }
    return undefined;
}
/** True when ATS chat/embeddings should use OpenRouter (Qwen, etc.), not api.openai.com. */
function isAtsUsingOpenRouter() {
    const base = getAtsLlmBaseUrl() || '';
    const key = getAtsLlmApiKey();
    return base.includes('openrouter.ai') || (key === null || key === void 0 ? void 0 : key.startsWith('sk-or-v1-')) === true;
}
/**
 * Chat model for ATS JSON analysis. Defaults to Qwen 3.6 Plus on OpenRouter; otherwise gpt-4o-mini for api.openai.com.
 */
function getAtsChatModel() {
    const explicit = normalizeEnvKey(process.env.ATS_LLM_MODEL) || normalizeEnvKey(process.env.OPENAI_ATS_MODEL);
    if (explicit)
        return explicit;
    if (isAtsUsingOpenRouter()) {
        return 'qwen/qwen3.6-plus';
    }
    return 'gpt-4o-mini';
}
/**
 * Ordered model candidates for ATS chat calls.
 * - First item is primary model.
 * - Additional items are tried on provider-side model errors/rate limits.
 * Configure extra fallbacks via ATS_LLM_MODEL_FALLBACKS (comma-separated).
 */
function getAtsChatModelCandidates() {
    const primary = getAtsChatModel();
    const fromEnv = String(process.env.ATS_LLM_MODEL_FALLBACKS || '')
        .split(',')
        .map((s) => normalizeEnvKey(s))
        .filter((s) => Boolean(s));
    const defaults = isAtsUsingOpenRouter()
        ? ['qwen/qwen3.6-plus:free', 'qwen/qwen3-30b-a3b', 'qwen/qwen3-14b', 'qwen/qwen3-8b']
        : ['gpt-4o-mini'];
    const out = [];
    for (const m of [primary, ...fromEnv, ...defaults]) {
        if (!m)
            continue;
        if (!out.includes(m))
            out.push(m);
    }
    return out;
}
