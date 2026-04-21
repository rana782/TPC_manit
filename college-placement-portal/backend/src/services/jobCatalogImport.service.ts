import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { PrismaClient } from '@prisma/client';

type RawRow = Record<string, string | undefined>;

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_SOURCE = 'job_descriptions_csv';
const DEFAULT_MAX_ROWS = 200000;
const DB_RETRY_ATTEMPTS = 5;
const DB_RETRY_DELAY_MS = 1200;

function envFlag(name: string, fallback = false): boolean {
    const raw = process.env[name];
    if (!raw) return fallback;
    const v = raw.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function toCleanString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const out = value.replace(/\s+/g, ' ').trim();
    return out.length > 0 ? out : null;
}

function normalizeSkillToken(token: string): string {
    const t = token.trim().toLowerCase();
    if (!t) return '';
    const compact = t.replace(/\s+/g, ' ');
    const alias: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        nodejs: 'node',
        'node.js': 'node',
        postgre: 'postgresql',
        postgres: 'postgresql',
        ml: 'machine learning',
        ai: 'artificial intelligence',
        py: 'python',
    };
    return alias[compact] || compact;
}

function parseSkills(value: string | null): string[] {
    if (!value) return [];
    const parts = value
        .split(/[,;|/]/g)
        .map((p) => normalizeSkillToken(p))
        .filter(Boolean);
    return [...new Set(parts)];
}

