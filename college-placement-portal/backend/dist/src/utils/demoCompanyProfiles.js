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
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertDemoCompanyProfiles = upsertDemoCompanyProfiles;
const companyNormalizer_1 = require("./companyNormalizer");
/** Seeded / test jobs use fictional names not present in companies.json — keep DB intelligence in sync. */
const DEMO_ROWS = [
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
function upsertDemoCompanyProfiles(prisma) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const row of DEMO_ROWS) {
            const normalizedName = (0, companyNormalizer_1.normalizeCompanyName)(row.companyName);
            if (!normalizedName)
                continue;
            yield prisma.companyProfile.upsert({
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
    });
}
