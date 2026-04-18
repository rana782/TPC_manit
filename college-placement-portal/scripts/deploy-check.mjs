import fs from 'fs';
import path from 'path';

const root = process.cwd();
const backendEnvPath = path.join(root, 'backend', '.env');
const frontendEnvPath = path.join(root, 'frontend', '.env');

function parseEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx < 0) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function isMissing(v) {
    return v == null || String(v).trim() === '';
}

const backend = parseEnv(backendEnvPath);
const frontend = parseEnv(frontendEnvPath);

const backendRequired = ['DATABASE_URL', 'JWT_SECRET'];
const frontendRequired = ['VITE_API_URL'];

const backendMissing = backendRequired.filter((k) => isMissing(backend[k]));
const frontendMissing = frontendRequired.filter((k) => isMissing(frontend[k]));

const apiUrl = frontend.VITE_API_URL || '';
const likelyRenderApi = /^https?:\/\/[^/]+onrender\.com\/?$/i.test(apiUrl);

console.log('=== TPC Deployment Preflight ===');
console.log(`Backend env file : ${fs.existsSync(backendEnvPath) ? 'found' : 'missing'} (${backendEnvPath})`);
console.log(`Frontend env file: ${fs.existsSync(frontendEnvPath) ? 'found' : 'missing'} (${frontendEnvPath})`);
console.log('');

if (backendMissing.length === 0 && frontendMissing.length === 0) {
    console.log('OK: Required variables are present.');
} else {
    console.log('Missing required variables:');
    if (backendMissing.length) console.log(`- backend/.env: ${backendMissing.join(', ')}`);
    if (frontendMissing.length) console.log(`- frontend/.env: ${frontendMissing.join(', ')}`);
}

console.log('');
console.log('Recommended production toggles (backend):');
console.log(`- AUTO_BASELINE_SEED=${backend.AUTO_BASELINE_SEED || 'false'}  (should be false for production)`);
console.log(
    `- SKIP_AUTO_COMPANY_IMPORT=${backend.SKIP_AUTO_COMPANY_IMPORT || 'true'}  (true unless you want auto-import)`
);
console.log(`- NOTIFICATIONS_ENABLED=${backend.NOTIFICATIONS_ENABLED || 'false'}`);
console.log(`- ZAPIER_ENABLED=${backend.ZAPIER_ENABLED || 'false'}`);
console.log('');

if (!isMissing(apiUrl)) {
    console.log(`Frontend API URL: ${apiUrl}`);
    if (!likelyRenderApi) {
        console.log('NOTE: VITE_API_URL should usually point to your Render backend URL.');
    }
}

const hasFailures = backendMissing.length > 0 || frontendMissing.length > 0;
process.exitCode = hasFailures ? 1 : 0;
