import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { normalizeCompanyName } from '../utils/companyNormalizer';

const prisma = new PrismaClient();

export const getCompanyRating = async (req: AuthRequest, res: Response) => {
  const rawName = typeof req.query.name === 'string' ? req.query.name : '';
  const name = rawName.trim();

  if (!name) {
    return res.status(400).json({ success: false, message: 'name query is required', rating: null, reviews: null, source: null });
  }

  try {
    const normalized = normalizeCompanyName(name);
    if (!normalized) {
      return res.json({ success: true, rating: null, reviews: null, source: null });
    }

    // DB-only: prefer JSON-imported CompanyRating row (kept for compatibility).
    const row = await prisma.companyRating.findUnique({ where: { companyName: normalized } });
    if (!row) return res.json({ success: true, rating: null, reviews: null, source: null });

    const result = { rating: row.rating ?? null, reviews: row.reviews ?? null, source: row.source ?? null };
    return res.json({
      success: true,
      rating: result.rating ?? null,
      reviews: result.reviews ?? null,
      source: result.source ?? null
    });
  } catch {
    return res.json({ success: true, rating: null, reviews: null, source: null });
  }
};

