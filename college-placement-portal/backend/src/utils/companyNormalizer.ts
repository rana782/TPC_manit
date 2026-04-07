const COMPANY_SUFFIX_PATTERN = /\b(ltd|limited|pvt|private|inc|corp|corporation|llp|co|company)\b\.?/gi;

export const normalizeCompanyName = (name: string): string => {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(COMPANY_SUFFIX_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

