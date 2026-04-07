import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth.middleware';
import { normalizeCompanyName } from '../utils/companyNormalizer';

const prisma = new PrismaClient();

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

