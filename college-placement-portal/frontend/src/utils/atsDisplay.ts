/**
 * Parse ATS suggestion lines like:
 * "Issue: ... | Correction: ... | Example: ..."
 */
export interface ParsedAtsSuggestion {
    issue: string;
    correction?: string;
    example?: string;
}

/** True when the backend/LLM used the Issue | Correction | Example layout. */
export function isStructuredAtsSuggestion(text: string): boolean {
    const t = text.toLowerCase();
    return t.includes('|') && (t.includes('issue:') || t.includes('correction:') || t.includes('example:'));
}

export function parseAtsSuggestion(text: string): ParsedAtsSuggestion | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    let issue = '';
    let correction: string | undefined;
    let example: string | undefined;

    const parts = trimmed.split('|').map((p) => p.trim());
    for (const part of parts) {
        const lower = part.slice(0, 12).toLowerCase();
        if (lower.startsWith('issue:')) {
            issue = part.replace(/^issue:\s*/i, '').trim();
        } else if (lower.startsWith('correction:')) {
            correction = part.replace(/^correction:\s*/i, '').trim();
        } else if (lower.startsWith('example:')) {
            example = part.replace(/^example:\s*/i, '').trim();
        }
    }

    if (issue || correction || example) {
        return {
            issue: issue || trimmed,
            correction: correction || undefined,
            example: example || undefined,
        };
    }

    return { issue: trimmed };
}

/** Severity for colour grading (heuristic from issue wording). */
export type IssueSeverity = 'high' | 'medium' | 'low';

const HIGH_PATTERNS =
    /\b(missing|no\s|lacks?\s|absent|empty|critical|must\s|required|gap|not\s+(listed|mentioned|included)|incomplete|no\s+evidence|unclear\s+section|wrong\s+format|parse\s+fail)\b/i;
const LOW_PATTERNS =
    /\b(optional|minor|polish|formatting|typo|spacing|font|margin|nice-?to-?have|consider\s+adding|could\s+add|slightly)\b/i;

export function inferIssueSeverity(issueText: string): IssueSeverity {
    const t = issueText.trim();
    if (!t) return 'medium';
    if (HIGH_PATTERNS.test(t)) return 'high';
    if (LOW_PATTERNS.test(t)) return 'low';
    return 'medium';
}

export const severityStyles: Record<
    IssueSeverity,
    { border: string; bg: string; issueLabel: string; badge: string }
> = {
    high: {
        border: 'border-l-red-500',
        bg: 'bg-red-50/90',
        issueLabel: 'text-red-900',
        badge: 'bg-red-100 text-red-800 border border-red-200',
    },
    medium: {
        border: 'border-l-amber-500',
        bg: 'bg-amber-50/90',
        issueLabel: 'text-amber-950',
        badge: 'bg-amber-100 text-amber-900 border border-amber-200',
    },
    low: {
        border: 'border-l-sky-500',
        bg: 'bg-sky-50/90',
        issueLabel: 'text-sky-950',
        badge: 'bg-sky-100 text-sky-900 border border-sky-200',
    },
};

/** Split a strength string into a main line and optional sub-points (|, ;, or newline). */
export function parseStrengthBullets(text: string): { main: string; subs: string[] } {
    const raw = text.trim();
    if (!raw) return { main: '', subs: [] };

    if (raw.includes('|')) {
        const segs = raw.split('|').map((s) => s.trim()).filter(Boolean);
        return { main: segs[0] ?? raw, subs: segs.slice(1) };
    }

    const bySemi = raw.split(';').map((s) => s.trim()).filter(Boolean);
    if (bySemi.length > 1) {
        return { main: bySemi[0]!, subs: bySemi.slice(1) };
    }

    const byNl = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (byNl.length > 1) {
        return { main: byNl[0]!, subs: byNl.slice(1) };
    }

    return { main: raw, subs: [] };
}

/**
 * Strip redundant semantic/skill score sentences from job-match explanations
 * when those metrics are not shown in the UI.
 */
export function sanitizeJobMatchExplanation(text: string): string {
    if (!text?.trim()) return '';
    let t = text;
    t = t.replace(/\bSemantic:\s*\d+\s*%\.?\s*/gi, '');
    t = t.replace(/\bSkill\s*overlap:\s*\d+\s*%\.?\s*/gi, '');
    t = t.replace(/\bSkill:\s*\d+\s*%\.?\s*/gi, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t.replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
}
