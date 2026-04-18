import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { normalizeCompanyName } from '../utils/companyNormalizer';
import prisma from '../lib/prisma';

type ProfileRow = {
  normalizedName: string;
  reviewCount: number | null;
};

function scoreNormalizedMatch(normalizedQuery: string, row: ProfileRow): number {
  const n = row.normalizedName;
  if (n === normalizedQuery) return 10_000;
  let s = 0;
  if (n.startsWith(normalizedQuery)) s += 500;
  else if (normalizedQuery.startsWith(n) && n.length >= 4) s += 400;
  else if (n.includes(normalizedQuery)) s += 200;
  else if (normalizedQuery.includes(n) && n.length >= 4) s += 150;
  s += Math.min(row.reviewCount ?? 0, 500_000) / 1000;
  return s;
}

async function findBestFuzzyProfile(normalizedQuery: string) {
  if (normalizedQuery.length < 3) return null;
  const candidates = await prisma.companyProfile.findMany({
    where: { normalizedName: { contains: normalizedQuery } },
    orderBy: [{ reviewCount: 'desc' }, { rating: 'desc' }],
    take: 25,
  });
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = scoreNormalizedMatch(normalizedQuery, best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const sc = scoreNormalizedMatch(normalizedQuery, c);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return bestScore >= 150 ? best : null;
}

export const suggestCompanies = async (req: AuthRequest, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q || q.length < 2) return res.json([]);
    const normalizedQuery = normalizeCompanyName(q);
    if (!normalizedQuery || normalizedQuery.length < 2) return res.json([]);

    const trimmed = q.trim();

    const results = await prisma.companyProfile.findMany({
      where: {
        OR: [
          { normalizedName: { contains: normalizedQuery } },
          { companyName: { contains: trimmed, mode: 'insensitive' } }
        ]
      },
      orderBy: [
        { rating: 'desc' },
        { reviewCount: 'desc' },
        { companyName: 'asc' }
      ],
      take: 15
    });

    return res.json(results.map((r) => ({
      companyName: r.companyName,
      normalizedName: r.normalizedName,
      rating: r.rating ?? null,
      reviewCount: r.reviewCount ?? null,
      logoUrl: r.logoUrl ?? null,
      highlyRatedFor: r.highlyRatedFor ?? [],
      criticallyRatedFor: r.criticallyRatedFor ?? []
    })));
  } catch {
    return res.json([]);
  }
};

const BATCH_LOOKUP_MAX = 300;
const BATCH_OR_CHUNK = 24;

type CompanyProfileSelect = {
  companyName: string;
  normalizedName: string;
  rating: number | null;
  reviewCount: number | null;
  logoUrl: string | null;
  highlyRatedFor: string[];
  criticallyRatedFor: string[];
};

function toLookupPayload(row: CompanyProfileSelect) {
  return {
    found: true as const,
    rating: row.rating ?? null,
    reviews: row.reviewCount ?? null,
    logoUrl: row.logoUrl ?? null,
    highlyRatedFor: row.highlyRatedFor ?? [],
    criticallyRatedFor: row.criticallyRatedFor ?? [],
  };
}

function emptyLookupPayload() {
  return {
    found: false as const,
    rating: null as number | null,
    reviews: null as number | null,
    logoUrl: null as string | null,
    highlyRatedFor: [] as string[],
    criticallyRatedFor: [] as string[],
  };
}

/**
 * POST /api/companies/lookup-batch — one round-trip for many job cards (SPOC job board, etc.).
 * Strategy: single findMany on normalizedName IN (...), then chunked case-insensitive display-name OR for misses.
 */
