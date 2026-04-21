import prisma from '../lib/prisma';

export type CompanyRoleRecommendation = {
    company: string;
    role: string;
};

export type CompanyRoleRecommendationDetail = CompanyRoleRecommendation & {
    workType: string | null;
    jobDescription: string | null;
    responsibilities: string | null;
    benefits: string | null;
    companySector: string | null;
    experienceRequired: string;
};

/** NDJSON-friendly events for live recommendation delivery. */
export type RecommendStreamEvent =
    | { type: 'status'; phase: string; message?: string }
    | { type: 'item'; data: CompanyRoleRecommendationDetail }
    | { type: 'done'; count: number };

function flushYield(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

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

const ROLE_KEYWORDS: Record<string, string[]> = {
    'Frontend Developer': ['react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css', 'frontend'],
    'Backend Developer': ['node', 'express', 'java', 'spring', 'django', 'flask', 'api', 'backend', 'postgresql'],
    'Full Stack Developer': ['react', 'node', 'express', 'javascript', 'typescript', 'full stack', 'postgresql'],
    'Data Analyst': ['python', 'sql', 'pandas', 'power bi', 'tableau', 'analytics', 'excel'],
    'ML Engineer': ['machine learning', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'sklearn'],
    'DevOps Engineer': ['docker', 'kubernetes', 'aws', 'ci/cd', 'linux', 'jenkins', 'devops'],
};

function normalizeSkill(token: string): string {
    const t = token.trim().toLowerCase().replace(/\s+/g, ' ');
    return SKILL_ALIASES[t] || t;
}

function tokenizeSkillsFromText(text: string): string[] {
    return text
        .split(/[,;|/\n\r()]/g)
        .flatMap((s) => s.split(/\s+and\s+/i))
        .map((s) => normalizeSkill(s))
        .filter((s) => s.length >= 2);
}

const KNOWN_TECH_SKILLS = [
    'javascript', 'typescript', 'react', 'next.js', 'node', 'express', 'nestjs',
    'java', 'spring', 'python', 'django', 'flask', 'fastapi', 'c', 'c++', 'c#',
    'sql', 'mysql', 'postgresql', 'mongodb', 'redis',
    'html', 'css', 'tailwind', 'bootstrap',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'linux', 'git', 'github',
    'tensorflow', 'pytorch', 'machine learning', 'deep learning', 'nlp',
    'pandas', 'numpy', 'power bi', 'tableau', 'excel',
    'rest', 'api', 'microservices', 'graphql',
].map((s) => normalizeSkill(s));

const KNOWN_TECH_SKILL_SET = new Set(KNOWN_TECH_SKILLS);

function extractKnownSkillsFromText(text: string): string[] {
    const lower = ` ${String(text || '').toLowerCase()} `;
    const found: string[] = [];
    for (const skill of KNOWN_TECH_SKILLS) {
        const token = ` ${skill} `;
        if (lower.includes(token)) found.push(skill);
    }
    return found;
}

/** Job catalog CSV sometimes stores Python-like `{...}` strings in benefits. */
function humanizeCatalogBenefits(raw: string | null | undefined): string | null {
    const base = String(raw || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!base) return null;
    let s = base;
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        s = s.slice(1, -1).trim();
    }
    s = s.replace(/^['"]+|['"]+$/g, '').replace(/\s+/g, ' ').trim();
    return s.length > 0 ? s : null;
}

/**
 * Split one catalog `skillsArr` cell (often a long prose / comma-separated blob) into display phrases.
 */
function splitCatalogSkillBlob(cell: string): string[] {
    const s = cell.replace(/\s+/g, ' ').trim();
    if (!s) return [];

    const JOIN_NEXT_PHRASE = /\s+(?=design\b|development\b|testing\b|principles?\b|languages?\b|frameworks?\b|databases?\b|architecture\b|deployment\b|proficiency\b|collaboration\b|interaction\b|wireframing\b|prototyping\b|usability\b|responsive\b|management\b|analytics\b|migration\b|modeling\b|tuning\b|scalability\b|distributed\b|programming\b|engineering\b|interface\b|experience\b|scheduling\b|platforms?\b|advertising\b|engagement\b)/i;

    function refine(part: string): string[] {
        const p = part.replace(/\s+/g, ' ').trim();
        if (!p) return [];
        if (p.length <= 42) return [p];

        if (p.includes(',')) {
            return p
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .flatMap((x) => refine(x));
        }
        if (p.includes(' / ')) {
            return p
                .split(' / ')
                .map((x) => x.trim())
                .filter(Boolean)
                .flatMap((x) => refine(x));
        }
        if (/\s+and\s+/i.test(p)) {
            return p
                .split(/\s+and\s+/i)
                .map((x) => x.trim())
                .filter(Boolean)
                .flatMap((x) => refine(x));
        }
        const byClose = p
            .split(/\)\s+/)
            .map((x) => x.trim())
            .filter(Boolean)
            .map((x) => (x.includes('(') && !x.endsWith(')') ? `${x})` : x));
        if (byClose.length > 1) {
            return byClose.flatMap((x) => refine(x));
        }
        if (JOIN_NEXT_PHRASE.test(p)) {
            return p
                .split(JOIN_NEXT_PHRASE)
                .map((x) => x.trim())
                .filter(Boolean)
                .flatMap((x) => refine(x));
        }
        return [p];
    }

    return refine(s);
}

/**
 * Many imported rows store the whole required-skills line as one `skillsArr` cell.
 * Expand into normalized tokens so matched/missing lists are readable.
 */
function expandCatalogSkillTokens(skillsArr: string[] | null | undefined): string[] {
    const seen = new Set<string>();
    for (const cell of skillsArr || []) {
        for (const phrase of splitCatalogSkillBlob(String(cell || ''))) {
            const n = normalizeSkill(phrase);
            if (n.length >= 2 && n.length <= 120) seen.add(n);
        }
    }
    return [...seen];
}

function rowSkillSet(skillsArr: string[] | null | undefined): Set<string> {
    return new Set(expandCatalogSkillTokens(skillsArr));
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

function flattenTextValuesWithPath(
    input: unknown,
    out: Array<{ path: string; value: string }> = [],
    path = '',
): Array<{ path: string; value: string }> {
    if (input == null) return out;
    if (typeof input === 'string') {
        out.push({ path, value: input });
        return out;
    }
    if (Array.isArray(input)) {
        for (let i = 0; i < input.length; i += 1) {
            flattenTextValuesWithPath(input[i], out, `${path}[${i}]`);
        }
        return out;
    }
    if (typeof input === 'object') {
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            const nextPath = path ? `${path}.${k}` : k;
            flattenTextValuesWithPath(v, out, nextPath);
        }
    }
    return out;
}

function deriveCandidateSkills(extractedJson: unknown, extractedText: string | null): Set<string> {
    const skills = new Set<string>();
    const keyed = flattenTextValuesWithPath(extractedJson);
    for (const entry of keyed) {
        const path = entry.path.toLowerCase();
        const text = String(entry.value || '');
        const isSkillHeavy =
            path.includes('skill') ||
            path.includes('tech') ||
            path.includes('stack') ||
            path.includes('tool') ||
            path.includes('framework') ||
            path.includes('language') ||
            path.includes('project') ||
            path.includes('coursework') ||
            path.includes('course');

        for (const token of tokenizeSkillsFromText(text)) {
            if (token.length >= 2 && (isSkillHeavy || KNOWN_TECH_SKILL_SET.has(token))) {
                skills.add(token);
            }
        }
        for (const k of extractKnownSkillsFromText(text)) {
            skills.add(k);
        }
    }

    if (extractedText) {
        for (const token of tokenizeSkillsFromText(extractedText)) {
            if (token.length >= 2 && KNOWN_TECH_SKILL_SET.has(token)) skills.add(token);
        }
        for (const k of extractKnownSkillsFromText(extractedText)) {
            skills.add(k);
        }
    }
    return skills;
}

function inferRoles(skills: Set<string>, roleHint: string | null): string[] {
    const roleScores = Object.entries(ROLE_KEYWORDS).map(([role, keywords]) => {
        const hits = keywords.reduce((acc, kw) => (skills.has(kw) ? acc + 1 : acc), 0);
        return { role, hits };
    });
    roleScores.sort((a, b) => b.hits - a.hits);
    const fromSkills = roleScores.filter((r) => r.hits > 0).slice(0, 5).map((r) => r.role);
    if (!roleHint || !roleHint.trim()) return fromSkills;
    return [roleHint.trim(), ...fromSkills.filter((r) => r.toLowerCase() !== roleHint.trim().toLowerCase())].slice(0, 5);
}

function inferFresher(extractedJson: unknown, extractedText: string | null): boolean {
    const blobs = flattenTextValues(extractedJson);
    if (extractedText) blobs.push(extractedText);
    const text = blobs.join(' ').toLowerCase();
    const years = text.match(/(\d+)\s*\+?\s*(year|years|yr|yrs)/g) || [];
    if (years.length === 0) return true;
    const nums = years.map((y) => Number((y.match(/\d+/) || ['0'])[0])).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return true;
    return Math.max(...nums) <= 2;
}

function computeRoleMatch(candidateRoles: string[], rowRole: string, rowTitle: string | null): number {
    const target = `${rowRole} ${rowTitle || ''}`.toLowerCase();
    for (const role of candidateRoles) {
        const r = role.toLowerCase();
        if (target.includes(r)) return 1;
    }
    const keywordHit = candidateRoles.some((r) =>
        r
            .toLowerCase()
            .split(/\s+/)
            .some((w) => w.length > 3 && target.includes(w))
    );
    return keywordHit ? 0.65 : 0;
}

function clamp01(v: number): number {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

type JobCatalogRow = {
    company: string;
    role: string;
    jobTitle: string | null;
    skillsArr: string[];
    minExperience: number | null;
    maxExperience: number | null;
    workType: string | null;
    jobDescription: string | null;
    responsibilities: string | null;
    benefitsText: string | null;
    companySector: string | null;
};

/** Resume-scoped hot cache for faster repeated fetches. */
const RECOMMEND_CACHE_TTL_MS = 20 * 60 * 1000;
const PRIMARY_TAKE = 280;
const SECONDARY_TAKE = 180;
const FALLBACK_TAKE = 120;

const basicRecommendationCache = new Map<
    string,
    {
        expiresAt: number;
        recommendations: CompanyRoleRecommendationDetail[];
    }
>();

function experienceWhere(): Record<string, unknown> {
    return {};
}

function inferCandidateYears(extractedJson: unknown, extractedText: string | null): number {
    const blobs = flattenTextValues(extractedJson);
    if (extractedText) blobs.push(extractedText);
    const text = blobs.join(' ').toLowerCase();
    const hits = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(year|years|yr|yrs)/g) || [];
    if (hits.length === 0) return 0;
    const nums = hits
        .map((h) => Number((h.match(/\d+(?:\.\d+)?/) || ['0'])[0]))
        .filter((n) => Number.isFinite(n) && n >= 0);
    if (nums.length === 0) return 0;
    return Math.max(...nums);
}

function formatExperienceRequired(minExp: number | null, maxExp: number | null): string {
    if (minExp == null && maxExp == null) return 'Experience not specified';
    if (minExp != null && maxExp != null) {
        if (minExp === maxExp) return `${minExp} year${minExp === 1 ? '' : 's'} required`;
        return `${minExp}-${maxExp} years required`;
    }
    if (minExp != null) return `${minExp}+ years required`;
    return `Up to ${maxExp} years`;
}

function normalizeRoleKey(role: string): string {
    return role.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

type RoleCompanyCounts = { role: Map<string, number>; company: Map<string, number> };

function emptyRoleCompanyCounts(): RoleCompanyCounts {
    return { role: new Map(), company: new Map() };
}

function countsAllow(counts: RoleCompanyCounts, role: string, company: string, maxPerRole: number, maxPerCompany: number): boolean {
    if (maxPerRole >= 100 && maxPerCompany >= 100) return true;
    const rk = normalizeRoleKey(role);
    const ck = company.toLowerCase();
    const rc = counts.role.get(rk) || 0;
    const cc = counts.company.get(ck) || 0;
    if (maxPerRole < 100 && rc >= maxPerRole) return false;
    if (maxPerCompany < 100 && cc >= maxPerCompany) return false;
    return true;
}

function recordPick(counts: RoleCompanyCounts, role: string, company: string): void {
    const rk = normalizeRoleKey(role);
    const ck = company.toLowerCase();
    counts.role.set(rk, (counts.role.get(rk) || 0) + 1);
    counts.company.set(ck, (counts.company.get(ck) || 0) + 1);
}

function computeExperienceFit(candidateYears: number, fresher: boolean, minExperience: number | null, maxExperience: number | null, rowRole: string): number {
    const roleLower = rowRole.toLowerCase();
    if (fresher && (roleLower.includes('intern') || roleLower.includes('trainee') || roleLower.includes('junior'))) {
        return 1;
    }

    if (minExperience == null && maxExperience == null) return fresher ? 0.8 : 0.75;

    if (minExperience != null && candidateYears < minExperience) {
        return clamp01(1 - (minExperience - candidateYears) * 0.35);
    }
    if (maxExperience != null && candidateYears > maxExperience) {
        return clamp01(1 - (candidateYears - maxExperience) * 0.2);
    }
    return 1;
}

function uniqueRows(rows: JobCatalogRow[]): JobCatalogRow[] {
    const seen = new Set<string>();
    const out: JobCatalogRow[] = [];
    for (const row of rows) {
        const key = `${row.company.toLowerCase()}|${(row.role || row.jobTitle || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

export async function getRecommendedCompanyRoleDetails(params: {
    studentId: string;
    resumeId: string;
    limit?: number;
    roleFilter?: string | null;
    onStream?: (event: RecommendStreamEvent) => void;
    shouldStop?: () => boolean;
}): Promise<CompanyRoleRecommendationDetail[]> {
    const ensureNotStopped = () => {
        if (params.shouldStop?.()) {
            const err = new Error('recommendation request cancelled');
            (err as any).code = 'CLIENT_ABORT';
            throw err;
        }
    };
    const emit = (event: RecommendStreamEvent) => {
        ensureNotStopped();
        params.onStream?.(event);
    };

    emit({ type: 'status', phase: 'basic', message: 'Computing quick ranking…' });
    const out = await getRecommendedCompanyRoleDetailsBasic({
        studentId: params.studentId,
        resumeId: params.resumeId,
        limit: params.limit,
        roleFilter: params.roleFilter,
    });
    if (params.onStream) {
        for (const item of out) {
            emit({ type: 'item', data: item });
            await flushYield();
        }
    }
    emit({ type: 'done', count: out.length });
    return out;
}

export async function getRecommendedCompanyRoleDetailsBasic(params: {
    studentId: string;
    resumeId: string;
    limit?: number;
    roleFilter?: string | null;
}): Promise<CompanyRoleRecommendationDetail[]> {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 10);
    const explicitRoleFilter = params.roleFilter?.trim() || '';
    const core = await computeBasicRecommendationCore({
        studentId: params.studentId,
        resumeId: params.resumeId,
        explicitRoleFilter,
        limit: 10,
        useCache: true,
    });
    return core.recommendations.slice(0, limit);
}

type ScoredCandidate = {
    row: JobCatalogRow;
    displayRole: string;
    score: number;
    overlapCount: number;
    skillCoverage: number;
    skillPrecision: number;
    roleMatch: number;
    expFit: number;
    quality: number;
    matchedSkills: string[];
    missingSkills: string[];
    experienceRequired: string;
};

export type RecommendationDebugInfo = {
    candidateSkills: string[];
    candidateRoles: string[];
    candidateYears: number;
    fresher: boolean;
    strictRoleMode: boolean;
    poolSize: number;
    scoredSize: number;
    rounds: Array<{ maxPerRole: number; maxPerCompany: number }>;
    topScored: Array<{
        company: string;
        role: string;
        score: number;
        overlapCount: number;
        skillCoverage: number;
        skillPrecision: number;
        roleMatch: number;
        expFit: number;
        quality: number;
        matchedSkills: string[];
    }>;
    selectedRoleCounts: Record<string, number>;
    selectedCompanyCounts: Record<string, number>;
};

function toRecommendationDetail(x: ScoredCandidate): CompanyRoleRecommendationDetail {
    return {
        company: x.row.company,
        role: x.displayRole,
        workType: x.row.workType ?? null,
        jobDescription: x.row.jobDescription ?? null,
        responsibilities: x.row.responsibilities ?? null,
        benefits: humanizeCatalogBenefits(x.row.benefitsText),
        companySector: x.row.companySector ?? null,
        experienceRequired: x.experienceRequired,
    };
}

function selectDiverseCandidates(
    scored: ScoredCandidate[],
    strictRoleMode: boolean,
    limit: number,
): {
    selected: ScoredCandidate[];
    rounds: Array<[number, number]>;
    selectedRoleCounts: Record<string, number>;
    selectedCompanyCounts: Record<string, number>;
} {
    const rounds: Array<[number, number]> = strictRoleMode
        ? [[10, 2], [10, 4], [10, 8]]
        : [[1, 2], [2, 3], [3, 4], [4, 5]];
    const counts = emptyRoleCompanyCounts();
    const used = new Set<string>();
    const selected: ScoredCandidate[] = [];

    if (!strictRoleMode) {
        const roleSeeded = new Set<string>();
        const seedTarget = Math.min(limit, 5);
        for (const x of scored) {
            if (selected.length >= seedTarget) break;
            const roleKey = normalizeRoleKey(x.displayRole);
            const key = `${x.row.company.toLowerCase()}|${x.displayRole.toLowerCase()}`;
            if (used.has(key) || roleSeeded.has(roleKey)) continue;
            if (!countsAllow(counts, x.displayRole, x.row.company, 1, 2)) continue;
            used.add(key);
            roleSeeded.add(roleKey);
            recordPick(counts, x.displayRole, x.row.company);
            selected.push(x);
        }
    }

    for (const [mr, mc] of rounds) {
        for (const x of scored) {
            if (selected.length >= limit) break;
            const key = `${x.row.company.toLowerCase()}|${x.displayRole.toLowerCase()}`;
            if (used.has(key)) continue;
            if (!countsAllow(counts, x.displayRole, x.row.company, mr, mc)) continue;
            used.add(key);
            recordPick(counts, x.displayRole, x.row.company);
            selected.push(x);
        }
    }

    return {
        selected,
        rounds,
        selectedRoleCounts: Object.fromEntries(counts.role.entries()),
        selectedCompanyCounts: Object.fromEntries(counts.company.entries()),
    };
}

async function computeBasicRecommendationCore(params: {
    studentId: string;
    resumeId: string;
    explicitRoleFilter: string;
    limit: number;
    useCache: boolean;
}): Promise<{ recommendations: CompanyRoleRecommendationDetail[]; debug: RecommendationDebugInfo | null }> {
    const resume = await prisma.resume.findFirst({
        where: { id: params.resumeId, studentId: params.studentId },
        select: {
            extractedJson: true,
            extractedText: true,
            roleName: true,
            updatedAt: true,
        },
    });
    if (!resume) return { recommendations: [], debug: null };

    const cacheKey = `basic-v1|${params.studentId}|${params.resumeId}|${params.explicitRoleFilter.toLowerCase()}|${resume.updatedAt.toISOString()}`;
    if (params.useCache) {
        const cached = basicRecommendationCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return { recommendations: cached.recommendations.slice(0, params.limit), debug: null };
        }
    }

    const heuristicSkillSet = deriveCandidateSkills(resume.extractedJson, resume.extractedText);
    const candidateSkills = [...heuristicSkillSet].map((s) => normalizeSkill(s));
    const candidateRoles = inferRoles(heuristicSkillSet, params.explicitRoleFilter || resume.roleName);
    const fresher = inferFresher(resume.extractedJson, resume.extractedText);
    const candidateYears = inferCandidateYears(resume.extractedJson, resume.extractedText);
    const strictRoleMode = Boolean(params.explicitRoleFilter);
    const roleWords = [
        ...new Set(candidateRoles.flatMap((r) => r.toLowerCase().split(/\s+/).filter((w) => w.length >= 4))),
    ].slice(0, 8);

    const db = prisma as any;
    const baseSelect = {
        company: true,
        role: true,
        jobTitle: true,
        skillsArr: true,
        minExperience: true,
        maxExperience: true,
        workType: true,
        jobDescription: true,
        responsibilities: true,
        benefitsText: true,
        companySector: true,
    };

    let rows: JobCatalogRow[] = [];
    if (candidateSkills.length > 0) {
        const skillRows: JobCatalogRow[] = await db.jobCatalog.findMany({
            where: {
                ...experienceWhere(),
                skillsArr: { hasSome: candidateSkills.slice(0, 25) },
            },
            select: baseSelect,
            take: PRIMARY_TAKE,
        });
        rows.push(...skillRows);
    }
    if (rows.length < 120 && roleWords.length > 0) {
        const roleRows: JobCatalogRow[] = await db.jobCatalog.findMany({
            where: {
                ...experienceWhere(),
                OR: roleWords.flatMap((word) => [
                    { role: { contains: word, mode: 'insensitive' } },
                    { jobTitle: { contains: word, mode: 'insensitive' } },
                ]),
            },
            select: baseSelect,
            take: SECONDARY_TAKE,
        });
        rows.push(...roleRows);
    }
    rows = uniqueRows(rows);
    if (rows.length < 80) {
        const fallbackRows: JobCatalogRow[] = await db.jobCatalog.findMany({
            where: experienceWhere(),
            select: baseSelect,
            take: FALLBACK_TAKE,
        });
        rows = uniqueRows([...rows, ...fallbackRows]);
    }
    if (rows.length === 0) {
        return {
            recommendations: [],
            debug: {
                candidateSkills: candidateSkills.slice(0, 60),
                candidateRoles,
                candidateYears,
                fresher,
                strictRoleMode,
                poolSize: 0,
                scoredSize: 0,
                rounds: [],
                topScored: [],
                selectedRoleCounts: {},
                selectedCompanyCounts: {},
            },
        };
    }

    const requireSkillOverlap = candidateSkills.length >= 4;
    const scored = rows
        .map((row) => {
            const rowSkills = rowSkillSet(row.skillsArr);
            const overlapCount = candidateSkills.filter((s) => rowSkills.has(s)).length;
            const skillCoverage = candidateSkills.length > 0 ? overlapCount / candidateSkills.length : 0;
            const skillPrecision = rowSkills.size > 0 ? overlapCount / rowSkills.size : 0;
            const roleMatch = computeRoleMatch(candidateRoles, row.role, row.jobTitle);
            if (strictRoleMode && roleMatch <= 0) return null;
            if (requireSkillOverlap && overlapCount === 0) return null;
            const expFit = computeExperienceFit(candidateYears, fresher, row.minExperience, row.maxExperience, row.role);
            const quality = (row.jobDescription || '').trim().length >= 120 ? 1 : 0.5;
            // Skill overlap is the primary driver.
            const score = clamp01(
                0.72 * (0.72 * skillCoverage + 0.28 * skillPrecision) +
                0.18 * roleMatch +
                0.07 * expFit +
                0.03 * quality,
            );
            if (score < 0.24) return null;
            const displayRole = row.role || row.jobTitle || 'Unknown Role';
            return {
                row,
                displayRole,
                score,
                overlapCount,
                skillCoverage,
                skillPrecision,
                roleMatch,
                expFit,
                quality,
                matchedSkills: candidateSkills.filter((s) => rowSkills.has(s)).slice(0, 8),
                missingSkills: [...rowSkills].filter((s) => !heuristicSkillSet.has(s)).slice(0, 8),
                experienceRequired: formatExperienceRequired(row.minExperience, row.maxExperience),
            };
        })
        .filter(Boolean) as ScoredCandidate[];

    scored.sort((a, b) => b.score - a.score);
    const picked = selectDiverseCandidates(scored, strictRoleMode, 10);
    const recommendations = picked.selected.map(toRecommendationDetail);

    basicRecommendationCache.set(cacheKey, {
        expiresAt: Date.now() + RECOMMEND_CACHE_TTL_MS,
        recommendations: recommendations.slice(0, 10),
    });

    const debug: RecommendationDebugInfo = {
        candidateSkills: candidateSkills.slice(0, 60),
        candidateRoles,
        candidateYears,
        fresher,
        strictRoleMode,
        poolSize: rows.length,
        scoredSize: scored.length,
        rounds: picked.rounds.map(([maxPerRole, maxPerCompany]) => ({ maxPerRole, maxPerCompany })),
        topScored: scored.slice(0, 25).map((x) => ({
            company: x.row.company,
            role: x.displayRole,
            score: Number(x.score.toFixed(4)),
            overlapCount: x.overlapCount,
            skillCoverage: Number(x.skillCoverage.toFixed(4)),
            skillPrecision: Number(x.skillPrecision.toFixed(4)),
            roleMatch: Number(x.roleMatch.toFixed(4)),
            expFit: Number(x.expFit.toFixed(4)),
            quality: Number(x.quality.toFixed(4)),
            matchedSkills: x.matchedSkills.slice(0, 6),
        })),
        selectedRoleCounts: picked.selectedRoleCounts,
        selectedCompanyCounts: picked.selectedCompanyCounts,
    };

    return { recommendations: recommendations.slice(0, params.limit), debug };
}

export async function getRecommendedCompanyRoleDetailsDebug(params: {
    studentId: string;
    resumeId: string;
    limit?: number;
    roleFilter?: string | null;
}): Promise<{ recommendations: CompanyRoleRecommendationDetail[]; debug: RecommendationDebugInfo | null }> {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 10);
    const explicitRoleFilter = params.roleFilter?.trim() || '';
    return computeBasicRecommendationCore({
        studentId: params.studentId,
        resumeId: params.resumeId,
        explicitRoleFilter,
        limit,
        useCache: false,
    });
}

export async function getRecommendedCompanyRoles(params: {
    studentId: string;
    resumeId: string;
    limit?: number;
    roleFilter?: string | null;
}): Promise<CompanyRoleRecommendation[]> {
    const detailed = await getRecommendedCompanyRoleDetails(params);
    return detailed.map((item) => ({ company: item.company, role: item.role }));
}
