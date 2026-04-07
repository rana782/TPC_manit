"use strict";
// Maps normalized company names to a best-effort domain for logo generation.
// IMPORTANT: Key must be the normalized name only (case-insensitive via normalizeCompanyName).
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyLogo = exports.COMPANY_DOMAIN_MAP = void 0;
exports.COMPANY_DOMAIN_MAP = {
    // Core test/seed companies
    tcs: "tcs.com",
    infosys: "infosys.com",
    wipro: "wipro.com",
    accenture: "accenture.com",
    cognizant: "cognizant.com",
    hcl: "hcltech.com",
    // Used for "broken URL" UI fallback verification in Playwright.
    "unknown startup xyz": "unknown-startup-xyz.invalid",
};
const getCompanyLogo = (normalizedName) => {
    const domain = exports.COMPANY_DOMAIN_MAP[normalizedName];
    if (!domain)
        return null;
    // Clearbit logo endpoint; UI must handle errors via onError fallback.
    return `https://logo.clearbit.com/${domain}`;
};
exports.getCompanyLogo = getCompanyLogo;
