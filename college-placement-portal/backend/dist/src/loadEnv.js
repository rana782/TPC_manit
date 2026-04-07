"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Must be imported before any other application modules so API keys and DB URLs exist.
 * Uses override: true in a fixed order so backend/.env wins over a parent-folder .env (e.g. empty keys).
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
function uniqueEnvPathsInLoadOrder() {
    const ordered = [
        path_1.default.join(process.cwd(), '.env'),
        path_1.default.join(process.cwd(), 'backend', '.env'),
        path_1.default.resolve(__dirname, '../.env'),
    ];
    const seen = new Set();
    const out = [];
    for (const p of ordered) {
        const norm = path_1.default.normalize(path_1.default.resolve(p));
        if (seen.has(norm))
            continue;
        seen.add(norm);
        out.push(norm);
    }
    return out;
}
function loadDotenvFiles() {
    for (const p of uniqueEnvPathsInLoadOrder()) {
        if (fs_1.default.existsSync(p)) {
            dotenv_1.default.config({ path: p, override: true });
        }
    }
}
/**
 * Last resort if dotenv skipped a line (encoding/BOM/long lines).
 */
function manualInjectLlmKeys() {
    const hasAts = process.env.ATS_LLM_API_KEY != null && String(process.env.ATS_LLM_API_KEY).trim().length > 0;
    const hasOpenAi = process.env.OPENAI_API_KEY != null && String(process.env.OPENAI_API_KEY).trim().length > 0;
    if (hasAts || hasOpenAi)
        return;
    for (const varName of ['ATS_LLM_API_KEY', 'OPENAI_API_KEY']) {
        for (const p of uniqueEnvPathsInLoadOrder()) {
            if (!fs_1.default.existsSync(p))
                continue;
            let file = fs_1.default.readFileSync(p, 'utf8');
            file = file.replace(/^\uFEFF/, '');
            for (const line of file.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;
                const m = trimmed.match(new RegExp(`^${varName}\\s*=\\s*(.*)$`));
                if (!m)
                    continue;
                let v = m[1].trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                    v = v.slice(1, -1);
                }
                if (v.length > 0) {
                    process.env[varName] = v;
                    return;
                }
            }
        }
    }
}
loadDotenvFiles();
manualInjectLlmKeys();
const hasLlmKey = Boolean((process.env.ATS_LLM_API_KEY && String(process.env.ATS_LLM_API_KEY).trim().length > 0) ||
    (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length > 0));
if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(`[loadEnv] ATS/LLM API key=${hasLlmKey ? 'present' : 'missing'}`);
}
