import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
    Briefcase, Users, Calendar, Plus, Search, Edit3, Trash2, Download,
    X, ArrowUpDown, LayoutGrid, List,
    IndianRupee, Clock, CheckCircle2, AlertCircle, Eye, Loader2, Building2
} from 'lucide-react';
import StarRating from '../components/StarRating';
import CompanySentimentSummary from '../components/CompanySentimentSummary';
import PageHeader, { LayoutContainer } from '../components/layout/PageHeader';
import JobDetails from './JobDetails';
import { formatCompactReviewCount } from '../utils/formatCompactReviewCount';
import { parseLookupRating, parseLookupReviews } from '../utils/parseCompanyLookup';
import { getViteApiBase } from '../utils/apiBase';
import { TPC_ELIGIBLE_BRANCHES } from '../constants/tpcBranches';

interface Job {
    id: string;
    role: string;
    companyName: string;
    description: string;
    jobType: string;
    ctc: string;
    cgpaMin: number;
    requiredProfileFields: string[];
    eligibleBranches: string[];
    customQuestions: any[];
    blockPlaced: boolean;
    status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    jdPath?: string;
    jnfPath?: string;
    applicationDeadline: string;
    _count?: { applications: number };
}
interface CompanySuggestion {
    companyName: string;
    normalizedName: string;
    rating: number | null;
    reviewCount: number | null;
    logoUrl: string | null;
    highlyRatedFor?: string[];
    criticallyRatedFor?: string[];
}

const AVAILABLE_PROFILE_FIELDS = [
    { id: 'resume', label: 'Resume' },
    { id: 'cgpa', label: 'CGPA' },
    { id: 'tenthPct', label: '10th %' },
    { id: 'twelfthPct', label: '12th %' },
    { id: 'backlogs', label: 'Active Backlogs' },
    { id: 'linkedin', label: 'LinkedIn Profile' },
    { id: 'github', label: 'GitHub Profile' },
    { id: 'leetcode', label: 'LeetCode Profile' },
    { id: 'collegeIdPath', label: 'College ID Document' },
    { id: 'aadhaarPath', label: 'Aadhaar Document' },
    { id: 'panPath', label: 'PAN Document' },
];

const BRANCHES = TPC_ELIGIBLE_BRANCHES;

