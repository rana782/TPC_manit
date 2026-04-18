import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { normalizeCompanyName } from '../utils/companyNormalizer';
import logger from '../utils/logger';

type RawCompany = Record<string, unknown>;

function splitLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRating(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) {
    const m = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    n = Number.parseFloat(m[1]);
  }
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 5) return null;
  return n;
}

function pickRawRating(company: RawCompany): unknown {
  return (
    company['Rating (Max 5)'] ??
    company['Company Rating'] ??
    company['rating'] ??
    company['avgRating'] ??
    null
  );
}

function parseReviewCount(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;

  const m = s.match(/(\d+(?:\.\d+)?)\s*([kml])?\b/);
  if (!m) return null;
  const base = Number.parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = m[2];
  const mult = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'l' ? 100_000 : 1;
  const out = Math.round(base * mult);
  return out > 0 ? out : null;
}

/** Canonical merged export (AmbitionBox-style rows: Company Name, Rating, Reviews, Highly/Critically Rated For, …). */
export const MERGED_COMPANIES_FILENAME = 'merged-1775126456590.json';

function getBackendRoot(): string {
  return path.resolve(__dirname, '../..');
}

type LoadResult = { rows: RawCompany[]; filePath: string | null };

/**
 * Prefer merged-1775126456590.json (user’s full dataset), then backend/data/companies.json.
 * Resolution order handles `npm run dev` with cwd=backend and file living beside the backend folder.
 */
async function loadCompaniesJson(): Promise<LoadResult> {
  const backendRoot = getBackendRoot();
  const cwd = process.cwd();

  const candidatePaths: string[] = [];

  const envPath = process.env.COMPANY_DATA_JSON?.trim();
  if (envPath) {
    if (path.isAbsolute(envPath)) {
      candidatePaths.push(envPath);
    } else {
      candidatePaths.push(path.resolve(cwd, envPath));
      candidatePaths.push(path.join(backendRoot, envPath));
      candidatePaths.push(path.resolve(backendRoot, '..', envPath));
    }
  }

  candidatePaths.push(
    path.join(backendRoot, '..', MERGED_COMPANIES_FILENAME),
    path.join(backendRoot, MERGED_COMPANIES_FILENAME),
    path.join(backendRoot, 'data', MERGED_COMPANIES_FILENAME),
    path.join(cwd, MERGED_COMPANIES_FILENAME),
    path.join(cwd, '..', MERGED_COMPANIES_FILENAME),
    path.join(cwd, '..', '..', MERGED_COMPANIES_FILENAME),
    path.join(backendRoot, 'data', 'companies.json')
  );

  const tried = new Set<string>();
  for (const p of candidatePaths) {
    const resolved = path.resolve(p);
    if (tried.has(resolved)) continue;
    tried.add(resolved);
    try {
      const raw = await fs.readFile(resolved, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { rows: parsed as RawCompany[], filePath: resolved };
      }
    } catch {
      // try next candidate
    }
  }

  return { rows: [], filePath: null };
}

export type ImportCompanyProfilesResult = { ok: number; skipped: number };

/**
 * Upserts all rows from merged-1775126456590.json (preferred) or companies.json into CompanyProfile + CompanyRating.
 */
export async function importCompanyProfilesFromJson(
  prisma: PrismaClient,
  log: (msg: string) => void = (m) => logger.info(m)
): Promise<ImportCompanyProfilesResult> {
  const { rows: data, filePath } = await loadCompaniesJson();
  if (data.length === 0) {
    log(
      `[importCompanies] No companies loaded. Put ${MERGED_COMPANIES_FILENAME} next to the backend folder (or in backend/data/), or set COMPANY_DATA_JSON to its path.`
    );
    return { ok: 0, skipped: 0 };
  }

  log(`[importCompanies] loaded=${data.length} from ${filePath ?? 'unknown'}`);

  let ok = 0;
  let skipped = 0;

  for (const company of data) {
    const companyName = String(company['Company Name'] ?? company['companyName'] ?? '').trim();
    const normalizedName = normalizeCompanyName(companyName);
    if (!normalizedName) {
      skipped++;
      continue;
    }

    const logoUrl =
      typeof company['Company Logo'] === 'string'
        ? company['Company Logo']
        : typeof company['logoUrl'] === 'string'
          ? company['logoUrl']
          : null;
    const rating = parseRating(pickRawRating(company));
    const reviewCount = parseReviewCount(company['Reviews'] ?? company['reviewCount'] ?? company['reviews']);

    const highlyRatedFor = splitLines(company['Highly Rated For'] ?? company['Likes'] ?? company['highlyRatedFor']);
    const criticallyRatedFor = splitLines(
      company['Critically Rated For'] ?? company['Dislikes'] ?? company['criticallyRatedFor']
    );

    const sourceUrl =
      typeof company['Company URL'] === 'string'
        ? company['Company URL']
        : typeof company['Company Review URL'] === 'string'
          ? company['Company Review URL']
          : null;

    await prisma.companyProfile.upsert({
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

    await prisma.companyRating.upsert({
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
    if (ok % 250 === 0) log(`[importCompanies] upserted=${ok}/${data.length}`);
  }

  log(`[importCompanies] done upserted=${ok} skipped=${skipped}`);
  return { ok, skipped };
}

/**
 * Loads companies.json when the DB was never filled from the JSON dataset.
 * Skips if any row has source=json_import (full import already ran).
 * If only demo_seed rows exist, still imports so autocomplete (e.g. Google) works.
 */
export async function ensureCompanyProfilesImported(prisma: PrismaClient): Promise<void> {
  if (process.env.SKIP_AUTO_COMPANY_IMPORT === '1' || process.env.SKIP_AUTO_COMPANY_IMPORT === 'true') {
    return;
  }
  const forceReimport =
    process.env.FORCE_COMPANY_JSON_REIMPORT === '1' ||
    String(process.env.FORCE_COMPANY_JSON_REIMPORT || '').toLowerCase() === 'true';
  const hasJsonImport =
    (await prisma.companyProfile.findFirst({ where: { source: 'json_import' }, select: { id: true } })) != null;

  const { rows: sourceRows, filePath } = await loadCompaniesJson();
  const expectedFromJson = sourceRows.length;
  const currentCount = await prisma.companyProfile.count();

  // If merged JSON has far more rows than DB, import again even when json_import rows exist.
  // This fixes stale partial imports (e.g., old tiny dataset imported once, full merged file ignored later).
  const looksUnderImported =
    expectedFromJson >= 100 && currentCount < Math.floor(expectedFromJson * 0.6);

  if (hasJsonImport && !forceReimport && !looksUnderImported) return;

  if (hasJsonImport && looksUnderImported) {
    logger.warn(
      `Detected partial company profile import: db=${currentCount}, json=${expectedFromJson} (${filePath ?? 'unknown'}). Re-importing merged dataset...`
    );
  }

  if (currentCount > 0) {
    logger.warn(
      `Company profiles exist but JSON dataset not imported; importing ${MERGED_COMPANIES_FILENAME} (or fallback companies.json) in the background (may take 1–2 minutes)...`
    );
  } else {
    logger.warn(
      `CompanyProfile is empty; importing ${MERGED_COMPANIES_FILENAME} (or fallback companies.json) in the background (may take 1–2 minutes)...`
    );
  }
  try {
    await importCompanyProfilesFromJson(prisma, (m) => logger.info(m));
  } catch (e) {
    logger.error('Automatic company profile import failed', e);
  }
}
