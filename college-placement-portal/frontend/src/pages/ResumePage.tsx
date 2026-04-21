import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    FileText, Upload, Trash2, ExternalLink, CheckCircle2, AlertCircle,
    Clock, Tag, ToggleLeft, ToggleRight, FileUp, X, Sparkles, Loader2,
    ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader, { LayoutContainer } from '../components/layout/PageHeader';
import { getViteApiBase, getViteApiOrigin } from '../utils/apiBase';
import {
    inferIssueSeverity,
    isStructuredAtsSuggestion,
    parseAtsSuggestion,
    parseStrengthBullets,
    severityStyles,
    type IssueSeverity,
} from '../utils/atsDisplay';

const detailPreviewHeight = 520;

/** Backend origin for static links (e.g. /uploads). Empty in dev → same-origin + Vite /uploads proxy. */
function uploadsBase(): string {
    return getViteApiOrigin().replace(/\/+$/, '');
}

interface Resume {
    id: string;
    roleName: string | null;
    fileName: string;
    fileUrl: string;
    isActive: boolean;
    createdAt: string;
}

interface AtsAnalysisResult {
    score: number;
    explanation: string;
    strengths: string[];
    suggestions: string[];
    /** llm = Qwen via OpenRouter (or legacy openai); fallback = offline / error */
    engine?: 'llm' | 'openai' | 'fallback';
}

interface CompanyRoleRecommendation {
    company: string;
    role: string;
    workType: string | null;
    jobDescription: string | null;
    responsibilities: string | null;
    benefits: string | null;
    companySector: string | null;
    experienceRequired: string;
}

function ResumeDocumentPreview({
    resume: r,
    apiOrigin,
    height,
}: {
    resume: Resume;
    apiOrigin: string;
    height: number;
}) {
    const [imageLoadFailed, setImageLoadFailed] = useState(false);
    useEffect(() => {
        setImageLoadFailed(false);
    }, [r.id, r.fileUrl]);
    const fileLower = (r.fileUrl || '').toLowerCase();
    const isPdf = fileLower.endsWith('.pdf');
    const isImage = /\.(png|jpe?g|webp)$/.test(fileLower);
    const src = `${apiOrigin}${r.fileUrl || ''}`;

    if (!r.fileUrl) {
        return (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <FileText className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
                <p className="text-sm font-semibold text-slate-600">Preview unavailable</p>
            </div>
        );
    }

    if (isPdf) {
        return (
            <iframe
                src={src}
                title={`Resume: ${r.fileName}`}
                className="w-full border-0 bg-white"
                style={{ height }}
            />
        );
    }

    if (isImage) {
        return imageLoadFailed ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <FileText className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
                <p className="text-sm font-semibold text-slate-600">Preview unavailable</p>
            </div>
        ) : (
            <img
                src={src}
                alt={`Resume: ${r.fileName}`}
                className="h-full w-full object-contain bg-slate-50"
                style={{ maxHeight: height }}
                onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    setImageLoadFailed(true);
                }}
            />
        );
    }

    return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <FileText className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
            <p className="text-sm font-semibold text-slate-600">Preview unavailable</p>
        </div>
    );
}