export default function JobsManagement() {
    type CompanyProfileData = {
        rating: number | null;
        reviews: number | null;
        logoUrl: string | null;
        highlyRatedFor: string[];
        criticallyRatedFor: string[];
    };
    const ratingColorClass = (rating: number) => {
        if (rating >= 4) return 'text-emerald-600';
        if (rating >= 3) return 'text-amber-600';
        return 'text-red-600';
    };
    const [jobs, setJobs] = useState<Job[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [sortField, setSortField] = useState<string>('companyName');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [detailsJobId, setDetailsJobId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        role: '',
        companyName: '',
        description: '',
        jobType: 'Full-Time',
        ctc: '',
        cgpaMin: 0,
        applicationDeadline: '',
        blockPlaced: true,
        status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'CLOSED'
    });

    const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
    const [requiredFields, setRequiredFields] = useState<string[]>(['resume']);
    const [customQuestions, setCustomQuestions] = useState<any[]>([]);

    const [jdFile, setJdFile] = useState<File | null>(null);
    const [jnfFile, setJnfFile] = useState<File | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deadlineError, setDeadlineError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [saveSuccess, setSaveSuccess] = useState('');
    const [companyProfiles, setCompanyProfiles] = useState<Record<string, CompanyProfileData>>({});
    const [companySuggestions, setCompanySuggestions] = useState<CompanySuggestion[]>([]);
    const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
    const [companyLookup, setCompanyLookup] = useState<CompanySuggestion | null>(null);
    const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
    const [companySuggestError, setCompanySuggestError] = useState('');
    const [suggestAnchor, setSuggestAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
    const companySuggestSeq = useRef(0);
    const companyInputRef = useRef<HTMLInputElement>(null);
    const modalBodyScrollRef = useRef<HTMLDivElement>(null);

    const normalizeCompanyNameClient = (name: string) => {
        return (name || '')
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\b(ltd|limited|pvt|private|inc|corp|corporation|llp|co|company)\b\.?/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const apiBase = useMemo(() => getViteApiBase(), []);
    const token = localStorage.getItem('token');

    const updateSuggestAnchor = useCallback(() => {
        const el = companyInputRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setSuggestAnchor({ top: r.bottom + 4, left: r.left, width: r.width });
    }, []);

    useLayoutEffect(() => {
        if (!showModal || !showCompanySuggestions || companySuggestions.length === 0) {
            setSuggestAnchor(null);
            return;
        }
        updateSuggestAnchor();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateSuggestAnchor()) : null;
        if (companyInputRef.current && ro) ro.observe(companyInputRef.current);
        const scrollEl = modalBodyScrollRef.current;
        scrollEl?.addEventListener('scroll', updateSuggestAnchor, { passive: true });
        window.addEventListener('scroll', updateSuggestAnchor, true);
        window.addEventListener('resize', updateSuggestAnchor);
        return () => {
            ro?.disconnect();
            scrollEl?.removeEventListener('scroll', updateSuggestAnchor);
            window.removeEventListener('scroll', updateSuggestAnchor, true);
            window.removeEventListener('resize', updateSuggestAnchor);
        };
    }, [showModal, showCompanySuggestions, companySuggestions, formData.companyName, updateSuggestAnchor]);

    const extractCompanyProfilesFromJobs = (jobRows: Array<Job & { companyProfile?: any }>) => {
        const out: Record<string, CompanyProfileData> = {};
        for (const j of jobRows) {
            const key = typeof j.companyName === 'string' ? j.companyName : '';
            if (!key) continue;
            const p = j.companyProfile;
            out[key] = {
                rating: parseLookupRating(p?.rating),
                reviews: parseLookupReviews(p?.reviews),
                logoUrl: typeof p?.logoUrl === 'string' ? p.logoUrl : null,
                highlyRatedFor: Array.isArray(p?.highlyRatedFor) ? p.highlyRatedFor.map(String) : [],
                criticallyRatedFor: Array.isArray(p?.criticallyRatedFor) ? p.criticallyRatedFor.map(String) : [],
            };
        }
        return out;
    };

    const getCompanyLogoUrl = (companyName: string): string | null => {
        return companyProfiles[companyName]?.logoUrl ?? null;
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    useEffect(() => {
        if (!detailsJobId) return undefined;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDetailsJobId(null);
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [detailsJobId]);

    useEffect(() => {
        if (!showModal) return;
        const companyName = formData.companyName?.trim() || '';
        if (!companyName) {
            setCompanySuggestions([]);
            setCompanyLookup(null);
            setCompanySuggestError('');
            return;
        }
        if (companyName.length < 2) {
            setCompanySuggestions([]);
            setCompanyLookup(null);
            setCompanySuggestError('');
            return;
        }

        const timer = setTimeout(async () => {
            let seq = 0;
            try {
                setCompanyLookupLoading(true);
                setCompanySuggestError('');
                seq = ++companySuggestSeq.current;
                const suggestRes = await axios.get(`${apiBase}/companies/suggest`, {
                    params: { q: companyName },
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 12000,
                    validateStatus: () => true
                });

                if (seq !== companySuggestSeq.current) return;

                if (suggestRes.status === 401) {
                    setCompanySuggestError('Session expired — sign in again.');
                    setCompanySuggestions([]);
                    setCompanyLookup(null);
                    return;
                }
                if (suggestRes.status === 403) {
                    setCompanySuggestError('You need SPOC or Coordinator access to load company suggestions.');
                    setCompanySuggestions([]);
                    setCompanyLookup(null);
                    return;
                }
                if (suggestRes.status !== 200 || !Array.isArray(suggestRes.data)) {
                    setCompanySuggestError('Could not load suggestions. Check API URL and that the backend is running.');
                    setCompanySuggestions([]);
                    setCompanyLookup(null);
                    return;
                }

                const raw = suggestRes.data;
                const suggestions: CompanySuggestion[] = raw.map((s: Record<string, unknown>) => ({
                    companyName: String(s?.companyName ?? ''),
                    normalizedName: String(s?.normalizedName ?? ''),
                    rating: parseLookupRating(s?.rating),
                    reviewCount: parseLookupReviews(s?.reviewCount),
                    logoUrl: typeof s?.logoUrl === 'string' ? s.logoUrl : null,
                    highlyRatedFor: Array.isArray(s?.highlyRatedFor) ? (s.highlyRatedFor as unknown[]).map(String) : [],
                    criticallyRatedFor: Array.isArray(s?.criticallyRatedFor) ? (s.criticallyRatedFor as unknown[]).map(String) : [],
                }));
                setCompanySuggestions(suggestions);

                const normalizedInput = normalizeCompanyNameClient(companyName);
                const exact = suggestions.find((s) => s?.normalizedName === normalizedInput) || null;
                setCompanyLookup(exact || suggestions[0] || null);
            } catch {
                if (companySuggestSeq.current === seq) {
                    setCompanySuggestError('Network error loading suggestions.');
                    setCompanySuggestions([]);
                    setCompanyLookup(null);
                }
            } finally {
                if (seq === companySuggestSeq.current) setCompanyLookupLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [showModal, formData.companyName, token, apiBase]);

    const fetchJobs = async () => {
        try {
            const res = await axios.get(`${apiBase}/jobs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                const rows = Array.isArray(res.data.jobs) ? res.data.jobs : [];
                setJobs(rows);
                setCompanyProfiles(extractCompanyProfilesFromJobs(rows));
            }
        } catch (err) {
            console.error("Failed to fetch jobs.", err);
        }
    };

    const resetForm = () => {
        setFormData({
            role: '',
            companyName: '',
            description: '',
            jobType: 'Full-Time',
            ctc: '',
            cgpaMin: 0,
            applicationDeadline: '',
            blockPlaced: true,
            status: 'PUBLISHED'
        });
        setSelectedBranches([]);
        setRequiredFields(['resume']);
        setCustomQuestions([]);
        setJdFile(null);
        setJnfFile(null);
        setEditingJob(null);
        setError('');
        setDeadlineError('');
        setFieldErrors({});
        setSaveSuccess('');
        setShowCompanySuggestions(false);
        setCompanySuggestions([]);
        setCompanyLookup(null);
        setCompanySuggestError('');
        setCompanyLookupLoading(false);
    };

    const openNewJobModal = () => {
        resetForm();
        setShowModal(true);
    };

    function parseJobArray(val: unknown): string[] {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch { return []; }
        }
        return [];
    }

    const openEditModal = (job: Job) => {
        resetForm();
        setEditingJob(job);
        setFormData({
            role: job.role,
            companyName: job.companyName,
            description: job.description,
            jobType: job.jobType,
            ctc: job.ctc,
            cgpaMin: job.cgpaMin,
            applicationDeadline: job.applicationDeadline ? new Date(job.applicationDeadline).toISOString().split('T')[0] : '',
            blockPlaced: job.blockPlaced,
            status: job.status
        });
        setSelectedBranches(parseJobArray(job.eligibleBranches));
        setRequiredFields(parseJobArray(job.requiredProfileFields).length > 0 ? parseJobArray(job.requiredProfileFields) : ['resume']);
        setCustomQuestions(Array.isArray(job.customQuestions) ? job.customQuestions : (() => { try { return JSON.parse((job as any).customQuestions || '[]'); } catch { return []; } })());
        setCompanyLookup(null);
        setCompanySuggestions([]);
        setShowModal(true);
    };

    const selectCompanySuggestion = (suggestion: CompanySuggestion) => {
        setFormData({ ...formData, companyName: suggestion.companyName });
        setCompanyLookup(suggestion);
        setShowCompanySuggestions(false);
        setCompanySuggestions([]);
    };

    const toggleBranch = (branch: string) => {
        setSelectedBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
    };

    const toggleRequiredField = (fieldId: string) => {
        if (fieldId === 'resume') return;
        setRequiredFields(prev => prev.includes(fieldId) ? prev.filter(f => f !== fieldId) : [...prev, fieldId]);
    };

    const handleAddQuestion = () => {
        setCustomQuestions([...customQuestions, { id: Date.now().toString(), label: '', type: 'text', required: true }]);
    };

    const updateQuestion = (index: number, key: string, value: any) => {
        const updated = [...customQuestions];
        updated[index][key] = value;
        setCustomQuestions(updated);
    };

    const removeQuestion = (index: number) => {
        const updated = [...customQuestions];
        updated.splice(index, 1);
        setCustomQuestions(updated);
    };

    const saveJob = async (forcedStatus?: 'DRAFT' | 'PUBLISHED' | 'CLOSED') => {
        setDeadlineError('');
        setError('');
        setFieldErrors({});
        setSaveSuccess('');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadline = formData.applicationDeadline ? new Date(formData.applicationDeadline) : null;
        if (deadline) {
            deadline.setHours(0, 0, 0, 0);
            if (deadline <= today) {
                setDeadlineError("Application deadline must be after today's date");
                return;
            }
        }

        setLoading(true);
        try {
            const payload = { ...formData, status: forcedStatus || formData.status };
            const form = new FormData();
            Object.entries(payload).forEach(([key, value]) => form.append(key, String(value)));

            form.append('eligibleBranches', JSON.stringify(selectedBranches));
            form.append('requiredProfileFields', JSON.stringify(requiredFields));
            form.append('customQuestions', JSON.stringify(customQuestions));

            if (jdFile) form.append('jd', jdFile);
            if (jnfFile) form.append('jnf', jnfFile);

            if (editingJob) {
                await axios.put(`${apiBase}/jobs/${editingJob.id}`, form, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                setSaveSuccess(payload.status === 'PUBLISHED' ? 'Job updated and published successfully.' : 'Job updated successfully.');
            } else {
                await axios.post(`${apiBase}/jobs`, form, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                setSaveSuccess(payload.status === 'PUBLISHED' ? 'Job created and published successfully.' : 'Job created successfully.');
            }

            setShowModal(false);
            resetForm();
            fetchJobs();
            setTimeout(() => setSaveSuccess(''), 3000);
        } catch (err: any) {
            const apiErrors = err.response?.data?.errors;
            if (Array.isArray(apiErrors) && apiErrors.length > 0) {
                const mapped: Record<string, string> = {};
                apiErrors.forEach((issue: any) => {
                    const key = Array.isArray(issue?.path) && issue.path.length ? String(issue.path[0]) : '';
                    if (key && !mapped[key]) mapped[key] = String(issue?.message || 'Invalid value');
                });
                setFieldErrors(mapped);
                if (mapped.applicationDeadline) setDeadlineError(mapped.applicationDeadline);
            }
            const msg = err.response?.data?.message || 'Job update failed';
            if (typeof msg === 'string' && (msg.toLowerCase().includes('deadline') || msg.toLowerCase().includes('after today'))) {
                setDeadlineError(msg);
            } else if (!Array.isArray(apiErrors) || apiErrors.length === 0) {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const deleteJob = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this job posting?")) return;
        try {
            await axios.delete(`${apiBase}/jobs/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchJobs();
        } catch (err) {
            alert("Failed to delete job.");
        }
    };

    const exportCSV = async (job: Job) => {
        try {
            const res = await fetch(`${apiBase}/jobs/${job.id}/applicants/csv`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Export failed');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `applicants-${job.id}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(err?.message || 'Export failed');
        }
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const filteredJobs = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return jobs
            .filter((j) => statusFilter === 'ALL' || j.status === statusFilter)
            .filter(
                (j) =>
                    !q ||
                    j.companyName.toLowerCase().includes(q) ||
                    j.role.toLowerCase().includes(q)
            )
            .sort((a, b) => {
                let cmp = 0;
                if (sortField === 'companyName') cmp = a.companyName.localeCompare(b.companyName);
                else if (sortField === 'role') cmp = a.role.localeCompare(b.role);
                else if (sortField === 'applicants') cmp = (a._count?.applications || 0) - (b._count?.applications || 0);
                else if (sortField === 'deadline') cmp = new Date(a.applicationDeadline).getTime() - new Date(b.applicationDeadline).getTime();
                return sortDir === 'asc' ? cmp : -cmp;
            });
    }, [jobs, statusFilter, searchTerm, sortField, sortDir]);

    const stats = {
        total: jobs.length,
        published: jobs.filter(j => j.status === 'PUBLISHED').length,
        draft: jobs.filter(j => j.status === 'DRAFT').length,
        totalApplicants: jobs.reduce((sum, j) => sum + (j._count?.applications || 0), 0),
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
            CLOSED: 'bg-red-50 text-red-700 border-red-200',
        };
        return map[status] || 'bg-gray-50 text-gray-600 border-gray-200';
    };

    const statusFilterOptions: { value: string; label: string }[] = [
        { value: 'ALL', label: 'All' },
        { value: 'PUBLISHED', label: 'Published' },
        { value: 'DRAFT', label: 'Draft' },
        { value: 'CLOSED', label: 'Closed' },
    ];

    return (
        <div className="min-h-screen bg-slate-50/70" data-testid="spoc-dashboard">
            <LayoutContainer className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                <PageHeader
                    title="Jobs management"
                    subtitle="Post roles, control visibility, and manage applicants from one control panel."
                    breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Jobs' }]}
                    actions={
                        <button
                            type="button"
                            onClick={openNewJobModal}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                        >
                            <Plus className="h-4 w-4 shrink-0" aria-hidden />
                            Post new job
                        </button>
                    }
                />

                {saveSuccess && (
                    <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-900">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                        {saveSuccess}
                    </div>
                )}

                <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        { label: 'Total postings', value: stats.total, icon: Briefcase, tone: 'primary' as const },
                        { label: 'Published', value: stats.published, icon: CheckCircle2, tone: 'emerald' as const },
                        { label: 'Drafts', value: stats.draft, icon: Clock, tone: 'amber' as const },
                        { label: 'Applicants (all)', value: stats.totalApplicants, icon: Users, tone: 'violet' as const },
                    ].map((stat) => {
                        const toneRing =
                            stat.tone === 'primary'
                                ? 'border-primary-100 bg-white'
                                : stat.tone === 'emerald'
                                  ? 'border-emerald-100 bg-emerald-50/40'
                                  : stat.tone === 'amber'
                                    ? 'border-amber-100 bg-amber-50/40'
                                    : 'border-violet-100 bg-violet-50/40';
                        const iconClass =
                            stat.tone === 'primary'
                                ? 'text-primary-600'
                                : stat.tone === 'emerald'
                                  ? 'text-emerald-700'
                                  : stat.tone === 'amber'
                                    ? 'text-amber-800'
                                    : 'text-violet-700';
                        return (
                            <div
                                key={stat.label}
                                className={clsx('rounded-xl border p-4 shadow-sm', toneRing)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg border border-slate-100 bg-white p-2 shadow-sm">
                                        <stat.icon className={clsx('h-5 w-5', iconClass)} aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            {stat.label}
                                        </p>
                                        <p className={clsx('text-xl font-bold tabular-nums tracking-tight', iconClass)}>
                                            {stat.value}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mb-6 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-stretch">
                            <div className="relative min-w-0 flex-1 sm:max-w-md">
                                <Search
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                    aria-hidden
                                />
                                <input
                                    type="search"
                                    data-testid="spoc-jobs-search"
                                    placeholder="Search by company or role…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                                />
                            </div>
                            <div
                                className="flex flex-wrap gap-1.5 sm:items-center"
                                role="group"
                                aria-label="Filter by posting status"
                            >
                                {statusFilterOptions.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setStatusFilter(opt.value)}
                                        className={clsx(
                                            'rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                                            statusFilter === opt.value
                                                ? 'border-slate-900 bg-slate-900 text-white'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
                            <p className="text-xs font-medium text-slate-500">
                                <span className="font-semibold text-slate-800">{filteredJobs.length}</span> shown
                                {jobs.length !== filteredJobs.length && (
                                    <span className="text-slate-400"> · {jobs.length} total</span>
                                )}
                            </p>
                            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('cards')}
                                    className={clsx(
                                        'rounded-md p-2 transition-colors',
                                        viewMode === 'cards'
                                            ? 'bg-white text-primary-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    )}
                                    title="Card view"
                                    aria-pressed={viewMode === 'cards'}
                                >
                                    <LayoutGrid className="h-4 w-4" aria-hidden />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={clsx(
                                        'rounded-md p-2 transition-colors',
                                        viewMode === 'table'
                                            ? 'bg-white text-primary-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    )}
                                    title="Table view"
                                    aria-pressed={viewMode === 'table'}
                                >
                                    <List className="h-4 w-4" aria-hidden />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            {/* Content */}
            {filteredJobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
                    <Briefcase className="mx-auto mb-3 h-11 w-11 text-slate-300" aria-hidden />
                    <p className="font-semibold text-slate-800">No postings match</p>
                    <p className="mt-1 text-sm text-slate-500">Adjust filters or post a new job to see it here.</p>
                </div>
            ) : viewMode === 'cards' ? (
                <div
                    className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3"
                    data-testid="job-cards-grid"
                >
                    {filteredJobs.map((job) => {
                        const cp = companyProfiles[job.companyName];
                        const highly = cp?.highlyRatedFor ?? [];
                        const crit = cp?.criticallyRatedFor ?? [];
                        const positiveFeatures = highly.filter((s): s is string => typeof s === 'string' && !!s.trim());
                        const negativeFeatures = crit.filter((s): s is string => typeof s === 'string' && !!s.trim());
                        return (
                            <article
                                key={job.id}
                                data-testid="spoc-job-card"
                                className="group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition-shadow hover:shadow-md"
                            >
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-5">
                                    <div className="flex min-w-0 gap-3">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                                            <img
                                                src={getCompanyLogoUrl(job.companyName) || '/default-logo.png'}
                                                onError={(e) => {
                                                    (e.currentTarget as HTMLImageElement).src = '/default-logo.png';
                                                }}
                                                alt={`${job.companyName} logo`}
                                                className="h-8 w-8 object-contain"
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">
                                                        {job.role}
                                                    </h3>
                                                    <p className="mt-0.5 line-clamp-2 break-words text-sm text-slate-600">
                                                        {job.companyName}
                                                    </p>
                                                </div>
                                                <span
                                                    className={clsx(
                                                        'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide',
                                                        statusBadge(job.status)
                                                    )}
                                                >
                                                    {job.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-w-0 space-y-2 border-t border-slate-100 pt-3">
                                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                                            {typeof cp?.rating === 'number' ? (
                                                <>
                                                    <span className="shrink-0">
                                                        <StarRating rating={cp.rating} />
                                                    </span>
                                                    <span className={clsx('shrink-0 font-semibold', ratingColorClass(cp.rating))}>
                                                        {cp.rating.toFixed(1)} / 5
                                                    </span>
                                                    {typeof cp?.reviews === 'number' && (
                                                        <span className="min-w-0 text-slate-500">
                                                            ({formatCompactReviewCount(cp.reviews)} reviews)
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-slate-400">Rating not available</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 max-w-full overflow-hidden">
                                            <CompanySentimentSummary
                                                positiveFeatures={positiveFeatures}
                                                negativeFeatures={negativeFeatures}
                                                compact
                                                lineClamp={2}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex min-w-0 flex-wrap gap-2">
                                        {job.ctc ? (
                                            <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900">
                                                <IndianRupee className="h-3 w-3 shrink-0" aria-hidden />
                                                <span className="truncate">{job.ctc} LPA</span>
                                            </span>
                                        ) : null}
                                        <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                            <Briefcase className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                                            <span className="truncate">{job.jobType || 'Full-time'}</span>
                                        </span>
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                            <Calendar className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                                            {new Date(job.applicationDeadline).toLocaleDateString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                    <div className="flex min-w-0 items-center gap-1.5 text-sm text-slate-700">
                                        <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                                        <span className="font-bold tabular-nums">{job._count?.applications || 0}</span>
                                        <span className="truncate text-xs font-medium text-slate-500">applicants</span>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 sm:justify-end">
                                        <button
                                            type="button"
                                            data-testid="spoc-job-manage-details"
                                            onClick={() => setDetailsJobId(job.id)}
                                            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-primary-700 hover:shadow-sm"
                                            title="Manage details"
                                        >
                                            <Eye className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(job)}
                                            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-primary-700 hover:shadow-sm"
                                            title="Edit"
                                        >
                                            <Edit3 className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => exportCSV(job)}
                                            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-emerald-700 hover:shadow-sm"
                                            title="Export CSV"
                                        >
                                            <Download className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteJob(job.id)}
                                            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-red-600 hover:shadow-sm"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div
                    className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm"
                    data-testid="job-table"
                >
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                            <tr>
                                {[
                                    { key: 'companyName', label: 'Company & role' },
                                    { key: 'status', label: 'Status' },
                                    { key: 'deadline', label: 'Deadline' },
                                    { key: 'applicants', label: 'Applicants' },
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        scope="col"
                                        onClick={() => handleSort(col.key)}
                                        className="cursor-pointer select-none px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {col.label}
                                            <ArrowUpDown
                                                className={clsx(
                                                    'h-3 w-3',
                                                    sortField === col.key ? 'text-primary-600' : 'text-slate-300'
                                                )}
                                                aria-hidden
                                            />
                                        </span>
                                    </th>
                                ))}
                                <th
                                    scope="col"
                                    className="px-5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500"
                                >
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredJobs.map((job) => {
                                const cp = companyProfiles[job.companyName];
                                const highly = cp?.highlyRatedFor ?? [];
                                const crit = cp?.criticallyRatedFor ?? [];
                                const positiveFeatures = highly.filter((s): s is string => typeof s === 'string' && !!s.trim());
                                const negativeFeatures = crit.filter((s): s is string => typeof s === 'string' && !!s.trim());
                                return (
                                <tr key={job.id} className="transition-colors hover:bg-slate-50/80">
                                    <td className="min-w-0 px-5 py-4 align-top">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg border border-gray-100 bg-gray-50">
                                                <img
                                                    src={getCompanyLogoUrl(job.companyName) || '/default-logo.png'}
                                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                                    alt={`${job.companyName} logo`}
                                                    className="h-4 w-4 object-contain"
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1 overflow-hidden">
                                                <p className="truncate text-sm font-bold text-gray-900">{job.companyName}</p>
                                                <p className="line-clamp-2 text-xs text-gray-500">{job.role}</p>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                                    {typeof cp?.rating === 'number' ? (
                                                        <>
                                                            <StarRating rating={cp.rating} />
                                                            <span className={ratingColorClass(cp.rating)}>{cp.rating.toFixed(1)}/5</span>
                                                            {typeof cp?.reviews === 'number' && (
                                                                <span className="whitespace-nowrap">({formatCompactReviewCount(cp.reviews)} reviews)</span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span>Rating not available</span>
                                                    )}
                                                    </div>
                                                    <CompanySentimentSummary
                                                        positiveFeatures={positiveFeatures}
                                                        negativeFeatures={negativeFeatures}
                                                        compact
                                                        lineClamp={2}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 align-top">
                                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadge(job.status)}`}>
                                            {job.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 align-top text-sm font-medium text-slate-600">
                                        {new Date(job.applicationDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="px-5 py-4 align-top">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
                                            <Users className="h-4 w-4 text-slate-400" aria-hidden />
                                            {job._count?.applications || 0}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 align-top text-right">
                                        <div className="flex items-center justify-end gap-0.5">
                                            <button
                                                type="button"
                                                data-testid="spoc-job-manage-details-table"
                                                onClick={() => setDetailsJobId(job.id)}
                                                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
                                                title="Manage details"
                                            >
                                                <Eye className="h-4 w-4" aria-hidden />
                                            </button>
                                            <button type="button" onClick={() => openEditModal(job)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-primary-50 hover:text-primary-700" title="Edit">
                                                <Edit3 className="h-4 w-4" aria-hidden />
                                            </button>
                                            <button type="button" onClick={() => exportCSV(job)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700" title="Export CSV">
                                                <Download className="h-4 w-4" aria-hidden />
                                            </button>
                                            <button type="button" onClick={() => deleteJob(job.id)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete">
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            </LayoutContainer>

            {/* === CREATE / EDIT JOB MODAL === */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="my-8 w-full max-w-5xl rounded-2xl border border-slate-200/80 bg-white text-left shadow-2xl"
                        >
                            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
                                <div className="flex min-w-0 gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50">
                                        <Building2 className="h-5 w-5 text-primary-600" aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                                            {editingJob ? 'Edit job posting' : 'New job posting'}
                                        </h2>
                                        <p className="mt-0.5 text-sm text-slate-600">
                                            {editingJob ? 'Update visibility, eligibility, and documents.' : 'Structured form — use company search to pull verified profiles.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50"
                                    aria-label="Close"
                                >
                                    <X className="h-5 w-5" aria-hidden />
                                </button>
                            </div>

                            <div ref={modalBodyScrollRef} className="custom-scrollbar max-h-[70vh] overflow-y-auto px-6 py-6">
                                {error && (
                                    <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-800 text-sm font-bold rounded-xl">
                                        <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />{error}
                                    </div>
                                )}

                                <form id="jobForm" className="space-y-5">
                                    <section className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5">
                                        <div className="mb-4 flex items-center gap-2 border-b border-slate-200/80 pb-2">
                                            <Building2 className="h-4 w-4 text-primary-600" aria-hidden />
                                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                                Organization &amp; role
                                            </h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="relative z-20 overflow-visible">
                                                <label htmlFor="job-form-company-name" className="mb-1.5 block text-sm font-semibold text-slate-800">
                                                    Company Name
                                                </label>
                                                <p className="mb-2 text-xs text-slate-500">
                                                    Type at least two characters to search the placement directory.
                                                </p>
                                                <div className="relative">
                                                    <Search
                                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                                        aria-hidden
                                                    />
                                                    <input
                                                        id="job-form-company-name"
                                                        ref={companyInputRef}
                                                        data-testid="job-form-company"
                                                        type="text"
                                                        required
                                                        autoComplete="off"
                                                        value={formData.companyName}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, companyName: e.target.value });
                                                            setShowCompanySuggestions(true);
                                                        }}
                                                        onFocus={() => setShowCompanySuggestions(true)}
                                                        onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 280)}
                                                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                                                        placeholder="e.g. Tata Consultancy Services"
                                                    />
                                                    {companyLookupLoading && (
                                                        <Loader2
                                                            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
                                                            aria-hidden
                                                        />
                                                    )}
                                                </div>
                                                {fieldErrors.companyName && (
                                                    <p className="mt-1 text-sm text-red-600">{fieldErrors.companyName}</p>
                                                )}
                                                {showCompanySuggestions &&
                                                    suggestAnchor &&
                                                    companySuggestions.length > 0 &&
                                                    typeof document !== 'undefined' &&
                                                    createPortal(
                                                        <div
                                                            className="fixed z-[10000] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-black/5"
                                                            style={{
                                                                top: suggestAnchor.top,
                                                                left: suggestAnchor.left,
                                                                width: Math.max(suggestAnchor.width, 260),
                                                            }}
                                                            role="listbox"
                                                            aria-label="Company suggestions"
                                                        >
                                                            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                                    Matching companies
                                                                    <span className="ml-1 font-bold text-slate-700">
                                                                        ({companySuggestions.length})
                                                                    </span>
                                                                </p>
                                                            </div>
                                                            <div className="max-h-52 overflow-y-auto">
                                                                {companySuggestions.map((s) => (
                                                                    <button
                                                                        type="button"
                                                                        key={`${s.normalizedName}-${s.companyName}`}
                                                                        onMouseDown={() => selectCompanySuggestion(s)}
                                                                        className="flex w-full border-b border-slate-50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-slate-50"
                                                                    >
                                                                        <div className="flex w-full items-center gap-3">
                                                                            <img
                                                                                src={s.logoUrl || '/default-logo.png'}
                                                                                onError={(e) => {
                                                                                    (e.currentTarget as HTMLImageElement).src =
                                                                                        '/default-logo.png';
                                                                                }}
                                                                                alt=""
                                                                                className="h-8 w-8 shrink-0 rounded-md border border-slate-100 bg-white object-contain"
                                                                            />
                                                                            <div className="min-w-0">
                                                                                <p className="truncate text-sm font-semibold text-slate-900">
                                                                                    {s.companyName}
                                                                                </p>
                                                                                <p className="truncate text-xs text-slate-500">
                                                                                    {typeof s.rating === 'number'
                                                                                        ? `${s.rating.toFixed(1)}/5`
                                                                                        : 'Rating not available'}
                                                                                    {typeof s.reviewCount === 'number'
                                                                                        ? ` · ${formatCompactReviewCount(s.reviewCount)} reviews`
                                                                                        : ''}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>,
                                                        document.body
                                                    )}
                                                {showCompanySuggestions &&
                                                    !companyLookupLoading &&
                                                    formData.companyName.trim().length >= 2 &&
                                                    companySuggestions.length === 0 && (
                                                        <p
                                                            className={`mt-2 text-xs ${companySuggestError ? 'font-medium text-red-600' : 'text-amber-800'}`}
                                                        >
                                                            {companySuggestError ||
                                                                'No matches for that text. If the server just started, wait 1–2 minutes for the company dataset to import, then try again.'}
                                                        </p>
                                                    )}
                                                {(companyLookupLoading || companyLookup) && (
                                                    <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/40 px-3 py-2.5">
                                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary-800">
                                                            Profile preview
                                                        </p>
                                                        {companyLookupLoading ? (
                                                            <p className="text-xs text-slate-600">Fetching company profile…</p>
                                                        ) : (
                                                            companyLookup && (
                                                                <div className="flex items-start gap-3">
                                                                    <img
                                                                        src={companyLookup.logoUrl || '/default-logo.png'}
                                                                        onError={(e) => {
                                                                            (e.currentTarget as HTMLImageElement).src =
                                                                                '/default-logo.png';
                                                                        }}
                                                                        alt={`${companyLookup.companyName} logo`}
                                                                        className="h-10 w-10 shrink-0 rounded-lg border border-white bg-white object-contain shadow-sm"
                                                                    />
                                                                    <div className="min-w-0 space-y-1">
                                                                        <p className="text-xs font-semibold text-slate-800">
                                                                            Rating:{' '}
                                                                            {typeof companyLookup.rating === 'number'
                                                                                ? `${companyLookup.rating.toFixed(1)}/5`
                                                                                : 'Rating not available'}
                                                                        </p>
                                                                        <p className="text-xs text-slate-600">
                                                                            Reviews:{' '}
                                                                            {typeof companyLookup.reviewCount === 'number'
                                                                                ? companyLookup.reviewCount.toLocaleString()
                                                                                : 'Reviews not available'}
                                                                        </p>
                                                                        {Array.isArray(companyLookup.highlyRatedFor) &&
                                                                            companyLookup.highlyRatedFor.length > 0 && (
                                                                                <div className="pt-1">
                                                                                    <p className="text-[11px] font-semibold text-emerald-700">
                                                                                        Highly rated
                                                                                    </p>
                                                                                    <p className="text-[11px] text-slate-600">
                                                                                        {companyLookup.highlyRatedFor.slice(0, 3).join(', ')}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        {Array.isArray(companyLookup.criticallyRatedFor) &&
                                                                            companyLookup.criticallyRatedFor.length > 0 && (
                                                                                <div className="pt-1">
                                                                                    <p className="text-[11px] font-semibold text-red-600">
                                                                                        Critically rated
                                                                                    </p>
                                                                                    <p className="text-[11px] text-slate-600">
                                                                                        {companyLookup.criticallyRatedFor
                                                                                            .slice(0, 3)
                                                                                            .join(', ')}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                    </div>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <label htmlFor="job-form-role" className="mb-1.5 block text-sm font-semibold text-slate-800">
                                                    Role / job title
                                                </label>
                                                <input
                                                    id="job-form-role"
                                                    type="text"
                                                    required
                                                    value={formData.role}
                                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                                                />
                                                {fieldErrors.role && <p className="mt-1 text-sm text-red-600">{fieldErrors.role}</p>}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                                        <div className="mb-4 flex items-center gap-2 border-b border-slate-200/80 pb-2">
                                            <Calendar className="h-4 w-4 text-primary-600" aria-hidden />
                                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                                Package &amp; deadline
                                            </h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                            <div>
                                                <label className="mb-1.5 block text-sm font-semibold text-slate-800">Job type</label>
                                                <select
                                                    value={formData.jobType}
                                                    onChange={(e) => setFormData({ ...formData, jobType: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                                                >
                                                    <option>Full-Time</option>
                                                    <option>Internship</option>
                                                    <option>Internship + PPO</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-sm font-semibold text-slate-800">CTC / stipend</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="e.g. 12 LPA"
                                                    value={formData.ctc}
                                                    onChange={(e) => setFormData({ ...formData, ctc: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                                                />
                                                {fieldErrors.ctc && <p className="mt-1 text-sm text-red-600">{fieldErrors.ctc}</p>}
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-sm font-semibold text-slate-800">Application deadline</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={formData.applicationDeadline}
                                                    onChange={(e) => {
                                                        setFormData({ ...formData, applicationDeadline: e.target.value });
                                                        setDeadlineError('');
                                                    }}
                                                    className={clsx(
                                                        'w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/15',
                                                        deadlineError
                                                            ? 'border-red-500'
                                                            : 'border-slate-200 focus:border-primary-500'
                                                    )}
                                                />
                                                {deadlineError && <p className="mt-1 text-sm text-red-600">{deadlineError}</p>}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                                        <div className="mb-3 flex items-center gap-2 border-b border-slate-200/80 pb-2">
                                            <Briefcase className="h-4 w-4 text-primary-600" aria-hidden />
                                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Role description</h3>
                                        </div>
                                        <label htmlFor="job-form-description" className="sr-only">
                                            Job description
                                        </label>
                                        <textarea
                                            id="job-form-description"
                                            required
                                            rows={5}
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm leading-relaxed text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                                            placeholder="Responsibilities, expectations, and any stack or location notes…"
                                        />
                                        {fieldErrors.description && (
                                            <p className="mt-1 text-sm text-red-600">{fieldErrors.description}</p>
                                        )}
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5">
                                        <h4 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-600">Documents (PDF)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Upload JD (PDF)</label>
                                                <input type="file" accept=".pdf" onChange={e => setJdFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
                                                {editingJob?.jdPath && <a href={editingJob.jdPath} target="_blank" rel="noreferrer" className="text-xs text-primary-600 font-bold mt-2 inline-block">View Current JD</a>}
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Upload JNF (PDF)</label>
                                                <input type="file" accept=".pdf" onChange={e => setJnfFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
                                                {editingJob?.jnfPath && <a href={editingJob.jnfPath} target="_blank" rel="noreferrer" className="text-xs text-primary-600 font-bold mt-2 inline-block">View Current JNF</a>}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                                        <div className="mb-4 flex items-center gap-2 border-b border-slate-200/80 pb-2">
                                            <Users className="h-4 w-4 text-primary-600" aria-hidden />
                                            <h3 className="text-sm font-bold tracking-tight text-slate-800">
                                                Eligibility Criteria
                                            </h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Minimum CGPA</label>
                                                <input type="number" step="0.1" min="0" max="10" required value={formData.cgpaMin} onChange={e => setFormData({ ...formData, cgpaMin: parseFloat(e.target.value) })}
                                                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none" />
                                                {fieldErrors.cgpaMin && <p className="text-red-500 text-sm mt-1">{fieldErrors.cgpaMin}</p>}
                                            </div>
                                            <div className="flex items-center mt-7">
                                                <input type="checkbox" id="blockPlaced" checked={formData.blockPlaced} onChange={e => setFormData({ ...formData, blockPlaced: e.target.checked })} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                                                <label htmlFor="blockPlaced" className="ml-2.5 text-sm font-medium text-gray-700">Block already placed students</label>
                                            </div>
                                        </div>

                                        <label className="block text-sm font-bold text-gray-700 mb-2">Eligible Branches</label>
                                        <div className="flex flex-wrap gap-2 min-h-[52px]">
                                            {BRANCHES.map(branch => (
                                                <label key={`branch-${branch}`} className={clsx('inline-flex items-center px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer transition-all',
                                                    selectedBranches.includes(branch) ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>
                                                    <input type="checkbox" checked={selectedBranches.includes(branch)} onChange={() => toggleBranch(branch)} className="sr-only" />
                                                    {branch}
                                                </label>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5">
                                        <h4 className="mb-1 text-sm font-bold text-slate-800">
                                            Required Student Profile Fields
                                        </h4>
                                        <p className="mb-3 text-xs text-slate-500">Students must have these fields filled to apply.</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {AVAILABLE_PROFILE_FIELDS.map(field => (
                                                <label key={`req-${field.id}`} className={clsx('inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all',
                                                    requiredFields.includes(field.id) ? 'bg-primary-50 border-primary-200 text-primary-700 font-bold' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
                                                    field.id === 'resume' && 'opacity-60 cursor-default')}>
                                                    <input type="checkbox" disabled={field.id === 'resume'} checked={requiredFields.includes(field.id)} onChange={() => toggleRequiredField(field.id)} className="sr-only" />
                                                    <CheckCircle2 className={clsx('w-4 h-4 flex-shrink-0', requiredFields.includes(field.id) ? 'text-primary-600' : 'text-gray-300')} />
                                                    {field.label}
                                                </label>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
                                        <div className="mb-3 flex items-center justify-between gap-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                                Custom application questions
                                            </h4>
                                            <button type="button" onClick={handleAddQuestion} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">
                                                <Plus className="w-3 h-3" /> Add Question
                                            </button>
                                        </div>
                                        {customQuestions.length === 0 ? <p className="text-sm text-gray-400 italic">No custom questions added.</p> : (
                                            <div className="space-y-3">
                                                {customQuestions.map((q, idx) => (
                                                    <div key={q.id ? `cq-${q.id}` : `cq-${idx}`} className="flex flex-col md:flex-row items-end gap-3 bg-gray-50 p-4 border border-gray-100 rounded-xl">
                                                        <div className="w-full md:w-1/2">
                                                            <label className="block text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Question</label>
                                                            <input type="text" required value={q.label} onChange={e => updateQuestion(idx, 'label', e.target.value)}
                                                                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary-500 focus:outline-none" placeholder="e.g. Why should we hire you?" />
                                                        </div>
                                                        <div className="w-full md:w-1/4">
                                                            <label className="block text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Type</label>
                                                            <select value={q.type} onChange={e => updateQuestion(idx, 'type', e.target.value)}
                                                                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:border-primary-500 focus:outline-none">
                                                                <option value="text">Short Text</option>
                                                                <option value="textarea">Paragraph</option>
                                                                <option value="url">Link / URL</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center gap-3 pb-1">
                                                            <label className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                                                                <input type="checkbox" checked={q.required} onChange={e => updateQuestion(idx, 'required', e.target.checked)} className="h-4 w-4 text-primary-600 rounded" />
                                                                Required
                                                            </label>
                                                            <button type="button" onClick={() => removeQuestion(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5">
                                        <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                                            Posting visibility
                                        </h4>
                                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                                            {(
                                                [
                                                    {
                                                        value: 'DRAFT' as const,
                                                        label: 'Draft (hidden)',
                                                        active:
                                                            'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-200/80',
                                                    },
                                                    {
                                                        value: 'PUBLISHED' as const,
                                                        label: 'Published',
                                                        active:
                                                            'border-emerald-300 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80',
                                                    },
                                                    {
                                                        value: 'CLOSED' as const,
                                                        label: 'Closed',
                                                        active:
                                                            'border-red-300 bg-red-50 text-red-900 ring-1 ring-red-200/80',
                                                    },
                                                ] as const
                                            ).map((opt) => (
                                                <label
                                                    key={opt.value}
                                                    className={clsx(
                                                        'flex-1 cursor-pointer rounded-lg border px-3 py-2.5 text-center text-xs font-semibold transition-all sm:text-sm',
                                                        formData.status === opt.value
                                                            ? opt.active
                                                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                                    )}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="status"
                                                        value={opt.value}
                                                        checked={formData.status === opt.value}
                                                        onChange={(e) =>
                                                            setFormData({
                                                                ...formData,
                                                                status: e.target.value as 'DRAFT' | 'PUBLISHED' | 'CLOSED',
                                                            })
                                                        }
                                                        className="sr-only"
                                                    />
                                                    {opt.label}
                                                </label>
                                            ))}
                                        </div>
                                    </section>

                                </form>
                            </div>

                            <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50/90 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => saveJob('DRAFT')}
                                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
                                >
                                    {loading ? 'Saving…' : 'Save as draft'}
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    aria-label="Save job posting - Update & publish"
                                    onClick={() => saveJob('PUBLISHED')}
                                    className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
                                >
                                    {loading ? 'Saving…' : editingJob ? 'Update & publish' : 'Publish posting'}
                                </button>
                            </div>

                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {detailsJobId && (
                    <motion.div
                        key="job-details-drawer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[60] flex justify-end"
                        role="presentation"
                    >
                        <motion.button
                            type="button"
                            aria-label="Close job details"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                            onClick={() => {
                                setDetailsJobId(null);
                                fetchJobs();
                            }}
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="spoc-job-details-drawer-title"
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                            className="relative z-10 flex h-full w-full max-w-[min(100vw,76rem)] flex-col border-l border-slate-200 bg-white shadow-2xl"
                            data-testid="spoc-job-details-drawer"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                                <div className="min-w-0">
                                    <p
                                        id="spoc-job-details-drawer-title"
                                        className="truncate text-sm font-bold text-slate-900 sm:text-base"
                                    >
                                        Manage job details
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                        Applicants, pipeline stages, and placement actions
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDetailsJobId(null);
                                        fetchJobs();
                                    }}
                                    className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                                    aria-label="Close"
                                >
                                    <X className="h-5 w-5" aria-hidden />
                                </button>
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                <JobDetails
                                    key={detailsJobId}
                                    jobId={detailsJobId}
                                    embedded
                                    onClose={() => {
                                        setDetailsJobId(null);
                                        fetchJobs();
                                    }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
