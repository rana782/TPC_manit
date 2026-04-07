"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCompanyName = void 0;
const COMPANY_SUFFIX_PATTERN = /\b(ltd|limited|pvt|private|inc|corp|corporation|llp|co|company)\b\.?/gi;
const normalizeCompanyName = (name) => {
    return (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(COMPANY_SUFFIX_PATTERN, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};
exports.normalizeCompanyName = normalizeCompanyName;
