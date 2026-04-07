/**
 * Backend default in this repo is often PORT=5001 (see backend/.env). Using 5000 here
 * caused the UI to call the wrong host — requests never reached the API and features
 * silently failed or looked "stuck on fallback".
 *
 * Dev: if VITE_API_URL is unset, return '' so requests go to the same origin as Vite
 * (e.g. http://localhost:3000/api/...) and the Vite proxy forwards to the backend.
 */
function normalizeViteApiOrigin(): string {
    const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

    if (import.meta.env.DEV && (raw === undefined || raw === '')) {
        return '';
    }

    const fallback = 'http://127.0.0.1:5001';
    const noTrail = (raw || fallback).replace(/\/+$/, '');
    return /\/api$/i.test(noTrail) ? noTrail.replace(/\/api$/i, '') : noTrail;
}

/** e.g. http://localhost:5001 — use with paths like `${origin}/api/...` */
export function getViteApiOrigin(): string {
    return normalizeViteApiOrigin();
}

/**
 * VITE_API_URL should be the API host only (e.g. http://localhost:5001).
 * Returns origin + /api with no duplicate /api segment.
 */
export function getViteApiBase(): string {
    return `${normalizeViteApiOrigin()}/api`;
}
