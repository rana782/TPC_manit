import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    FileText, Upload, Trash2, ExternalLink, CheckCircle2, AlertCircle,
    Clock, Tag, ToggleLeft, ToggleRight, FileUp, X, Sparkles, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader from '../components/layout/PageHeader';
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
const resumePreviewHeight = 200;

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

export default function Resumes() {
    const { token } = useAuth();
    const [resumes, setResumes] = useState<Resume[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [roleName, setRoleName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [resumePreviewBroken, setResumePreviewBroken] = useState<Record<string, boolean>>({});
    const [dragOver, setDragOver] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [analysisByResume, setAnalysisByResume] = useState<Record<string, AtsAnalysisResult | null>>({});
    const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);

    const headers = { Authorization: `Bearer ${token}` };
    const clearMessages = () => { setTimeout(() => { setSuccess(''); setError(''); }, 3000); };

    const fetchResumes = async () => {
        try {
            const res = await axios.get(`${API}/api/student/resumes`, { headers });
            setResumes(res.data.data || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to fetch resumes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchResumes(); }, [token]);

    const handleAnalyzeResume = async (resumeId: string) => {
        setError('');
        setSuccess('');
        setAnalyzingResumeId(resumeId);
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
            }
        } catch (err: any) {
            if (err?.code === 'ECONNABORTED') {
                setError('ATS analysis is taking longer than expected. Please retry in a few seconds.');
            } else {
                setError(err.response?.data?.message || 'Could not analyze resume. Try again.');
            }
        } finally {
            setAnalyzingResumeId(null);
        }
    };

    // Reset broken-image fallback when the resume list updates (e.g., after upload)
    useEffect(() => { setResumePreviewBroken({}); }, [resumes]);

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
        }
    };

    const handleToggleActive = async (id: string) => {
        try {
            const res = await axios.put(`${API}/api/student/resume/${id}/active`, {}, { headers });
            setResumes(prev => prev.map(r => r.id === id ? { ...r, isActive: res.data.data.isActive } : r));
        } catch { setError('Failed to update resume status.'); }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile && droppedFile.type === 'application/pdf') {
            setFile(droppedFile);
        } else {
            setError('Only PDF files are accepted.');
            clearMessages();
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
    const handleDragLeave = useCallback(() => setDragOver(false), []);

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <>
            <PageHeader
                title="Resume Manager"
                subtitle={`${resumes.length} resume${resumes.length !== 1 ? 's' : ''} uploaded`}
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resumes' }]}
            />

            {/* Toast messages */}
            <AnimatePresence>
                {success && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{success}
                    </motion.div>
                )}
                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Upload zone */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <Upload className="w-4 h-4 text-primary-600" /> Upload New Resume
                </h3>

                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !file && fileInputRef.current?.click()}
                    className={clsx(
                        'relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
                        dragOver ? 'border-primary-400 bg-primary-50/50' :
                        file ? 'border-emerald-300 bg-emerald-50/30' :
                        'border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50'
                    )}
                >
                    <input
                        ref={fileInputRef}
                        id="resumeFileInput"
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={e => setFile(e.target.files?.[0] || null)}
                    />

                    {file ? (
                        <div className="flex items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-emerald-600" />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-semibold text-gray-900">{file.name}</p>
                                <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
                                <FileUp className="w-6 h-6 text-primary-500" />
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-1">
                                {dragOver ? 'Drop your PDF here' : 'Drag & drop your resume here'}
                            </p>
                            <p className="text-xs text-gray-400">or click to browse · PDF only · Max 5 MB</p>
                        </>
                    )}
                </div>

                {/* Upload progress */}
                {uploading && (
                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">Uploading...</span>
                            <span className="text-xs font-semibold text-primary-600">{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                className="h-1.5 rounded-full bg-primary-500"
                            />
                        </div>
                    </div>
                )}

                {/* Role input + upload button */}
                {file && !uploading && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mt-4"
                    >
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Target Role (optional)</label>
                            <input
                                id="resumeRoleInput"
                                value={roleName}
                                onChange={e => setRoleName(e.target.value)}
                                placeholder="e.g. SDE, Data Analyst, Frontend Dev"
                                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={() => handleUpload()}
                            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                        >
                            <Upload className="w-4 h-4" /> Upload Resume
                        </button>
                    </motion.div>
                )}
            </div>

            {/* Resume cards */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">
                        My Resumes
                    </h3>
                    <span className="text-xs font-medium text-gray-400">{resumes.length} file{resumes.length !== 1 ? 's' : ''}</span>
                </div>

                {resumes.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                            <FileText className="w-6 h-6 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-500 mb-1">No resumes yet</p>
                        <p className="text-xs text-gray-400">Upload your first resume to get started</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {resumes.map((r, i) => (
                            <motion.div
                                key={r.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.06 }}
                                className={clsx(
                                    'bg-white rounded-xl border overflow-hidden transition-all hover:shadow-md group',
                                    r.isActive ? 'border-emerald-200' : 'border-gray-200'
                                )}
                            >
                                {/* Card gradient header */}
                                <div className={clsx(
                                    'h-1.5',
                                    r.isActive ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-gray-200 to-gray-300'
                                )} />

                                <div className="p-5">
                                    {/* Top row: icon + info */}
                                    <div className="flex items-start gap-3.5 mb-4">
                                        <div className={clsx(
                                            'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
                                            r.isActive ? 'bg-emerald-50' : 'bg-gray-50'
                                        )}>
                                            <FileText className={clsx('w-5 h-5', r.isActive ? 'text-emerald-600' : 'text-gray-400')} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{r.fileName}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                {r.roleName && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                                                        <Tag className="w-3 h-3" />{r.roleName}
                                                    </span>
                                                )}
                                                {r.isActive && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                                        <CheckCircle2 className="w-3 h-3" />Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Date */}
                                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                                        <Clock className="w-3 h-3" />
                                        Uploaded {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </div>

                                    {/* Document Preview */}
                                    <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                                        <p className="text-xs font-medium text-gray-500 px-2 py-1 border-b border-gray-200">Preview</p>
                                        <div className="flex items-center justify-center min-h-[120px]" style={{ height: resumePreviewHeight }}>
                                            {(() => {
                                                const fileLower = (r.fileUrl || '').toLowerCase();
                                                const isPdf = fileLower.endsWith('.pdf');
                                                const isImage = /\.(png|jpe?g|webp)$/.test(fileLower);
                                                const src = `${API}${r.fileUrl || ''}`;

                                                if (!r.fileUrl) {
                                                    return (
                                                        <div className="flex flex-col items-center justify-center text-center px-4">
                                                            <FileText className="w-7 h-7 text-gray-300 mb-2" />
                                                            <p className="text-xs font-semibold text-gray-500">Preview unavailable</p>
                                                        </div>
                                                    );
                                                }

                                                if (isPdf) {
                                                    return (
                                                        <iframe
                                                            src={src}
                                                            title={`Resume: ${r.fileName}`}
                                                            className="w-full border-0 rounded-b-lg"
                                                            style={{ height: resumePreviewHeight }}
                                                        />
                                                    );
                                                }

                                                if (isImage) {
                                                    return resumePreviewBroken[r.id] ? (
                                                        <div className="flex flex-col items-center justify-center text-center px-4">
                                                            <FileText className="w-7 h-7 text-gray-300 mb-2" />
                                                            <p className="text-xs font-semibold text-gray-500">Preview unavailable</p>
                                                        </div>
                                                    ) : (
                                                        <img
                                                            src={src}
                                                            alt={`Resume: ${r.fileName}`}
                                                            className="w-full h-full object-contain rounded-b-lg"
                                                            onError={() => setResumePreviewBroken((prev) => ({ ...prev, [r.id]: true }))}
                                                        />
                                                    );
                                                }

                                                return (
                                                    <div className="flex flex-col items-center justify-center text-center px-4">
                                                        <FileText className="w-7 h-7 text-gray-300 mb-2" />
                                                        <p className="text-xs font-semibold text-gray-500">Preview unavailable</p>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Standalone ATS score — POST /api/ats/score-absolute (not vs a job) */}
                                    <div className="mb-4 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-4" data-testid="resume-ats-section">
                                        <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5" /> ATS score (resume only)
                                        </p>
                                        <p className="text-[11px] text-gray-500 mb-3">
                                            Absolute score for how ATS-ready this resume is (0–100). It is not compared to any job. Role-specific match appears when you apply to a job.
                                        </p>
                                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-3">
                                            <button
                                                type="button"
                                                data-testid="analyze-resume-button"
                                                disabled={analyzingResumeId === r.id}
                                                onClick={() => handleAnalyzeResume(r.id)}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors shrink-0 w-full sm:w-auto"
                                            >
                                                {analyzingResumeId === r.id ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" /> Analyzing…
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="w-4 h-4" /> Get ATS score
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        {analysisByResume[r.id] && (
                                            <div
                                                className="rounded-lg border border-gray-100 bg-white/90 p-3 space-y-3 text-sm"
                                                data-testid="resume-ats-results"
                                                data-ats-engine={analysisByResume[r.id]?.engine ?? ''}
                                            >
                                                <div className="flex flex-wrap gap-2 items-baseline">
                                                    <span className="text-2xl font-bold text-violet-700">{Math.round(analysisByResume[r.id]!.score)}</span>
                                                    <span className="text-xs text-gray-500">/ 100 · standalone ATS readiness</span>
                                                </div>
                                                <p className="text-xs text-gray-600 leading-relaxed">{analysisByResume[r.id]!.explanation}</p>
                                                {analysisByResume[r.id]!.strengths.length > 0 && (
                                                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                                                        <p className="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-1.5">
                                                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Strengths
                                                        </p>
                                                        <ul className="space-y-2.5 text-sm text-gray-800">
                                                            {analysisByResume[r.id]!.strengths.map((s, i) => {
                                                                const { main, subs } = parseStrengthBullets(s);
                                                                return (
                                                                    <li key={`st-${r.id}-${i}`} className="pl-1">
                                                                        <div className="flex gap-2">
                                                                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="font-medium text-gray-900 leading-snug">{main}</p>
                                                                                {subs.length > 0 && (
                                                                                    <ul className="mt-2 ml-4 list-[circle] text-xs text-gray-600 space-y-1.5 marker:text-emerald-500">
                                                                                        {subs.map((sub, j) => (
                                                                                            <li key={`st-${r.id}-${i}-sub-${j}`} className="leading-relaxed pl-0.5">
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
                                                {analysisByResume[r.id]!.suggestions.length > 0 && (
                                                    <div className="rounded-lg border border-amber-100 bg-white p-3">
                                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2">
                                                            <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Suggestions
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5 text-[10px]">
                                                                <span className={clsx('px-1.5 py-0.5 rounded font-semibold', severityStyles.high.badge)}>High</span>
                                                                <span className={clsx('px-1.5 py-0.5 rounded font-semibold', severityStyles.medium.badge)}>Medium</span>
                                                                <span className={clsx('px-1.5 py-0.5 rounded font-semibold', severityStyles.low.badge)}>Low</span>
                                                            </div>
                                                        </div>
                                                        <ul className="space-y-3">
                                                            {analysisByResume[r.id]!.suggestions.map((raw, i) => {
                                                                const parsed = parseAtsSuggestion(raw);
                                                                const structured = isStructuredAtsSuggestion(raw);
                                                                const issueText = parsed?.issue ?? raw;
                                                                const sev: IssueSeverity = inferIssueSeverity(issueText);
                                                                const st = severityStyles[sev];
                                                                return (
                                                                    <li
                                                                        key={`sg-${r.id}-${i}`}
                                                                        className={clsx(
                                                                            'rounded-r-lg border-l-4 pl-3 pr-2 py-2.5 shadow-sm',
                                                                            st.border,
                                                                            st.bg
                                                                        )}
                                                                    >
                                                                        {structured && parsed ? (
                                                                            <>
                                                                                <p className={clsx('text-xs mb-1.5', st.issueLabel)}>
                                                                                    <span className="font-bold uppercase tracking-wide text-[10px] opacity-90">Issue · </span>
                                                                                    <span className="font-normal text-gray-900 leading-relaxed">{issueText}</span>
                                                                                </p>
                                                                                {parsed.correction && (
                                                                                    <div className="text-xs text-gray-800 mb-1.5">
                                                                                        <span className="font-bold text-[10px] uppercase tracking-wide text-gray-600">Correction · </span>
                                                                                        <span className="leading-relaxed">{parsed.correction}</span>
                                                                                    </div>
                                                                                )}
                                                                                {parsed.example && (
                                                                                    <div className="text-xs border-t border-black/5 pt-2 mt-1">
                                                                                        <span className="font-bold text-[10px] uppercase tracking-wide text-violet-800">Example · </span>
                                                                                        <span className="text-gray-700 leading-relaxed not-italic block mt-0.5 pl-0 border-l-2 border-violet-200 pl-2">{parsed.example}</span>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        ) : (
                                                                            <p className="text-xs text-gray-900 leading-relaxed">{raw}</p>
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

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                                        <a
                                            href={`${API}${r.fileUrl}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                                        >
                                            <ExternalLink className="w-3 h-3" /> Open in new tab
                                        </a>
                                        <button
                                            onClick={() => handleToggleActive(r.id)}
                                            className={clsx(
                                                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                                r.isActive
                                                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                                    : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                            )}
                                        >
                                            {r.isActive ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                                            {r.isActive ? 'Deactivate' : 'Set Active'}
                                        </button>
                                        <div className="ml-auto">
                                            {deleteConfirm === r.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleDelete(r.id)}
                                                        className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors">
                                                        Confirm
                                                    </button>
                                                    <button onClick={() => setDeleteConfirm(null)}
                                                        className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setDeleteConfirm(r.id)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