function parseCompanySize(value: string | null): number | null {
    if (!value) return null;
    const n = Number(value.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
}

function parseExperienceRange(value: string | null): { min: number | null; max: number | null } {
    if (!value) return { min: null, max: null };
    const lower = value.toLowerCase();
    const nums = (lower.match(/\d+/g) || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return { min: null, max: null };

    if (lower.includes('fresher') || lower.includes('entry') || lower.includes('intern')) {
        return { min: 0, max: 1 };
    }
    if (nums.length === 1) {
        if (lower.includes('+')) return { min: nums[0], max: null };
        return { min: nums[0], max: nums[0] };
    }
    return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

function inferCompanySector(row: RawRow): string | null {
    const profile = toCleanString(row['Company Profile']) || '';
    const title = toCleanString(row['Job Title']) || '';
    const role = toCleanString(row['Role']) || '';
    const desc = toCleanString(row['Job Description']) || '';
    const text = `${profile} ${title} ${role} ${desc}`.toLowerCase();
    if (!text.trim()) return null;

    const sectorKeywords: Array<{ sector: string; keywords: string[] }> = [
        { sector: 'Information Technology', keywords: ['software', 'it services', 'tech', 'cloud', 'saas', 'developer'] },
        { sector: 'Banking and Financial Services', keywords: ['bank', 'finance', 'fintech', 'asset management', 'insurance'] },
        { sector: 'Manufacturing', keywords: ['manufacturing', 'plant', 'factory', 'industrial', 'cement', 'automotive'] },
        { sector: 'Healthcare and Pharma', keywords: ['healthcare', 'hospital', 'medical', 'pharma', 'biotech'] },
        { sector: 'Retail and E-commerce', keywords: ['retail', 'e-commerce', 'ecommerce', 'marketplace', 'consumer goods'] },
        { sector: 'Consulting and Professional Services', keywords: ['consulting', 'advisory', 'professional services'] },
        { sector: 'Telecom and Networking', keywords: ['telecom', 'network', 'communications'] },
        { sector: 'Education', keywords: ['education', 'edtech', 'university', 'learning'] },
        { sector: 'Energy and Utilities', keywords: ['energy', 'power', 'utilities', 'oil', 'gas', 'renewable'] },
    ];

    for (const entry of sectorKeywords) {
        if (entry.keywords.some((kw) => text.includes(kw))) return entry.sector;
    }
    return 'General';
}

function getBackendRoot(): string {
    return path.resolve(__dirname, '../..');
}

function resolveCsvPath(): string {
    const envPath = process.env.JOB_CATALOG_CSV_PATH?.trim();
    if (envPath) {
        const fromEnv = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
        if (fs.existsSync(fromEnv)) return fromEnv;
    }

    const backendRoot = getBackendRoot();
    const candidates = [
        path.join(backendRoot, 'data', 'job_descriptions.csv'),
        path.join(backendRoot, '..', 'job_descriptions.csv'),
        path.join(backendRoot, '..', 'job_descriptions.csv (1)', 'job_descriptions.csv'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(
        'Job catalog CSV not found. Set JOB_CATALOG_CSV_PATH or place file at backend/data/job_descriptions.csv.'
    );
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                cur += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDbRetry<T>(label: string, fn: () => Promise<T>, log: (msg: string) => void): Promise<T> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt < DB_RETRY_ATTEMPTS) {
        attempt += 1;
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt >= DB_RETRY_ATTEMPTS) break;
            log(`[importJobCatalog] ${label} failed (attempt ${attempt}/${DB_RETRY_ATTEMPTS}), retrying...`);
            await sleep(DB_RETRY_DELAY_MS * attempt);
        }
    }
    throw lastErr;
}

function rowToCreateInput(row: RawRow, rowNum: number) {
    const externalJobId = toCleanString(row['Job Id']);
    const company = toCleanString(row['Company']) || 'Unknown Company';
    const role = toCleanString(row['Role']) || toCleanString(row['Job Title']) || 'Unknown Role';
    const jobTitle = toCleanString(row['Job Title']);
    const skillsText = toCleanString(row['skills']);
    const experienceText = toCleanString(row['Experience']);
    const exp = parseExperienceRange(experienceText);
    const sourceKey = `${externalJobId || `row-${rowNum}`}-${company.toLowerCase()}-${role.toLowerCase()}`.slice(0, 190);

    return {
        sourceKey,
        externalJobId,
        company,
        role,
        jobTitle,
        skillsText,
        skillsArr: parseSkills(skillsText),
        jobDescription: toCleanString(row['Job Description']),
        responsibilities: toCleanString(row['Responsibilities']),
        experienceText,
        minExperience: exp.min,
        maxExperience: exp.max,
        workType: toCleanString(row['Work Type']),
        location: toCleanString(row['location']),
        country: toCleanString(row['Country']),
        salaryRange: toCleanString(row['Salary Range']),
        preference: toCleanString(row['Preference']),
        companySize: parseCompanySize(toCleanString(row['Company Size'])),
        benefitsText: toCleanString(row['Benefits']),
        companyProfileText: toCleanString(row['Company Profile']),
        companySector: inferCompanySector(row),
        source: DEFAULT_SOURCE,
    };
}

export async function importJobCatalogCsv(
    prisma: PrismaClient,
    log: (msg: string) => void = (msg) => console.log(msg)
): Promise<{ imported: number; skipped: number; csvPath: string }> {
    const db = prisma as any;
    const csvPath = resolveCsvPath();
    const maxRowsRaw = Number(process.env.JOB_CATALOG_MAX_ROWS || DEFAULT_MAX_ROWS);
    const maxRows = Number.isFinite(maxRowsRaw) && maxRowsRaw > 0 ? Math.floor(maxRowsRaw) : DEFAULT_MAX_ROWS;
    const clearBeforeImport = envFlag('JOB_CATALOG_CLEAR_BEFORE_IMPORT', false);
    log(`[importJobCatalog] loading ${csvPath}`);
    log(`[importJobCatalog] maxRows=${maxRows}`);
    log(`[importJobCatalog] clearBeforeImport=${clearBeforeImport}`);

    if (clearBeforeImport) {
        await withDbRetry('clear JobCatalog', () => db.jobCatalog.deleteMany({}), log);
    }

    let batch: ReturnType<typeof rowToCreateInput>[] = [];
    let parsed = 0;
    let skipped = 0;
    let rowNum = 1;

    const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers: string[] | null = null;
    for await (const rawLine of rl) {
        if (parsed >= maxRows) break;
        const line = rawLine.replace(/\uFEFF/g, '');
        if (!line.trim()) continue;
        rowNum += 1;
        if (!headers) {
            headers = parseCsvLine(line);
            continue;
        }

        const values = parseCsvLine(line);
        const raw: RawRow = {};
        for (let i = 0; i < headers.length; i += 1) {
            raw[headers[i]!] = values[i];
        }

        try {
            const out = rowToCreateInput(raw, rowNum);
            if (!out.company || !out.role) {
                skipped += 1;
                continue;
            }
            batch.push(out);
            parsed += 1;
            if (batch.length >= DEFAULT_BATCH_SIZE) {
                await withDbRetry(
                    `createMany batch parsed=${parsed}`,
                    () =>
                        db.jobCatalog.createMany({
                            data: batch,
                            skipDuplicates: true,
                        }),
                    log
                );
                if (parsed % 5000 === 0) {
                    log(`[importJobCatalog] processed=${parsed} skipped=${skipped}`);
                }
                batch = [];
            }
        } catch {
            skipped += 1;
        }
    }

    if (batch.length > 0) {
        await withDbRetry(
            `createMany final parsed=${parsed}`,
            () =>
                db.jobCatalog.createMany({
                    data: batch,
                    skipDuplicates: true,
                }),
            log
        );
    }

    if (parsed === 0) {
        return { imported: 0, skipped, csvPath };
    }

    log(`[importJobCatalog] parsed=${parsed} skipped=${skipped}`);

    const imported = Number(await withDbRetry('count JobCatalog', () => db.jobCatalog.count(), log));
    log(`[importJobCatalog] imported=${imported}`);
    return { imported, skipped, csvPath };
}
