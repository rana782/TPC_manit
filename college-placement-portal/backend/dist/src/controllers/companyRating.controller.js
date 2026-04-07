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
exports.getCompanyRating = void 0;
const client_1 = require("@prisma/client");
const companyNormalizer_1 = require("../utils/companyNormalizer");
const prisma = new client_1.PrismaClient();
const getCompanyRating = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const rawName = typeof req.query.name === 'string' ? req.query.name : '';
    const name = rawName.trim();
    if (!name) {
        return res.status(400).json({ success: false, message: 'name query is required', rating: null, reviews: null, source: null });
    }
    try {
        const normalized = (0, companyNormalizer_1.normalizeCompanyName)(name);
        if (!normalized) {
            return res.json({ success: true, rating: null, reviews: null, source: null });
        }
        // DB-only: prefer JSON-imported CompanyRating row (kept for compatibility).
        const row = yield prisma.companyRating.findUnique({ where: { companyName: normalized } });
        if (!row)
            return res.json({ success: true, rating: null, reviews: null, source: null });
        const result = { rating: (_a = row.rating) !== null && _a !== void 0 ? _a : null, reviews: (_b = row.reviews) !== null && _b !== void 0 ? _b : null, source: (_c = row.source) !== null && _c !== void 0 ? _c : null };
        return res.json({
            success: true,
            rating: (_d = result.rating) !== null && _d !== void 0 ? _d : null,
            reviews: (_e = result.reviews) !== null && _e !== void 0 ? _e : null,
            source: (_f = result.source) !== null && _f !== void 0 ? _f : null
        });
    }
    catch (_g) {
        return res.json({ success: true, rating: null, reviews: null, source: null });
    }
});
exports.getCompanyRating = getCompanyRating;
