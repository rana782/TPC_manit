/**
 * Verify login -> student resume upload -> ATS score-absolute.
 * Set VERIFY_EMAIL, VERIFY_PASSWORD; argv[2] = PDF path.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const API = process.env.VERIFY_API_URL || 'http://127.0.0.1:5001';
const email = process.env.VERIFY_EMAIL;
const password = process.env.VERIFY_PASSWORD;
const pdfPath = process.argv[2];

if (!email || !password || !pdfPath) {
    console.error('Set VERIFY_EMAIL, VERIFY_PASSWORD and pass PDF path as argv[2]');
    process.exit(1);
}
if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(1);
}

async function main() {
    if (String(process.env.VERIFY_RUN_SEED || '').toLowerCase() === 'true') {
        const seed = await fetch(`${API}/api/seed/seed-ui`);
        console.log('seed-ui', seed.status, seed.ok ? 'ok' : await seed.text());
    }

    const health = await fetch(`${API}/api/health`);
    const healthJson = await health.json().catch(() => ({}));
    console.log('health', health.status, healthJson?.data?.atsLlmConfigured ? 'ats_llm=yes' : 'ats_llm=no');

    const loginRes = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const loginJson = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok || !loginJson.token) {
        console.error('Login failed', loginRes.status, loginJson.message || loginJson);
        process.exit(1);
    }
    const token = loginJson.token;
    console.log('login ok role=', loginJson.user?.role);

    const buf = fs.readFileSync(pdfPath);
    const fd = new FormData();
    const file = new File([buf], path.basename(pdfPath), { type: 'application/pdf' });
    fd.append('resume', file);
    fd.append('roleName', 'ATS verify');

    const up = await fetch(`${API}/api/student/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    const upJson = await up.json().catch(() => ({}));
    if (!up.ok || !upJson.success) {
        console.error('Upload failed', up.status, upJson.message || upJson);
        process.exit(1);
    }
    const resumeId = upJson.data?.id;
    console.log('upload ok resumeId=', resumeId, 'extractedText_len=', (upJson.data?.extractedText || '').length);

    const scoreRes = await fetch(`${API}/api/ats/score-absolute`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resumeId }),
    });
    const scoreJson = await scoreRes.json().catch(() => ({}));
    if (!scoreRes.ok || !scoreJson.success) {
        console.error('score-absolute failed', scoreRes.status, scoreJson.message || scoreJson);
        process.exit(1);
    }
    const d = scoreJson.data || {};
    console.log('ATS absolute:', {
        score: d.score,
        engine: d.engine,
        llmModel: d.llmModel,
        resumeTextSource: d.resumeTextSource,
        strengthsCount: (d.strengths || []).length,
        suggestionsCount: (d.suggestions || []).length,
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
