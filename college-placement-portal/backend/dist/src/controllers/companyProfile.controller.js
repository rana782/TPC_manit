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
exports.lookupCompany = exports.suggestCompanies = void 0;
const client_1 = require("@prisma/client");
const companyNormalizer_1 = require("../utils/companyNormalizer");
const prisma = new client_1.PrismaClient();
function scoreNormalizedMatch(normalizedQuery, row) {
    var _a;
    const n = row.normalizedName;
    if (n === normalizedQuery)
        return 10000;
    let s = 0;
    if (n.startsWith(normalizedQuery))
        s += 500;
    else if (normalizedQuery.startsWith(n) && n.length >= 4)
        s += 400;
    else if (n.includes(normalizedQuery))
        s += 200;
    else if (normalizedQuery.includes(n) && n.length >= 4)
        s += 150;
    s += Math.min((_a = row.reviewCount) !== null && _a !== void 0 ? _a : 0, 500000) / 1000;
    return s;
}
function findBestFuzzyProfile(normalizedQuery) {
    return __awaiter(this, void 0, void 0, function* () {
        if (normalizedQuery.length < 3)
            return null;
        const candidates = yield prisma.companyProfile.findMany({
            where: { normalizedName: { contains: normalizedQuery } },
            orderBy: [{ reviewCount: 'desc' }, { rating: 'desc' }],
            take: 25,
        });
        if (candidates.length === 0)
            return null;
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
    });
}
const suggestCompanies = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        if (!q || q.length < 2)
            return res.json([]);
        const normalizedQuery = (0, companyNormalizer_1.normalizeCompanyName)(q);
        if (!normalizedQuery || normalizedQuery.length < 2)
            return res.json([]);
        const trimmed = q.trim();
        const results = yield prisma.companyProfile.findMany({
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
        return res.json(results.map((r) => {
            var _a, _b, _c, _d, _e;
            return ({
                companyName: r.companyName,
                normalizedName: r.normalizedName,
                rating: (_a = r.rating) !== null && _a !== void 0 ? _a : null,
                reviewCount: (_b = r.reviewCount) !== null && _b !== void 0 ? _b : null,
                logoUrl: (_c = r.logoUrl) !== null && _c !== void 0 ? _c : null,
                highlyRatedFor: (_d = r.highlyRatedFor) !== null && _d !== void 0 ? _d : [],
                criticallyRatedFor: (_e = r.criticallyRatedFor) !== null && _e !== void 0 ? _e : []
            });
        }));
    }
    catch (_a) {
        return res.json([]);
    }
});
exports.suggestCompanies = suggestCompanies;
const lookupCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    try {
        const name = typeof req.query.name === 'string' ? req.query.name : '';
        const normalizedName = (0, companyNormalizer_1.normalizeCompanyName)(name);
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
        const exact = yield prisma.companyProfile.findUnique({ where: { normalizedName } });
        if (exact) {
            return res.json({
                found: true,
                rating: (_a = exact.rating) !== null && _a !== void 0 ? _a : null,
                reviews: (_b = exact.reviewCount) !== null && _b !== void 0 ? _b : null,
                logoUrl: (_c = exact.logoUrl) !== null && _c !== void 0 ? _c : null,
                highlyRatedFor: (_d = exact.highlyRatedFor) !== null && _d !== void 0 ? _d : [],
                criticallyRatedFor: (_e = exact.criticallyRatedFor) !== null && _e !== void 0 ? _e : []
            });
        }
        const byDisplayName = yield prisma.companyProfile.findFirst({
            where: { companyName: { equals: name.trim(), mode: 'insensitive' } }
        });
        if (byDisplayName) {
            return res.json({
                found: true,
                rating: (_f = byDisplayName.rating) !== null && _f !== void 0 ? _f : null,
                reviews: (_g = byDisplayName.reviewCount) !== null && _g !== void 0 ? _g : null,
                logoUrl: (_h = byDisplayName.logoUrl) !== null && _h !== void 0 ? _h : null,
                highlyRatedFor: (_j = byDisplayName.highlyRatedFor) !== null && _j !== void 0 ? _j : [],
                criticallyRatedFor: (_k = byDisplayName.criticallyRatedFor) !== null && _k !== void 0 ? _k : []
            });
        }
        const fuzzy = yield findBestFuzzyProfile(normalizedName);
        if (fuzzy) {
            return res.json({
                found: true,
                rating: (_l = fuzzy.rating) !== null && _l !== void 0 ? _l : null,
                reviews: (_m = fuzzy.reviewCount) !== null && _m !== void 0 ? _m : null,
                logoUrl: (_o = fuzzy.logoUrl) !== null && _o !== void 0 ? _o : null,
                highlyRatedFor: (_p = fuzzy.highlyRatedFor) !== null && _p !== void 0 ? _p : [],
                criticallyRatedFor: (_q = fuzzy.criticallyRatedFor) !== null && _q !== void 0 ? _q : []
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
    }
    catch (_r) {
        return res.json({
            found: false,
            rating: null,
            reviews: null,
            logoUrl: null,
            highlyRatedFor: [],
            criticallyRatedFor: []
        });
    }
});
exports.lookupCompany = lookupCompany;
