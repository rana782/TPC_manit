import fs from 'fs';
import path from 'path';
import { normalizeEnvKey } from '../utils/env';

const NANONETS_SYNC_URL =
    normalizeEnvKey(process.env.NANONETS_EXTRACT_URL) ||
    'https://extraction-api.nanonets.com/api/v1/extract/sync';

const DEFAULT_TIMEOUT_MS = 60000;

export type DocumentExtractResult = {
    extracted_json: unknown;
    text: string;
};

export type ExtractOptions = {
    /** Override Nanonets client timeout (e.g. shorter for interactive ATS). */
    timeoutMs?: number;
    /** Log context: resume, jd, upload, etc. */
    context?: string;
};

export function getAtsNanonetsBudgetMs(): number {
    const v = Number(process.env.NANONETS_ATS_BUDGET_MS || '8000');
    if (Number.isFinite(v) && v > 0) return Math.min(120000, Math.max(2000, v));
    return 8000;
}

/** Longer budget for upload-time prefetch (still aborts so the HTTP handler does not hang forever). */
export function getUploadNanonetsBudgetMs(): number {
    const v = Number(process.env.NANONETS_UPLOAD_BUDGET_MS || '45000');
    if (Number.isFinite(v) && v > 0) return Math.min(120000, Math.max(3000, v));
    return 45000;
}

function shouldLogExtraction(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    return String(process.env.NANONETS_LOG || 'true').toLowerCase() !== 'false';
}

export function logDocumentExtraction(payload: Record<string, unknown>): void {
    if (!shouldLogExtraction()) return;
    console.log(JSON.stringify({ component: 'document_extraction', ts: new Date().toISOString(), ...payload }));
}

export function normalizeExtractedText(text: string): string {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function resolveUploadAbsolutePath(fileUrl: string): string | null {
    const baseName = path.basename(fileUrl || '');
    if (!baseName) return null;
    const candidates = [
        path.resolve(process.cwd(), 'uploads', baseName),
        path.resolve(__dirname, '../../uploads', baseName),
        path.resolve(__dirname, '../../../uploads', baseName),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function flattenJsonToLines(value: unknown, lines: string[]): void {
    if (value == null) return;
    if (typeof value === 'string') {
        const t = value.trim();
        if (t) lines.push(t);
        return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        lines.push(String(value));
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) flattenJsonToLines(item, lines);
        return;
    }
    if (typeof value === 'object') {
        for (const val of Object.values(value as Record<string, unknown>)) {
            flattenJsonToLines(val, lines);
        }
    }
}

function textFromNanonetsJsonBody(body: unknown): { json: unknown; text: string } | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (b.success !== true) return null;
    const result = b.result as Record<string, unknown> | undefined;
    if (!result || typeof result !== 'object') return null;
    const jsonBlock = result.json as Record<string, unknown> | undefined;
    if (!jsonBlock || typeof jsonBlock !== 'object') return null;
    const content = jsonBlock.content !== undefined ? jsonBlock.content : jsonBlock;
    const lines: string[] = [];
    flattenJsonToLines(content, lines);
    const text = normalizeExtractedText(lines.join('\n'));
    if (!text) return null;
    return { json: content, text };
}

function titleCaseKey(key: string): string {
    return String(key || '')
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSectionValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return normalizeExtractedText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        const parts = value.map((v) => formatSectionValue(v)).filter(Boolean);
        return parts.join(', ');
    }
    if (typeof value === 'object') {
        const inner = formatExtractedJsonForAts(value);
        return inner ? inner.replace(/\n/g, '; ') : '';
    }
    return '';
}

