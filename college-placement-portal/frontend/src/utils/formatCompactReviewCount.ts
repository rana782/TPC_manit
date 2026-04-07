/** Compact review counts: 1.9k, 48.3k, 1.1L (lakh), 2.5M */
export function formatCompactReviewCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 10_000_000) {
    const m = n / 1_000_000;
    return `${m >= 100 ? Math.round(m) : trimDecimal(m)}M`;
  }
  if (n >= 100_000) {
    const l = n / 100_000;
    return `${l >= 10 ? Math.round(l) : trimDecimal(l)}L`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k >= 10 ? Math.round(k) : trimDecimal(k)}k`;
  }
  return String(n);
}

function trimDecimal(x: number): string {
  const s = x.toFixed(1);
  return s.endsWith('.0') ? String(Math.round(x)) : s;
}
