/**
 * Must be imported before any other application modules so API keys and DB URLs exist.
 * Uses override: true in a fixed order so backend/.env wins over a parent-folder .env (e.g. empty keys).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const originalProcessSecrets = {
    ATS_LLM_API_KEY: process.env.ATS_LLM_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function uniqueEnvPathsInLoadOrder(): string[] {
    const ordered = [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), 'backend', '.env'),
        path.resolve(__dirname, '../.env'),
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of ordered) {
        const norm = path.normalize(path.resolve(p));
        if (seen.has(norm)) continue;
        seen.add(norm);
        out.push(norm);
    }
    return out;
}

function loadDotenvFiles(): void {
    for (const p of uniqueEnvPathsInLoadOrder()) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p, override: true });
        }
    }
}

/**
 * Last resort if dotenv skipped a line (encoding/BOM/long lines).
 */
function manualInjectLlmKeys(): void {
    const hasAts = process.env.ATS_LLM_API_KEY != null && String(process.env.ATS_LLM_API_KEY).trim().length > 0;
    const hasOpenAi = process.env.OPENAI_API_KEY != null && String(process.env.OPENAI_API_KEY).trim().length > 0;
    if (hasAts || hasOpenAi) return;

    for (const varName of ['ATS_LLM_API_KEY', 'OPENAI_API_KEY'] as const) {
        for (const p of uniqueEnvPathsInLoadOrder()) {
            if (!fs.existsSync(p)) continue;
            let file = fs.readFileSync(p, 'utf8');
            file = file.replace(/^\uFEFF/, '');
            for (const line of file.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const m = trimmed.match(new RegExp(`^${varName}\\s*=\\s*(.*)$`));
                if (!m) continue;
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

// Preserve explicitly provided process secrets (e.g. shell/CI/system env),
// even though dotenv loads files with override=true.
for (const [k, v] of Object.entries(originalProcessSecrets)) {
    if (typeof v === 'string' && v.trim().length > 0) {
        process.env[k] = v;
    }
}

manualInjectLlmKeys();

const hasLlmKey = Boolean(
    (process.env.ATS_LLM_API_KEY && String(process.env.ATS_LLM_API_KEY).trim().length > 0) ||
        (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim().length > 0)
);
if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(`[loadEnv] ATS/LLM API key=${hasLlmKey ? 'present' : 'missing'}`);
}