/** Turn Nanonets JSON into labeled lines for the ATS resume parser (before parseResumeWithLlm). */
export function formatExtractedJsonForAts(extractedJson: unknown): string {
    if (extractedJson == null) return '';
    if (typeof extractedJson === 'string') return normalizeExtractedText(extractedJson);
    if (typeof extractedJson === 'number' || typeof extractedJson === 'boolean') return String(extractedJson);
    if (Array.isArray(extractedJson)) {
        return normalizeExtractedText(
            extractedJson.map((x) => formatSectionValue(x)).filter(Boolean).join(' | ')
        );
    }
    if (typeof extractedJson !== 'object') return '';
    const lines: string[] = [];
    for (const [key, value] of Object.entries(extractedJson as Record<string, unknown>)) {
        const label = titleCaseKey(key);
        const body = formatSectionValue(value);
        if (body) lines.push(`${label}: ${body}`);
    }
    return lines.join('\n').trim();
}

/** Append structured extraction to flat text for downstream LLM parsing / scoring. */
export function enhanceResumeTextForAts(baseText: string, extractedJson: unknown | null | undefined): string {
    const base = String(baseText || '').trim();
    const block = formatExtractedJsonForAts(extractedJson ?? null);
    if (!block) return base;
    return `${base}\n\n--- Structured extraction ---\n${block}`.trim();
}

export type ResumeTextMetaForParser = {
    text: string;
    extractedJson: unknown | null;
};

export function buildResumeInputForAtsParser(meta: ResumeTextMetaForParser): string {
    return enhanceResumeTextForAts(meta.text, meta.extractedJson);
}

export async function extractFromAbsolutePath(
    absolutePath: string,
    options?: ExtractOptions
): Promise<DocumentExtractResult | null> {
    const started = Date.now();
    const ctx = options?.context || 'extract';
    const apiKey = normalizeEnvKey(process.env.NANONETS_API_KEY);
    if (!apiKey || !absolutePath || !fs.existsSync(absolutePath)) {
        logDocumentExtraction({ context: ctx, source: 'nanonets', success: false, timeMs: Date.now() - started, reason: 'no_key_or_file' });
        return null;
    }

    const configured = Number(process.env.NANONETS_EXTRACT_TIMEOUT_MS || '');
    const defaultCap = Number.isFinite(configured) && configured > 0
        ? Math.min(120000, Math.max(3000, configured))
        : DEFAULT_TIMEOUT_MS;
    const timeoutMs = options?.timeoutMs != null
        ? Math.min(120000, Math.max(2000, options.timeoutMs))
        : defaultCap;

    const buf = fs.readFileSync(absolutePath);
    const fileName = path.basename(absolutePath) || 'document.pdf';

    const form = new FormData();
    form.append('file', new Blob([buf]), fileName);
    form.append('output_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(NANONETS_SYNC_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
            signal: controller.signal,
        });

        if (!res.ok) {
            logDocumentExtraction({
                context: ctx,
                source: 'nanonets',
                success: false,
                timeMs: Date.now() - started,
                httpStatus: res.status,
            });
            return null;
        }

        let body: unknown;
        try {
            body = await res.json();
        } catch {
            logDocumentExtraction({
                context: ctx,
                source: 'nanonets',
                success: false,
                timeMs: Date.now() - started,
                reason: 'invalid_response_json',
            });
            return null;
        }

        const parsed = textFromNanonetsJsonBody(body);
        if (!parsed) {
            logDocumentExtraction({
                context: ctx,
                source: 'nanonets',
                success: false,
                timeMs: Date.now() - started,
                reason: 'unusable_extraction_payload',
            });
            return null;
        }

        logDocumentExtraction({
            context: ctx,
            source: 'nanonets',
            success: true,
            timeMs: Date.now() - started,
        });

        return {
            extracted_json: parsed.json,
            text: parsed.text,
        };
    } catch (err: unknown) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        logDocumentExtraction({
            context: ctx,
            source: 'nanonets',
            success: false,
            timeMs: Date.now() - started,
            reason: aborted ? 'timeout_or_abort' : 'request_error',
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function extractFromPublicFileUrl(
    fileUrl: string,
    options?: ExtractOptions
): Promise<DocumentExtractResult | null> {
    const abs = resolveUploadAbsolutePath(fileUrl);
    if (!abs) return null;
    return extractFromAbsolutePath(abs, options);
}
