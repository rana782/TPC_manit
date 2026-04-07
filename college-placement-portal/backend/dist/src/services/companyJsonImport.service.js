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
exports.MERGED_COMPANIES_FILENAME = void 0;
exports.importCompanyProfilesFromJson = importCompanyProfilesFromJson;
exports.ensureCompanyProfilesImported = ensureCompanyProfilesImported;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const companyNormalizer_1 = require("../utils/companyNormalizer");
const logger_1 = __importDefault(require("../utils/logger"));
function splitLines(value) {
    if (Array.isArray(value))
        return value.map((v) => String(v).trim()).filter(Boolean);
    if (typeof value !== 'string')
        return [];
    return value
        .split(/\r?\n|,/g)
        .map((s) => s.trim())
        .filter(Boolean);
}
function parseRating(value) {
    const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    let n = Number.parseFloat(trimmed);
    if (!Number.isFinite(n)) {
        const m = trimmed.match(/(\d+(?:\.\d+)?)/);
        if (!m)
            return null;
        n = Number.parseFloat(m[1]);
    }
    if (!Number.isFinite(n))
        return null;
    if (n < 0 || n > 5)
        return null;
    return n;
}
function pickRawRating(company) {
    var _a, _b, _c, _d;
    return ((_d = (_c = (_b = (_a = company['Rating (Max 5)']) !== null && _a !== void 0 ? _a : company['Company Rating']) !== null && _b !== void 0 ? _b : company['rating']) !== null && _c !== void 0 ? _c : company['avgRating']) !== null && _d !== void 0 ? _d : null);
}
function parseReviewCount(value) {
    const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
    const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s)
        return null;
    const m = s.match(/(\d+(?:\.\d+)?)\s*([kml])?\b/);
    if (!m)
        return null;
    const base = Number.parseFloat(m[1]);
    if (!Number.isFinite(base))
        return null;
    const suffix = m[2];
    const mult = suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : suffix === 'l' ? 100000 : 1;
    const out = Math.round(base * mult);
    return out > 0 ? out : null;
}
/** Canonical merged export (AmbitionBox-style rows: Company Name, Rating, Reviews, Highly/Critically Rated For, …). */
exports.MERGED_COMPANIES_FILENAME = 'merged-1775126456590.json';
function getBackendRoot() {
    return path_1.default.resolve(__dirname, '../..');
}
/**
 * Prefer merged-1775126456590.json (user’s full dataset), then backend/data/companies.json.
 * Resolution order handles `npm run dev` with cwd=backend and file living beside the backend folder.
 */
function loadCompaniesJson() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const backendRoot = getBackendRoot();
        const cwd = process.cwd();
        const candidatePaths = [];
        const envPath = (_a = process.env.COMPANY_DATA_JSON) === null || _a === void 0 ? void 0 : _a.trim();
        if (envPath) {
            if (path_1.default.isAbsolute(envPath)) {
                candidatePaths.push(envPath);
            }
            else {
                candidatePaths.push(path_1.default.resolve(cwd, envPath));
                candidatePaths.push(path_1.default.join(backendRoot, envPath));
                candidatePaths.push(path_1.default.resolve(backendRoot, '..', envPath));
            }
        }
        candidatePaths.push(path_1.default.join(backendRoot, '..', exports.MERGED_COMPANIES_FILENAME), path_1.default.join(backendRoot, 'data', exports.MERGED_COMPANIES_FILENAME), path_1.default.join(cwd, exports.MERGED_COMPANIES_FILENAME), path_1.default.join(cwd, '..', exports.MERGED_COMPANIES_FILENAME), path_1.default.join(backendRoot, 'data', 'companies.json'));
        const tried = new Set();
        for (const p of candidatePaths) {
            const resolved = path_1.default.resolve(p);
            if (tried.has(resolved))
                continue;
            tried.add(resolved);
            try {
                const raw = yield promises_1.default.readFile(resolved, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return { rows: parsed, filePath: resolved };
                }
            }
            catch (_b) {
                // try next candidate
            }
        }
        return { rows: [], filePath: null };
    });
}
/**
 * Upserts all rows from merged-1775126456590.json (preferred) or companies.json into CompanyProfile + CompanyRating.
 */
