import { PrismaClient } from '@prisma/client';
import { normalizeCompanyName } from './companyNormalizer';

/** Seeded / test jobs use fictional names not present in companies.json — keep DB intelligence in sync. */
const DEMO_ROWS: Array<{
  companyName: string;
  rating: number;
  reviewCount: number;
  logoUrl: string | null;
  highlyRatedFor: string[];
  criticallyRatedFor: string[];
}> = [
  {
    companyName: 'TechCorp Solutions',
    rating: 4.1,
    reviewCount: 890,
    logoUrl: null,
    highlyRatedFor: ['Learning opportunities', 'Modern tech stack', 'Team collaboration'],
    criticallyRatedFor: ['Deadline pressure during releases'],
  },
  {
    companyName: 'DataMinds Inc.',
    rating: 3.8,
    reviewCount: 420,
    logoUrl: null,
    highlyRatedFor: ['Data-driven culture', 'Skill development', 'Flexible hours'],
    criticallyRatedFor: ['Promotion cycles', 'On-call expectations'],
  },
  {
    companyName: 'InnovateTech',
    rating: 4.3,
    reviewCount: 1250,
    logoUrl: null,
    highlyRatedFor: ['Product focus', 'Engineering quality', 'Work-life balance'],
    criticallyRatedFor: ['Fast-paced delivery'],
  },
  {
    companyName: 'Round3 Systems',
    rating: 3.9,
    reviewCount: 210,
    logoUrl: null,
    highlyRatedFor: ['Ownership', 'Compensation'],
    criticallyRatedFor: ['Process overhead'],
  },
];

export async function upsertDemoCompanyProfiles(prisma: PrismaClient): Promise<void> {
  for (const row of DEMO_ROWS) {
    const normalizedName = normalizeCompanyName(row.companyName);
    if (!normalizedName) continue;

    await prisma.companyProfile.upsert({
      where: { normalizedName },
      update: {
        companyName: row.companyName,
        rating: row.rating,
        reviewCount: row.reviewCount,
        logoUrl: row.logoUrl,
        highlyRatedFor: row.highlyRatedFor,
        criticallyRatedFor: row.criticallyRatedFor,
        source: 'demo_seed',
        lastSyncedAt: new Date(),
      },
      create: {
        companyName: row.companyName,
        normalizedName,
        rating: row.rating,
        reviewCount: row.reviewCount,
        logoUrl: row.logoUrl,
        highlyRatedFor: row.highlyRatedFor,
        criticallyRatedFor: row.criticallyRatedFor,
        source: 'demo_seed',
        lastSyncedAt: new Date(),
      },
    });
  }
}
