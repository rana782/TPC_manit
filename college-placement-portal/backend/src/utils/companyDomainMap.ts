// Maps normalized company names to a best-effort domain for logo generation.
// IMPORTANT: Key must be the normalized name only (case-insensitive via normalizeCompanyName).

export const COMPANY_DOMAIN_MAP: Record<string, string> = {
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

export const getCompanyLogo = (normalizedName: string): string | null => {
  const domain = COMPANY_DOMAIN_MAP[normalizedName];
  if (!domain) return null;
  // Clearbit logo endpoint; UI must handle errors via onError fallback.
  return `https://logo.clearbit.com/${domain}`;
};

