import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    FileText, Upload, Trash2, ExternalLink, CheckCircle2, AlertCircle,
    Clock, Tag, ToggleLeft, ToggleRight, FileUp, X, Sparkles, Loader2,
    ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader, { LayoutContainer } from '../components/layout/PageHeader';
import { getViteApiOrigin } from '../utils/apiBase';
import {
    inferIssueSeverity,
    isStructuredAtsSuggestion,
    parseAtsSuggestion,
    parseStrengthBullets,
    severityStyles,
    type IssueSeverity,
} from '../utils/atsDisplay';

const API = getViteApiOrigin();
const detailPreviewHeight = 520;

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
    analysisByResume,
}: {
    resumeId: string;
    analyzingResumeId: string | null;
    analysisElapsed: number;
    onAnalyze: (id: string) => void;
    analysisByResume: Record<string, AtsAnalysisResult | null>;
}) {
    const result = analysisByResume[resumeId];
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
                    <p className="basis-full text-xs text-slate-500 mt-1 sm:order-last">
                        Analyzing... {analysisElapsed}s{analysisElapsed > 30 ? ' (this may take up to 3 min)' : ''}
                    </p>
                )}
            </div>
            {result && (
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [analysisByResume, setAnalysisByResume] = useState<Record<string, AtsAnalysisResult | null>>({});
    const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);
    const [analysisElapsed, setAnalysisElapsed] = useState(0);
    const analysisTimerRef = useRef<number | null>(null);

    const headers = { Authorization: `Bearer ${token}` };
    const clearMessages = (isError = false) => {
        setTimeout(() => {
            setSuccess('');
            setError('');
        }, isError ? 8000 : 3000);
    };

    const fetchResumes = async () => {
        try {
            const res = await axios.get(`${API}/api/student/resumes`, { headers });
            setResumes(res.data.data || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to fetch resumes.');
            clearMessages(true);
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

    const handleAnalyzeResume = async (resumeId: string) => {
        setError('');
        setSuccess('');
        setAnalyzingResumeId(resumeId);
        setAnalysisElapsed(0);
        analysisTimerRef.current = window.setInterval(() => {
            setAnalysisElapsed((prev) => prev + 1);
        }, 1000);
        try {
            const res = await axios.post(
                `${API}/api/ats/score-absolute`,
                { resumeId },
                { headers, timeout: 180000 }
            );
            if (res.data?.success && res.data?.data) {
                const d = res.data.data;
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
                    }
                }));
                setSuccess('Standalone ATS score ready.');
                clearMessages();
            } else {
                setError(res.data?.message || 'Analysis failed.');
                clearMessages(true);
            }
        } catch (err: any) {
            if (err?.code === 'ECONNABORTED') {
                setError('ATS analysis is taking longer than expected. Please retry in a few seconds.');
            } else {
                setError(err.response?.data?.message || 'Could not analyze resume. Try again.');
            }
            clearMessages(true);
        } finally {
            if (analysisTimerRef.current) {
                window.clearInterval(analysisTimerRef.current);
                analysisTimerRef.current = null;
            }
            setAnalysisElapsed(0);
            setAnalyzingResumeId(null);
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
            await axios.post(`${API}/api/student/resume`, data, {
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
        try {
            await axios.delete(`${API}/api/student/resume/${id}`, { headers });
            setSuccess('Resume deleted.');
            setDeleteConfirm(null);
            fetchResumes();
            clearMessages();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Delete failed.');
            clearMessages(true);
        }
    };

    const handleToggleActive = async (id: string) => {
        try {
            const res = await axios.put(`${API}/api/student/resume/${id}/active`, {}, { headers });
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
                                                href={`${API}${selectedResume.fileUrl}`}
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
                                                        onClick={() => handleDelete(selectedResume.id)}
                                                        className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                                                    >
                                                        Confirm delete
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteConfirm(null)}
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
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
                                        apiOrigin={API}
                                        height={detailPreviewHeight}
                                    />
                                </div>
                            </div>

                            <AtsAnalysisPanel
                                resumeId={selectedResume.id}
                                analyzingResumeId={analyzingResumeId}
                                analysisElapsed={analysisElapsed}
                                onAnalyze={handleAnalyzeResume}
                                analysisByResume={analysisByResume}
                            />
                        </>
                    )}
                </section>
            </div>
        </LayoutContainer>
    );
}