export const lookupCompaniesBatch = async (req: AuthRequest, res: Response) => {
  try {
    const rawList = Array.isArray((req.body as { names?: unknown })?.names)
      ? (req.body as { names: unknown[] }).names
      : [];
    const names = rawList
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const unique = [...new Set(names)].slice(0, BATCH_LOOKUP_MAX);

    if (unique.length === 0) {
      return res.json({ success: true, profiles: {} as Record<string, ReturnType<typeof emptyLookupPayload>> });
    }

    const normKeys = [...new Set(unique.map((n) => normalizeCompanyName(n)).filter(Boolean))];

    const rows = await prisma.companyProfile.findMany({
      where: { normalizedName: { in: normKeys } },
      select: {
        companyName: true,
        normalizedName: true,
        rating: true,
        reviewCount: true,
        logoUrl: true,
        highlyRatedFor: true,
        criticallyRatedFor: true,
      },
    });

    const byNorm = new Map(rows.map((r) => [r.normalizedName, r]));
    const byLower = new Map<string, CompanyProfileSelect>();
    for (const r of rows) {
      byLower.set(r.companyName.trim().toLowerCase(), r);
    }

    const out: Record<string, ReturnType<typeof toLookupPayload> | ReturnType<typeof emptyLookupPayload>> = {};

    for (const raw of unique) {
      const n = normalizeCompanyName(raw);
      let row: CompanyProfileSelect | undefined = n ? byNorm.get(n) : undefined;
      if (!row) row = byLower.get(raw.trim().toLowerCase());
      if (row) {
        out[raw] = toLookupPayload(row);
      }
    }

    const stillMissing = unique.filter((raw) => !out[raw]);
    for (let i = 0; i < stillMissing.length; i += BATCH_OR_CHUNK) {
      const chunk = stillMissing.slice(i, i + BATCH_OR_CHUNK);
      const chunkRows = await prisma.companyProfile.findMany({
        where: {
          OR: chunk.map((raw) => ({
            companyName: { equals: raw.trim(), mode: 'insensitive' as const },
          })),
        },
        select: {
          companyName: true,
          normalizedName: true,
          rating: true,
          reviewCount: true,
          logoUrl: true,
          highlyRatedFor: true,
          criticallyRatedFor: true,
        },
      });
      const lowerToRow = new Map(chunkRows.map((r) => [r.companyName.trim().toLowerCase(), r]));
      for (const raw of chunk) {
        if (out[raw]) continue;
        const hit = lowerToRow.get(raw.trim().toLowerCase());
        if (hit) {
          out[raw] = toLookupPayload(hit);
        }
      }
    }

    for (const raw of unique) {
      if (!out[raw]) {
        out[raw] = emptyLookupPayload();
      }
    }

    return res.json({ success: true, profiles: out });
  } catch (e) {
    console.error('[companies/lookup-batch]', e);
    return res.status(500).json({ success: false, message: 'Batch company lookup failed.' });
  }
};

export const lookupCompany = async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const normalizedName = normalizeCompanyName(name);
    if (!normalizedName) {
      return res.json({
        found: false,
        rating: null,
        reviews: null,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      });
    }

    const exact = await prisma.companyProfile.findUnique({ where: { normalizedName } });
    if (exact) {
      return res.json({
        found: true,
        rating: exact.rating ?? null,
        reviews: exact.reviewCount ?? null,
        logoUrl: exact.logoUrl ?? null,
        highlyRatedFor: exact.highlyRatedFor ?? [],
        criticallyRatedFor: exact.criticallyRatedFor ?? []
      });
    }

    const byDisplayName = await prisma.companyProfile.findFirst({
      where: { companyName: { equals: name.trim(), mode: 'insensitive' } }
    });
    if (byDisplayName) {
      return res.json({
        found: true,
        rating: byDisplayName.rating ?? null,
        reviews: byDisplayName.reviewCount ?? null,
        logoUrl: byDisplayName.logoUrl ?? null,
        highlyRatedFor: byDisplayName.highlyRatedFor ?? [],
        criticallyRatedFor: byDisplayName.criticallyRatedFor ?? []
      });
    }

    const fuzzy = await findBestFuzzyProfile(normalizedName);
    if (fuzzy) {
      return res.json({
        found: true,
        rating: fuzzy.rating ?? null,
        reviews: fuzzy.reviewCount ?? null,
        logoUrl: fuzzy.logoUrl ?? null,
        highlyRatedFor: fuzzy.highlyRatedFor ?? [],
        criticallyRatedFor: fuzzy.criticallyRatedFor ?? []
      });
    }

    return res.json({
      found: false,
      rating: null,
      reviews: null,
      logoUrl: null,
      highlyRatedFor: [],
      criticallyRatedFor: []
    });
  } catch {
    return res.json({
      found: false,
      rating: null,
      reviews: null,
      logoUrl: null,
      highlyRatedFor: [],
      criticallyRatedFor: []
    });
  }
};