function importCompanyProfilesFromJson(prisma_1) {
    return __awaiter(this, arguments, void 0, function* (prisma, log = (m) => logger_1.default.info(m)) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const { rows: data, filePath } = yield loadCompaniesJson();
        if (data.length === 0) {
            log(`[importCompanies] No companies loaded. Put ${exports.MERGED_COMPANIES_FILENAME} next to the backend folder (or in backend/data/), or set COMPANY_DATA_JSON to its path.`);
            return { ok: 0, skipped: 0 };
        }
        log(`[importCompanies] loaded=${data.length} from ${filePath !== null && filePath !== void 0 ? filePath : 'unknown'}`);
        let ok = 0;
        let skipped = 0;
        for (const company of data) {
            const companyName = String((_b = (_a = company['Company Name']) !== null && _a !== void 0 ? _a : company['companyName']) !== null && _b !== void 0 ? _b : '').trim();
            const normalizedName = (0, companyNormalizer_1.normalizeCompanyName)(companyName);
            if (!normalizedName) {
                skipped++;
                continue;
            }
            const logoUrl = typeof company['Company Logo'] === 'string'
                ? company['Company Logo']
                : typeof company['logoUrl'] === 'string'
                    ? company['logoUrl']
                    : null;
            const rating = parseRating(pickRawRating(company));
            const reviewCount = parseReviewCount((_d = (_c = company['Reviews']) !== null && _c !== void 0 ? _c : company['reviewCount']) !== null && _d !== void 0 ? _d : company['reviews']);
            const highlyRatedFor = splitLines((_f = (_e = company['Highly Rated For']) !== null && _e !== void 0 ? _e : company['Likes']) !== null && _f !== void 0 ? _f : company['highlyRatedFor']);
            const criticallyRatedFor = splitLines((_h = (_g = company['Critically Rated For']) !== null && _g !== void 0 ? _g : company['Dislikes']) !== null && _h !== void 0 ? _h : company['criticallyRatedFor']);
            const sourceUrl = typeof company['Company URL'] === 'string'
                ? company['Company URL']
                : typeof company['Company Review URL'] === 'string'
                    ? company['Company Review URL']
                    : null;
            yield prisma.companyProfile.upsert({
                where: { normalizedName },
                update: {
                    companyName,
                    rating,
                    reviewCount,
                    logoUrl,
                    highlyRatedFor,
                    criticallyRatedFor,
                    source: 'json_import',
                    sourceUrl,
                    lastSyncedAt: new Date(),
                },
                create: {
                    companyName,
                    normalizedName,
                    rating,
                    reviewCount,
                    logoUrl,
                    highlyRatedFor,
                    criticallyRatedFor,
                    source: 'json_import',
                    sourceUrl,
                    lastSyncedAt: new Date(),
                },
            });
            yield prisma.companyRating.upsert({
                where: { companyName: normalizedName },
                update: {
                    rating,
                    reviews: reviewCount,
                    source: 'json_import',
                    confidence: 1,
                },
                create: {
                    companyName: normalizedName,
                    rating,
                    reviews: reviewCount,
                    source: 'json_import',
                    confidence: 1,
                },
            });
            ok++;
            if (ok % 250 === 0)
                log(`[importCompanies] upserted=${ok}/${data.length}`);
        }
        log(`[importCompanies] done upserted=${ok} skipped=${skipped}`);
        return { ok, skipped };
    });
}
/**
 * Loads companies.json when the DB was never filled from the JSON dataset.
 * Skips if any row has source=json_import (full import already ran).
 * If only demo_seed rows exist, still imports so autocomplete (e.g. Google) works.
 */
function ensureCompanyProfilesImported(prisma) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.SKIP_AUTO_COMPANY_IMPORT === '1' || process.env.SKIP_AUTO_COMPANY_IMPORT === 'true') {
            return;
        }
        const hasJsonImport = (yield prisma.companyProfile.findFirst({ where: { source: 'json_import' }, select: { id: true } })) != null;
        if (hasJsonImport)
            return;
        const n = yield prisma.companyProfile.count();
        if (n > 0) {
            logger_1.default.warn(`Company profiles exist but JSON dataset not imported; importing ${exports.MERGED_COMPANIES_FILENAME} (or fallback companies.json) in the background (may take 1–2 minutes)...`);
        }
        else {
            logger_1.default.warn(`CompanyProfile is empty; importing ${exports.MERGED_COMPANIES_FILENAME} (or fallback companies.json) in the background (may take 1–2 minutes)...`);
        }
        try {
            yield importCompanyProfilesFromJson(prisma, (m) => logger_1.default.info(m));
        }
        catch (e) {
            logger_1.default.error('Automatic company profile import failed', e);
        }
    });
}
