const [apiBase, webBase] = process.argv.slice(2);

if (!apiBase) {
    console.error('Usage: node scripts/post-deploy-check.mjs <apiBaseUrl> [webBaseUrl]');
    process.exit(1);
}

async function check(url, label) {
    const started = Date.now();
    try {
        const res = await fetch(url, { method: 'GET' });
        const ms = Date.now() - started;
        const text = await res.text();
        console.log(`${label}: ${res.status} (${ms}ms) -> ${url}`);
        if (!res.ok) {
            console.log(text.slice(0, 400));
            return false;
        }
        if (text.trim()) console.log(text.slice(0, 400));
        return true;
    } catch (err) {
        console.log(`${label}: FAILED -> ${url}`);
        console.log(String(err));
        return false;
    }
}

const normalizedApi = apiBase.replace(/\/+$/, '');
const apiOk = await check(`${normalizedApi}/api/health`, 'API health');
const apiRoutesOk = await check(`${normalizedApi}/api/jobs`, 'API route sample');

let webOk = true;
if (webBase) {
    const normalizedWeb = webBase.replace(/\/+$/, '');
    webOk = await check(normalizedWeb, 'Frontend home');
}

if (apiOk && apiRoutesOk && webOk) {
    console.log('Deployment smoke checks passed.');
    process.exit(0);
}

console.log('Deployment smoke checks found issues.');
process.exit(2);