function AtsAnalysisPanel({
    resumeId,
    analyzingResumeId,
    analysisElapsed,
    onAnalyze,
    onCancel,
    analysisByResume,
    detailCollapsed,
    onToggleDetailCollapsed,
    streamStatus,
}: {
    resumeId: string;
    analyzingResumeId: string | null;
    analysisElapsed: number;
    onAnalyze: (id: string) => void;
    onCancel: (id: string) => void;
    analysisByResume: Record<string, AtsAnalysisResult | null>;
    detailCollapsed: boolean;
    onToggleDetailCollapsed: () => void;
    /** Live backend phase message while NDJSON stream is in progress */
    streamStatus?: string | null;
}) {
    const result = analysisByResume[resumeId];
    const showCollapse = Boolean(result);
    return (
        <div
            className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white p-5 shadow-sm"
            data-testid="resume-ats-section"
        >
            <div className="flex flex-col gap-4 border-b border-violet-100 pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div>
                    <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-900">
                        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                        ATS score (resume only)
                    </p>
                    <p className="max-w-xl text-[11px] leading-relaxed text-slate-600">
                        Absolute score for how ATS-ready this resume is (0–100). It is not compared to any job.
                        Role-specific match appears when you apply to a job.
                    </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    {showCollapse && (
                        <button
                            type="button"
                            onClick={onToggleDetailCollapsed}
                            aria-expanded={!detailCollapsed}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition-colors hover:bg-violet-50 sm:w-auto"
                        >
                            {detailCollapsed ? (
                                <>
                                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                                    Show ATS details
                                </>
                            ) : (
                                <>
                                    <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                                    Hide ATS details
                                </>
                            )}
                        </button>
                    )}
                    <button
                        type="button"
                        data-testid="analyze-resume-button"
                        disabled={analyzingResumeId === resumeId}
                        onClick={() => onAnalyze(resumeId)}
                        className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-800 disabled:opacity-60 sm:w-auto"
                    >
                        {analyzingResumeId === resumeId ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                Analyzing…
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4" aria-hidden />
                                Get ATS score
                            </>
                        )}
                    </button>
                    {analyzingResumeId === resumeId && (
                        <button
                            type="button"
                            onClick={() => onCancel(resumeId)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm transition-colors hover:bg-rose-100 sm:w-auto"
                        >
                            <X className="h-4 w-4" aria-hidden />
                            Cancel ATS
                        </button>
                    )}
                </div>
                {analyzingResumeId === resumeId && (
                    <p className="basis-full text-xs text-slate-500 mt-1 sm:order-last">
                        {streamStatus ? (
                            <span className="block font-medium text-violet-700/90">{streamStatus}</span>
                        ) : null}
                        <span className="block">
                            Analyzing... {analysisElapsed}s
                            {analysisElapsed > 30 ? ' (this may take up to 3 min)' : ''}
                        </span>
                    </p>
                )}
            </div>
            {result && detailCollapsed && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-sm text-violet-950">
                    <span className="text-xs font-semibold uppercase tracking-wide text-violet-800">Summary</span>
                    <span className="text-lg font-bold tabular-nums text-violet-700">{Math.round(result.score)}</span>
                    <span className="text-xs text-violet-700">/ 100</span>
                    <span className="text-xs text-violet-600">Expand for strengths, suggestions, and detail.</span>
                </div>
            )}
            {result && !detailCollapsed && (
                <div
                    className="mt-4 space-y-3 rounded-xl border border-slate-200/80 bg-white/95 p-4 text-sm shadow-sm"
                    data-testid="resume-ats-results"
                    data-ats-engine={result.engine ?? ''}
                >
                    <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-3xl font-bold tabular-nums text-violet-700">
                            {Math.round(result.score)}
                        </span>
                        <span className="text-xs text-slate-500">/ 100 · standalone ATS readiness</span>
                        {result.engine === 'llm' || result.engine === 'openai' ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                                AI analysis
                            </span>
                        ) : result.engine === 'fallback' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                Offline estimate
                            </span>
                        ) : null}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600">{result.explanation}</p>
                    {result.strengths.length > 0 && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                Strengths
                            </p>
                            <ul className="space-y-2.5 text-sm text-slate-800">
                                {result.strengths.map((s, i) => {
                                    const { main, subs } = parseStrengthBullets(s);
                                    return (
                                        <li key={`st-${resumeId}-${i}`} className="pl-1">
                                            <div className="flex gap-2">
                                                <span
                                                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                                                    aria-hidden
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium leading-snug text-slate-900">{main}</p>
                                                    {subs.length > 0 && (
                                                        <ul className="ml-4 mt-2 list-[circle] space-y-1.5 text-xs text-slate-600 marker:text-emerald-500">
                                                            {subs.map((sub, j) => (
                                                                <li
                                                                    key={`st-${resumeId}-${i}-sub-${j}`}
                                                                    className="leading-relaxed pl-0.5"
                                                                >
                                                                    {sub}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    {result.suggestions.length > 0 && (
                        <div className="rounded-xl border border-amber-100 bg-white p-3">
                            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Suggestions
                                </p>
                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                    <span
                                        className={clsx(
                                            'rounded px-1.5 py-0.5 font-semibold',
                                            severityStyles.high.badge,
                                        )}
                                    >
                                        High
                                    </span>
                                    <span
                                        className={clsx(
                                            'rounded px-1.5 py-0.5 font-semibold',
                                            severityStyles.medium.badge,
                                        )}
                                    >
                                        Medium
                                    </span>
                                    <span
                                        className={clsx(
                                            'rounded px-1.5 py-0.5 font-semibold',
                                            severityStyles.low.badge,
                                        )}
                                    >
                                        Low
                                    </span>
                                </div>
                            </div>
                            <ul className="space-y-3">
                                {result.suggestions.map((raw, i) => {
                                    const parsed = parseAtsSuggestion(raw);
                                    const structured = isStructuredAtsSuggestion(raw);
                                    const issueText = parsed?.issue ?? raw;
                                    const sev: IssueSeverity = inferIssueSeverity(issueText);
                                    const st = severityStyles[sev];
                                    return (
                                        <li
                                            key={`sg-${resumeId}-${i}`}
                                            className={clsx(
                                                'rounded-r-lg border-l-4 py-2.5 pl-3 pr-2 shadow-sm',
                                                st.border,
                                                st.bg,
                                            )}
                                        >
                                            {structured && parsed ? (
                                                <>
                                                    <p className={clsx('mb-1.5 text-xs', st.issueLabel)}>
                                                        <span className="text-[10px] font-bold uppercase tracking-wide opacity-90">
                                                            Issue ·{' '}
                                                        </span>
                                                        <span className="font-normal leading-relaxed text-slate-900">
                                                            {issueText}
                                                        </span>
                                                    </p>
                                                    {parsed.correction && (
                                                        <div className="mb-1.5 text-xs text-slate-800">
                                                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                                                Correction ·{' '}
                                                            </span>
                                                            <span className="leading-relaxed">{parsed.correction}</span>
                                                        </div>
                                                    )}
                                                    {parsed.example && (
                                                        <div className="mt-1 border-t border-black/5 pt-2 text-xs">
                                                            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-800">
                                                                Example ·{' '}
                                                            </span>
                                                            <span className="mt-0.5 block border-l-2 border-violet-200 pl-2 not-italic leading-relaxed text-slate-700">
                                                                {parsed.example}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-xs leading-relaxed text-slate-900">{raw}</p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CompanyRecommendationPanel({
    resumeId,
    recommendingResumeId,
    onRecommend,
    onCancelRecommend,
    recommendationsByResume,
    hasFetchedRecommendationsByResume,
    detailCollapsed,
    onToggleDetailCollapsed,
}: {
    resumeId: string;
    recommendingResumeId: string | null;
    onRecommend: (id: string) => void;
    onCancelRecommend: (id: string) => void;
    recommendationsByResume: Record<string, CompanyRoleRecommendation[]>;
    hasFetchedRecommendationsByResume: Record<string, boolean>;
    detailCollapsed: boolean;
    onToggleDetailCollapsed: () => void;
}) {
    const recommendations = recommendationsByResume[resumeId] || [];
    const hasFetchedRecommendations = Boolean(hasFetchedRecommendationsByResume[resumeId]);
    const streamActive = recommendingResumeId === resumeId;
    /**
     * Show this block while streaming, after a completed fetch, or whenever we already have rows.
     * Do NOT tie visibility only to `hasFetched` during an in-flight request — setting `hasFetched` early
     * before NDJSON lines are applied left `hasFetched === true` with an empty list and surfaced the
     * empty-state panel incorrectly.
     */
    const showRecommendationsUi =
        hasFetchedRecommendations || streamActive || recommendations.length > 0;

    return (
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-sky-100 pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div>
                    <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-900">
                        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                        Quick company ranking
                    </p>
                    <p className="max-w-xl text-[11px] leading-relaxed text-slate-600">
                        Fast deterministic ranking from resume skills (including project skills) against job catalog.
                    </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    {showRecommendationsUi && (
                        <button
                            type="button"
                            onClick={onToggleDetailCollapsed}
                            aria-expanded={!detailCollapsed}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition-colors hover:bg-sky-50 sm:w-auto"
                        >
                            {detailCollapsed ? (
                                <>
                                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                                    Show recommendations
                                </>
                            ) : (
                                <>
                                    <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                                    Hide recommendations
                                </>
                            )}
                        </button>
                    )}
                    <button
                        type="button"
                        data-testid="recommend-companies-button"
                        disabled={streamActive}
                        onClick={() => onRecommend(resumeId)}
                        className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-60 sm:w-auto"
                    >
                        {streamActive ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                Ranking...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4" aria-hidden />
                                Run quick ranking
                            </>
                        )}
                    </button>
                    {streamActive && (
                        <button
                            type="button"
                            onClick={() => onCancelRecommend(resumeId)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm transition-colors hover:bg-rose-100 sm:w-auto"
                        >
                            <X className="h-4 w-4" aria-hidden />
                            Cancel fetch
                        </button>
                    )}
                </div>
            </div>

            {showRecommendationsUi && detailCollapsed && recommendations.length > 0 && (
                <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-sm text-sky-950">
                    <span className="font-semibold tabular-nums">{recommendations.length}</span>
                    <span className="text-sky-800">
                        {' '}
                        role match{recommendations.length === 1 ? '' : 'es'}
                        {streamActive ? ' so far — expand for live details.' : ' loaded — expand to review companies and fit.'}
                    </span>
                </div>
            )}
            {showRecommendationsUi &&
                detailCollapsed &&
                hasFetchedRecommendations &&
                !streamActive &&
                recommendations.length === 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    No matches from the last run — expand for tips, or run recommendations again.
                </div>
            )}

            {showRecommendationsUi && !detailCollapsed && recommendations.length > 0 && (
                <div
                    className="mt-4 rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-sm"
                    data-testid="company-recommendations-live-list"
                >
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Top matches
                    </p>
                    <ul className="space-y-2">
                        {recommendations.map((r, i) => (
                            <li
                                key={`${resumeId}-${r.company}-${r.role}-${i}`}
                                className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <span className="text-sm font-semibold text-slate-900">{r.company}</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                                            {r.role}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    {r.companySector && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                            {r.companySector}
                                        </span>
                                    )}
                                    {r.workType && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                            {r.workType}
                                        </span>
                                    )}
                                </div>
                                {r.benefits && (
                                    <p className="mt-2 text-xs leading-relaxed text-slate-700">
                                        <span className="font-semibold text-slate-800">Benefits: </span>
                                        {r.benefits}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {showRecommendationsUi &&
                !detailCollapsed &&
                hasFetchedRecommendations &&
                !streamActive &&
                recommendations.length === 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-600 shadow-sm">
                    No company-role matches found for this resume yet. Try adding more skills or a target role, then run
                    recommendations again.
                </div>
            )}
        </div>
    );
}

export default function ResumePage() {
    const { token } = useAuth();
    const [resumes, setResumes] = useState<Resume[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [roleName, setRoleName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [dragOver, setDragOver] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    /** Prevents double-submit and shows progress on Confirm delete. */
    const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [analysisByResume, setAnalysisByResume] = useState<Record<string, AtsAnalysisResult | null>>({});
    const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);
    const [analysisElapsed, setAnalysisElapsed] = useState(0);
    const analysisTimerRef = useRef<number | null>(null);
    const atsAbortRef = useRef<Record<string, AbortController>>({});
    const [recommendationsByResume, setRecommendationsByResume] = useState<Record<string, CompanyRoleRecommendation[]>>({});
    const [recommendingResumeId, setRecommendingResumeId] = useState<string | null>(null);
    const recommendAbortRef = useRef<Record<string, AbortController>>({});
    const recommendHotCacheRef = useRef<Map<string, { expiresAt: number; items: CompanyRoleRecommendation[] }>>(new Map());
    const [hasFetchedRecommendationsByResume, setHasFetchedRecommendationsByResume] = useState<Record<string, boolean>>({});
    /** When true, long ATS results are hidden (per resume id). */
    const [atsDetailCollapsedByResume, setAtsDetailCollapsedByResume] = useState<Record<string, boolean>>({});
    /** When true, recommendation list / empty state is hidden (per resume id). */
    const [recommendDetailCollapsedByResume, setRecommendDetailCollapsedByResume] = useState<Record<string, boolean>>({});
    const [atsStreamStatusByResume, setAtsStreamStatusByResume] = useState<Record<string, string | null>>({});

    const headers = { Authorization: `Bearer ${token}` };
    const clearMessages = (isError = false) => {
        setTimeout(() => {
            setSuccess('');
            setError('');
        }, isError ? 8000 : 3000);
    };

    const recommendCacheKey = (resumeId: string, roleFilter: string) =>
        `v5|${resumeId}|${roleFilter.trim().toLowerCase()}`;

    useEffect(() => {
        return () => {
            Object.values(atsAbortRef.current).forEach((c) => c.abort());
            Object.values(recommendAbortRef.current).forEach((c) => c.abort());
        };
    }, []);

    const fetchResumes = async (opts?: { quiet?: boolean }) => {
        try {
            const res = await axios.get(`${getViteApiBase()}/student/resumes`, {
                headers,
                params: { _t: Date.now() },
            });
            setResumes(res.data.data || []);
        } catch (err: any) {
            if (!opts?.quiet) {
                setError(err.response?.data?.message || 'Failed to fetch resumes.');
                clearMessages(true);
            } else {
                console.warn('[ResumePage] fetchResumes (quiet) failed:', err?.response?.data?.message || err?.message);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchResumes(); }, [token]);

    useEffect(() => {
        if (resumes.length === 0) {
            setSelectedId(null);
            return;
        }
        setSelectedId((prev) =>
            prev && resumes.some((r) => r.id === prev) ? prev : resumes[0].id,
        );
    }, [resumes]);

    const selectedResume = resumes.find((r) => r.id === selectedId) ?? null;

    const cancelAnalyzeResume = (resumeId: string) => {
        const controller = atsAbortRef.current[resumeId];
        if (!controller) return;
        controller.abort();
        delete atsAbortRef.current[resumeId];
        if (analysisTimerRef.current) {
            window.clearInterval(analysisTimerRef.current);
            analysisTimerRef.current = null;
        }
        setAnalysisElapsed(0);
        setAnalyzingResumeId(null);
        setAtsStreamStatusByResume((prev) => ({ ...prev, [resumeId]: null }));
        setSuccess('ATS analysis cancelled.');
        clearMessages();
    };

    const handleAnalyzeResume = async (resumeId: string) => {
        if (!token) {
            setError('Not signed in. Please log in again.');
            clearMessages(true);
            return;
        }
        setError('');
        setSuccess('');
        setAnalyzingResumeId(resumeId);
        setAtsStreamStatusByResume((prev) => ({ ...prev, [resumeId]: 'Starting…' }));
        setAnalysisElapsed(0);
        analysisTimerRef.current = window.setInterval(() => {
            setAnalysisElapsed((prev) => prev + 1);
        }, 1000);
        const controller = new AbortController();
        atsAbortRef.current[resumeId] = controller;
        try {
            const res = await fetch(`${getViteApiBase()}/ats/score-absolute?stream=1`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ resumeId, stream: true }),
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                throw new Error('ATS stream unavailable');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let gotFinal = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const raw of lines) {
                    const line = raw.trim();
                    if (!line) continue;
                    let msg: any;
                    try {
                        msg = JSON.parse(line);
                    } catch {
                        continue;
                    }
                    if (msg.type === 'status' && msg.message) {
                        setAtsStreamStatusByResume((prev) => ({ ...prev, [resumeId]: String(msg.message) }));
                        continue;
                    }
                    if (msg.type === 'error') {
                        throw new Error(String(msg.message || 'ATS stream failed'));
                    }
                    if (msg.type === 'done' && msg.data) {
                        const d = msg.data;
                        setAnalysisByResume((prev) => ({
                            ...prev,
                            [resumeId]: {
                                score: typeof d.score === 'number' ? d.score : 0,
                                explanation: d.explanation ?? '',
                                strengths: Array.isArray(d.strengths) ? d.strengths : [],
                                suggestions: Array.isArray(d.suggestions) ? d.suggestions : [],
                                engine:
                                    d.engine === 'llm' || d.engine === 'openai' || d.engine === 'fallback'
                                        ? d.engine
                                        : undefined,
                            },
                        }));
                        gotFinal = true;
                    }
                }
            }

            if (gotFinal) {
                setAtsDetailCollapsedByResume((prev) => ({ ...prev, [resumeId]: false }));
                setSuccess('Standalone ATS score ready.');
                clearMessages();
            } else {
                throw new Error('ATS result missing from stream.');
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                return;
            }
            setError(err?.message || 'Could not analyze resume. Try again.');
            clearMessages(true);
        } finally {
            if (analysisTimerRef.current) {
                window.clearInterval(analysisTimerRef.current);
                analysisTimerRef.current = null;
            }
            delete atsAbortRef.current[resumeId];
            setAnalysisElapsed(0);
            setAnalyzingResumeId(null);
            setAtsStreamStatusByResume((prev) => ({ ...prev, [resumeId]: null }));
        }
    };

    const cancelRecommendCompanies = (resumeId: string) => {
        const controller = recommendAbortRef.current[resumeId];
        if (!controller) return;
        controller.abort();
        delete recommendAbortRef.current[resumeId];
        setRecommendingResumeId(null);
        setSuccess('Quick ranking cancelled.');
        clearMessages();
    };

    const handleRecommendCompanies = async (resumeId: string) => {
        if (!token) {
            setError('Not signed in. Please log in again.');
            clearMessages(true);
            return;
        }
        const requestedLimit = 10;
        setError('');
        setSuccess('');
        setRecommendingResumeId(resumeId);
        setHasFetchedRecommendationsByResume((prev) => ({ ...prev, [resumeId]: false }));
        setRecommendationsByResume((prev) => ({ ...prev, [resumeId]: [] }));
        setRecommendDetailCollapsedByResume((prev) => ({ ...prev, [resumeId]: false }));
        const roleFilter = '';
        const cacheKey = recommendCacheKey(resumeId, roleFilter);
        const cached = recommendHotCacheRef.current.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            const quick = cached.items.slice(0, requestedLimit);
            setRecommendationsByResume((prev) => ({ ...prev, [resumeId]: quick }));
            setHasFetchedRecommendationsByResume((prev) => ({ ...prev, [resumeId]: true }));
            setRecommendingResumeId(null);
            setSuccess('Loaded cached quick ranking.');
            clearMessages();
            return;
        }
        const controller = new AbortController();
        recommendAbortRef.current[resumeId] = controller;
        try {
            const qs = new URLSearchParams({
                resumeId,
                limit: String(requestedLimit),
            });
            const res = await fetch(`${getViteApiBase()}/student/recommend-companies?${qs.toString()}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Quick ranking failed');
            }
            const payload = await res.json();
            if (!payload?.success || !Array.isArray(payload?.data)) {
                throw new Error(payload?.message || 'Quick ranking failed');
            }
            const mapped = payload.data
                .map((item: any) => ({
                    company: String(item?.company || '').trim(),
                    role: String(item?.role || '').trim(),
                    workType: item?.workType ? String(item.workType).trim() : null,
                    jobDescription: item?.jobDescription ? String(item.jobDescription).trim() : null,
                    responsibilities: item?.responsibilities ? String(item.responsibilities).trim() : null,
                    benefits: item?.benefits ? String(item.benefits).trim() : null,
                    companySector: item?.companySector ? String(item.companySector).trim() : null,
                    experienceRequired: item?.experienceRequired
                        ? String(item.experienceRequired).trim()
                        : 'Experience not specified',
                }))
                .filter((item: CompanyRoleRecommendation) => item.company.length > 0 && item.role.length > 0)
                .slice(0, 10);

            setRecommendationsByResume((prev) => ({ ...prev, [resumeId]: mapped }));
            setHasFetchedRecommendationsByResume((prev) => ({ ...prev, [resumeId]: true }));
            setRecommendDetailCollapsedByResume((prev) => ({ ...prev, [resumeId]: false }));
            if (mapped.length > 0) {
                recommendHotCacheRef.current.set(cacheKey, {
                    expiresAt: Date.now() + 10 * 60 * 1000,
                    items: mapped,
                });
                setSuccess('Quick ranking is ready.');
                clearMessages();
            } else {
                setError('No recommendations found for this resume right now.');
                clearMessages(true);
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            setHasFetchedRecommendationsByResume((prev) => ({ ...prev, [resumeId]: false }));
            setRecommendationsByResume((prev) => ({ ...prev, [resumeId]: [] }));
            setError(err?.message || 'Could not fetch quick ranking.');
            clearMessages(true);
        } finally {
            delete recommendAbortRef.current[resumeId];
            setRecommendingResumeId(null);
        }
    };

    const handleUpload = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!file) { setError('Please select a PDF file.'); return; }
        setError(''); setSuccess(''); setUploading(true); setUploadProgress(0);
        const data = new FormData();
        data.append('resume', file);
        data.append('roleName', roleName);
        try {
            await axios.post(`${getViteApiBase()}/student/resume`, data, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
                },
            });
            setSuccess('Resume uploaded successfully!');
            setFile(null); setRoleName(''); setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchResumes();
            clearMessages();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to upload. PDF only, max 5MB.');
            clearMessages(true);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!token) {
            setError('Not signed in. Please log in again.');
            clearMessages(true);
            return;
        }
        if (deletingResumeId) return;

        const authHeaders = { Authorization: `Bearer ${token}` };
        const encodedId = encodeURIComponent(id);
        setDeletingResumeId(id);
        setError('');
        setSuccess('');
        try {
            await axios.delete(`${getViteApiBase()}/student/resume/${encodedId}`, {
                headers: authHeaders,
                timeout: 20000,
            });
            setDeleteConfirm(null);
            setResumes((prev) => prev.filter((r) => r.id !== id));
            setAnalysisByResume((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            setRecommendationsByResume((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            setSuccess('Resume deleted.');
            // Do not treat a post-delete list refresh failure as "delete failed" (misleading UX).
            await fetchResumes({ quiet: true });
            clearMessages();
        } catch (err: any) {
            setDeleteConfirm(null);
            setError(err.response?.data?.message || err.message || 'Delete failed.');
            clearMessages(true);
        } finally {
            setDeletingResumeId(null);
        }
    };

    const handleToggleActive = async (id: string) => {
        try {
            const res = await axios.put(`${getViteApiBase()}/student/resume/${id}/active`, {}, { headers });
            setResumes(prev => prev.map(r => r.id === id ? { ...r, isActive: res.data.data.isActive } : r));
        } catch {
            setError('Failed to update resume status.');
            clearMessages(true);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile && droppedFile.type === 'application/pdf') {
            setFile(droppedFile);
        } else {
            setError('Only PDF files are accepted.');
            clearMessages(true);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
    const handleDragLeave = useCallback(() => setDragOver(false), []);

    if (loading) {
        return (
            <LayoutContainer className="space-y-6">
                <div className="space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="h-9 max-w-md animate-pulse rounded-lg bg-slate-200" />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
                    <div className="space-y-4 lg:col-span-4 xl:col-span-3">
                        <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
                        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
                    </div>
                    <div className="h-[min(560px,70vh)] animate-pulse rounded-2xl border border-slate-200 bg-white lg:col-span-8 xl:col-span-9" />
                </div>
            </LayoutContainer>
        );
    }

    return (
        <LayoutContainer className="space-y-6 lg:space-y-8">
            <PageHeader
                title="Resume Manager"
                subtitle={`${resumes.length} resume${resumes.length !== 1 ? 's' : ''} on file · PDF uploads for placement records`}
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resumes' }]}
            />

            <AnimatePresence>
                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
                        role="status"
                    >
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        {success}
                    </motion.div>
                )}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800"
                        role="alert"
                    >
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{error}</span>
                        <button
                            type="button"
                            onClick={() => {
                                setError('');
                                fetchResumes();
                            }}
                            className="ml-3 text-xs font-semibold text-red-700 underline hover:no-underline"
                        >
                            Retry
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
                <aside className="space-y-5 lg:col-span-4 xl:col-span-3">
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                        <h3 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-slate-900">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                                <Upload className="h-4 w-4" aria-hidden />
                            </span>
                            Upload new resume
                        </h3>

                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => !file && fileInputRef.current?.click()}
                            className={clsx(
                                'relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all sm:p-8',
                                dragOver
                                    ? 'border-primary-400 bg-primary-50/60'
                                    : file
                                      ? 'border-emerald-300 bg-emerald-50/40'
                                      : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white',
                            )}
                        >
                            <input
                                ref={fileInputRef}
                                id="resumeFileInput"
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                            />

                            {file ? (
                                <div className="flex items-center justify-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                                        <FileText className="h-6 w-6 text-emerald-700" aria-hidden />
                                    </div>
                                    <div className="min-w-0 flex-1 text-left">
                                        <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                                        <p className="text-xs text-slate-500">
                                            {(file.size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                        aria-label="Remove selected file"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
                                        <FileUp className="h-6 w-6 text-primary-600" aria-hidden />
                                    </div>
                                    <p className="mb-1 text-sm font-medium text-slate-800">
                                        {dragOver ? 'Drop your PDF here' : 'Drag and drop your resume'}
                                    </p>
                                    <p className="text-xs text-slate-500">Click to browse · PDF only · Max 5 MB</p>
                                </>
                            )}
                        </div>

                        {uploading && (
                            <div className="mt-4">
                                <div className="mb-1 flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Uploading…</span>
                                    <span className="font-semibold text-primary-700">{uploadProgress}%</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${uploadProgress}%` }}
                                        className="h-full rounded-full bg-primary-600"
                                    />
                                </div>
                            </div>
                        )}

                        {file && !uploading && (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label
                                        htmlFor="resumeRoleInput"
                                        className="mb-1.5 block text-sm font-medium text-slate-700"
                                    >
                                        Target role (optional)
                                    </label>
                                    <input
                                        id="resumeRoleInput"
                                        value={roleName}
                                        onChange={(e) => setRoleName(e.target.value)}
                                        placeholder="e.g. SDE, Data Analyst, Frontend Dev"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleUpload()}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800"
                                >
                                    <Upload className="h-4 w-4" aria-hidden />
                                    Upload resume
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="font-display text-base font-semibold text-slate-900">My Resumes</h3>
                            <span className="text-xs font-medium text-slate-400">
                                {resumes.length} file{resumes.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        {resumes.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 py-12 text-center">
                                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                                    <FileText className="h-6 w-6 text-slate-300" aria-hidden />
                                </div>
                                <p className="text-sm font-medium text-slate-600">No resumes yet</p>
                                <p className="mt-1 text-xs text-slate-500">Upload a PDF to preview and run ATS analysis</p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {resumes.map((r) => {
                                    const ats = analysisByResume[r.id];
                                    const selected = r.id === selectedId;
                                    return (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(r.id)}
                                                aria-pressed={selected}
                                                className={clsx(
                                                    'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                                                    selected
                                                        ? 'border-primary-300 bg-primary-50/50 shadow-sm ring-1 ring-primary-200'
                                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80',
                                                )}
                                            >
                                                <div
                                                    className={clsx(
                                                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                                                        r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                                                    )}
                                                >
                                                    <FileText className="h-5 w-5" aria-hidden />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-slate-900">
                                                        {r.fileName}
                                                    </p>
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        {r.isActive && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                                                                Active
                                                            </span>
                                                        )}
                                                        {r.roleName && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                                                <Tag className="h-3 w-3" aria-hidden />
                                                                {r.roleName}
                                                            </span>
                                                        )}
                                                        {ats && (
                                                            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-900">
                                                                ATS {Math.round(ats.score)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                                                        <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                                        {new Date(r.createdAt).toLocaleDateString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric',
                                                        })}
                                                    </p>
                                                </div>
                                                <ChevronRight
                                                    className={clsx(
                                                        'mt-1 h-4 w-4 shrink-0',
                                                        selected ? 'text-primary-700' : 'text-slate-300',
                                                    )}
                                                    aria-hidden
                                                />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </aside>

                <section className="min-h-0 space-y-5 lg:col-span-8 xl:col-span-9">
                    {!selectedResume ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
                            <FileText className="mb-3 h-12 w-12 text-slate-300" aria-hidden />
                            <p className="text-sm font-semibold text-slate-700">No document selected</p>
                            <p className="mt-1 max-w-sm text-xs text-slate-500">
                                Upload a resume and select it from the list to open the preview and ATS workspace.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                                <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-6">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                Selected document
                                            </p>
                                            <h2 className="mt-1 truncate font-display text-lg font-bold text-slate-900">
                                                {selectedResume.fileName}
                                            </h2>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {selectedResume.isActive ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                                                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                                        Active for applications
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                                        Inactive
                                                    </span>
                                                )}
                                                {selectedResume.roleName && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-900">
                                                        <Tag className="h-3.5 w-3.5" aria-hidden />
                                                        {selectedResume.roleName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <a
                                                href={
                                                    uploadsBase()
                                                        ? `${uploadsBase()}${selectedResume.fileUrl}`
                                                        : selectedResume.fileUrl
                                                }
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                                Open file
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleActive(selectedResume.id)}
                                                className={clsx(
                                                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm transition-colors',
                                                    selectedResume.isActive
                                                        ? 'border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                                        : 'border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
                                                )}
                                            >
                                                {selectedResume.isActive ? (
                                                    <ToggleRight className="h-3.5 w-3.5" aria-hidden />
                                                ) : (
                                                    <ToggleLeft className="h-3.5 w-3.5" aria-hidden />
                                                )}
                                                {selectedResume.isActive ? 'Deactivate' : 'Set active'}
                                            </button>
                                            {deleteConfirm === selectedResume.id ? (
                                                <span className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={deletingResumeId === selectedResume.id}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            void handleDelete(selectedResume.id);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {deletingResumeId === selectedResume.id ? (
                                                            <>
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                                Deleting…
                                                            </>
                                                        ) : (
                                                            'Confirm delete'
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={deletingResumeId === selectedResume.id}
                                                        onClick={() => setDeleteConfirm(null)}
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        Cancel
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteConfirm(selectedResume.id)}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="border-b border-slate-100 px-4 py-2 sm:px-6">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Document preview
                                    </p>
                                </div>
                                <div className="overflow-hidden bg-slate-100/80">
                                    <ResumeDocumentPreview
                                        resume={selectedResume}
                                        apiOrigin={getViteApiOrigin()}
                                        height={detailPreviewHeight}
                                    />
                                </div>
                            </div>

                            <AtsAnalysisPanel
                                resumeId={selectedResume.id}
                                analyzingResumeId={analyzingResumeId}
                                analysisElapsed={analysisElapsed}
                                onAnalyze={handleAnalyzeResume}
                                onCancel={cancelAnalyzeResume}
                                analysisByResume={analysisByResume}
                                detailCollapsed={atsDetailCollapsedByResume[selectedResume.id] ?? false}
                                onToggleDetailCollapsed={() =>
                                    setAtsDetailCollapsedByResume((prev) => ({
                                        ...prev,
                                        [selectedResume.id]: !prev[selectedResume.id],
                                    }))
                                }
                                streamStatus={atsStreamStatusByResume[selectedResume.id] ?? null}
                            />
                            <CompanyRecommendationPanel
                                resumeId={selectedResume.id}
                                recommendingResumeId={recommendingResumeId}
                                onRecommend={handleRecommendCompanies}
                                onCancelRecommend={cancelRecommendCompanies}
                                recommendationsByResume={recommendationsByResume}
                                hasFetchedRecommendationsByResume={hasFetchedRecommendationsByResume}
                                detailCollapsed={recommendDetailCollapsedByResume[selectedResume.id] ?? false}
                                onToggleDetailCollapsed={() =>
                                    setRecommendDetailCollapsedByResume((prev) => ({
                                        ...prev,
                                        [selectedResume.id]: !prev[selectedResume.id],
                                    }))
                                }
                            />
                        </>
                    )}
                </section>
            </div>
        </LayoutContainer>
    );
}
