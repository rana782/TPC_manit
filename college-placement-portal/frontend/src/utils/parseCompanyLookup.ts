/** Express/JSON sometimes yields numeric fields as strings; keep UI tolerant. */
export function parseLookupRating(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

export function parseLookupReviews(value: unknown): number | null {
    const n = parseLookupRating(value);
    if (n === null) return null;
    const i = Math.round(n);
    return Number.isFinite(i) && i >= 0 ? i : null;
}
