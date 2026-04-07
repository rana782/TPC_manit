import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
    Briefcase, Users, Calendar, Plus, Search, Edit3, Trash2, Download,
    X, ChevronDown, ArrowUpDown, LayoutGrid, List,
    IndianRupee, Clock, CheckCircle2, AlertCircle, Eye
} from 'lucide-react';
import StarRating from '../components/StarRating';
import CompanySentimentSummary from '../components/CompanySentimentSummary';
import { formatCompactReviewCount } from '../utils/formatCompactReviewCount';
import { parseLookupRating, parseLookupReviews } from '../utils/parseCompanyLookup';
import { getViteApiBase } from '../utils/apiBase';

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

const BRANCHES = ['CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'];

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

    const fetchCompanyProfiles = async (companyNames: string[]) => {
        const uniqueNames = [...new Set(companyNames.filter(Boolean))];
        if (uniqueNames.length === 0) return;
        const entries = await Promise.all(
            uniqueNames.map(async (name) => {
                try {
                    const res = await axios.get(`${apiBase}/companies/lookup`, {
                        params: { name },
                        headers: { Authorization: `Bearer ${token}` },
                        timeout: 4000
                    });
                    return [name, {
                        rating: parseLookupRating(res.data?.rating),
                        reviews: parseLookupReviews(res.data?.reviews),
                        logoUrl: typeof res.data?.logoUrl === 'string' ? res.data.logoUrl : null,
                        highlyRatedFor: Array.isArray(res.data?.highlyRatedFor) ? res.data.highlyRatedFor.map(String) : [],
                        criticallyRatedFor: Array.isArray(res.data?.criticallyRatedFor) ? res.data.criticallyRatedFor.map(String) : [],
                    }] as const;
                } catch {
                    return [name, { rating: null, reviews: null, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }] as const;
                }
            })
        );
        setCompanyProfiles(Object.fromEntries(entries));
    };

    const getCompanyLogoUrl = (companyName: string): string | null => {
        return companyProfiles[companyName]?.logoUrl ?? null;
    };

    useEffect(() => {
        fetchJobs();
    }, []);

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
                setJobs(res.data.jobs);
                await Promise.all([
                    fetchCompanyProfiles(res.data.jobs.map((job: Job) => job.companyName)),
                ]);
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

    // Computed
    const filteredJobs = jobs
        .filter(j => statusFilter === 'ALL' || j.status === statusFilter)
        .filter(j => !searchTerm || j.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || j.role.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            let cmp = 0;
            if (sortField === 'companyName') cmp = a.companyName.localeCompare(b.companyName);
            else if (sortField === 'role') cmp = a.role.localeCompare(b.role);
            else if (sortField === 'applicants') cmp = (a._count?.applications || 0) - (b._count?.applications || 0);
            else if (sortField === 'deadline') cmp = new Date(a.applicationDeadline).getTime() - new Date(b.applicationDeadline).getTime();
            return sortDir === 'asc' ? cmp : -cmp;
        });

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

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-full" data-testid="spoc-dashboard">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Jobs Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage job postings, track applicants, and oversee the placement process.</p>
                </div>
                <button
                    onClick={openNewJobModal}
                    className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg font-bold text-sm transition-all transform active:scale-95"
                >
                    <Plus className="w-4 h-4" /> Post New Job
                </button>
            </div>

            {saveSuccess && (
                <div className="mb-6 flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold rounded-xl">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />{saveSuccess}
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total Jobs', value: stats.total, icon: Briefcase, color: 'text-primary-600', bg: 'bg-primary-50', border: 'border-primary-100' },
                    { label: 'Published', value: stats.published, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                    { label: 'Drafts', value: stats.draft, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                    { label: 'Total Applicants', value: stats.totalApplicants, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
                ].map(stat => (
                    <div key={stat.label} className={`${stat.bg} ${stat.border} border rounded-2xl p-5 relative overflow-hidden`}>
                        <div className="flex items-center gap-3">
                            <div className={`${stat.bg} p-3 rounded-xl`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{stat.label}</p>
                                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search company or role..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none bg-white shadow-sm"
                        />
                    </div>
                    <div className="relative">
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-white cursor-pointer focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none shadow-sm"
                        >
                            <option value="ALL">All Status</option>
                            <option value="PUBLISHED">Published</option>
                            <option value="DRAFT">Draft</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                    <button onClick={() => setViewMode('cards')} className={clsx('p-2 rounded-lg transition-all', viewMode === 'cards' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700')}>
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button onClick={() => setViewMode('table')} className={clsx('p-2 rounded-lg transition-all', viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700')}>
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {filteredJobs.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                    <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-bold">No jobs found</p>
                    <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or post a new job.</p>
                </div>
            ) : viewMode === 'cards' ? (
                /* === CARD VIEW === */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" data-testid="job-cards-grid">
                    {filteredJobs.map((job, idx) => {
                        const cp = companyProfiles[job.companyName];
                        const highly = cp?.highlyRatedFor ?? [];
                        const crit = cp?.criticallyRatedFor ?? [];
                        const positiveFeatures = highly.filter((s): s is string => typeof s === 'string' && !!s.trim());
                        const negativeFeatures = crit.filter((s): s is string => typeof s === 'string' && !!s.trim());
                        return (
                        <motion.div
                            key={job.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: idx * 0.04 }}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all group"
                            data-testid="spoc-job-card"
                        >
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-start gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 self-start">
                                                    <img
                                                        src={getCompanyLogoUrl(job.companyName) || '/default-logo.png'}
                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                                        alt={`${job.companyName} logo`}
                                                        className="w-6 h-6 object-contain"
                                                    />
                                                </div>
                                        <div className="min-w-0">
                                            <h3 className="text-base font-bold text-gray-900 truncate">{job.role}</h3>
                                            <p className="text-sm text-gray-500 truncate">{job.companyName}</p>
                                            <div className="text-xs font-semibold text-gray-500 mt-1">
                                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                                {typeof cp?.rating === 'number' ? (
                                                    <>
                                                        <StarRating rating={cp.rating} />
                                                        <span className={ratingColorClass(cp.rating)}>{cp.rating.toFixed(1)}/5</span>
                                                        {typeof cp?.reviews === 'number' && (
                                                            <span className="text-gray-500 whitespace-nowrap">({formatCompactReviewCount(cp.reviews)} reviews)</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span>Rating not available</span>
                                                )}
                                                </div>
                                                <CompanySentimentSummary
                                                    positiveFeatures={positiveFeatures}
                                                    negativeFeatures={negativeFeatures}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusBadge(job.status)}`}>
                                        {job.status}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {job.ctc && (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                                            <IndianRupee className="w-3 h-3" />{job.ctc} LPA
                                        </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">
                                        <Briefcase className="w-3 h-3" />{job.jobType || 'Full-Time'}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">
                                        <Calendar className="w-3 h-3" />{new Date(job.applicationDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm font-bold text-gray-700">{job._count?.applications || 0}</span>
                                        <span className="text-xs text-gray-400">applicants</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => window.location.href = `/jobs/${job.id}/details`} className="p-2 rounded-lg hover:bg-primary-50 text-gray-500 hover:text-primary-600 transition-colors" title="Manage Details">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => openEditModal(job)} className="p-2 rounded-lg hover:bg-primary-50 text-gray-500 hover:text-primary-600 transition-colors" title="Edit">
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => exportCSV(job)} className="p-2 rounded-lg hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 transition-colors" title="Export CSV">
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteJob(job.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                    })}
                </div>
            ) : (
                /* === TABLE VIEW === */
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="job-table">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead>
                            <tr className="bg-gray-50/80">
                                {[
                                    { key: 'companyName', label: 'Company & Role' },
                                    { key: 'status', label: 'Status' },
                                    { key: 'deadline', label: 'Deadline' },
                                    { key: 'applicants', label: 'Applicants' },
                                ].map(col => (
                                    <th key={col.key} onClick={() => handleSort(col.key)}
                                        className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none">
                                        <span className="inline-flex items-center gap-1.5">
                                            {col.label}
                                            <ArrowUpDown className={clsx('w-3 h-3', sortField === col.key ? 'text-primary-600' : 'text-gray-300')} />
                                        </span>
                                    </th>
                                ))}
                                <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredJobs.map(job => {
                                const cp = companyProfiles[job.companyName];
                                const highly = cp?.highlyRatedFor ?? [];
                                const crit = cp?.criticallyRatedFor ?? [];
                                const positiveFeatures = highly.filter((s): s is string => typeof s === 'string' && !!s.trim());
                                const negativeFeatures = crit.filter((s): s is string => typeof s === 'string' && !!s.trim());
                                return (
                                <tr key={job.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 self-start">
                                                <img
                                                    src={getCompanyLogoUrl(job.companyName) || '/default-logo.png'}
                                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                                    alt={`${job.companyName} logo`}
                                                    className="w-4 h-4 object-contain"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{job.companyName}</p>
                                                <p className="text-xs text-gray-500 truncate">{job.role}</p>
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
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusBadge(job.status)}`}>
                                            {job.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                        {new Date(job.applicationDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700">
                                            <Users className="w-4 h-4 text-gray-400" />{job._count?.applications || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => window.location.href = `/jobs/${job.id}/details`} className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-500 hover:text-primary-600 transition-colors" title="Manage">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => openEditModal(job)} className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-500 hover:text-primary-600 transition-colors" title="Edit">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => exportCSV(job)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 transition-colors" title="Export CSV">
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => deleteJob(job.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                                                <Trash2 className="w-4 h-4" />
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

            {/* === CREATE / EDIT JOB MODAL === */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 text-left"
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-2xl">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">{editingJob ? 'Edit Job Posting' : 'Post New Job'}</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">Fill in the details to {editingJob ? 'update' : 'create'} a job posting.</p>
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div ref={modalBodyScrollRef} className="px-6 py-6 overflow-y-auto max-h-[65vh] custom-scrollbar">
                                {error && (
                                    <div className="mb-5 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-800 text-sm font-bold rounded-xl">
                                        <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />{error}
                                    </div>
                                )}

                                <form id="jobForm" className="space-y-6">

                                    {/* Basic Details */}
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Basic Details</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="relative z-20 overflow-visible">
                                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Company Name</label>
                                                <input
                                                    ref={companyInputRef}
                                                    type="text"
                                                    required
                                                    value={formData.companyName}
                                                    onChange={e => {
                                                        setFormData({ ...formData, companyName: e.target.value });
                                                        setShowCompanySuggestions(true);
                                                    }}
                                                    onFocus={() => setShowCompanySuggestions(true)}
                                                    onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 280)}
                                                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none transition-all" />
                                                {fieldErrors.companyName && <p className="text-red-500 text-sm mt-1">{fieldErrors.companyName}</p>}
                                                {showCompanySuggestions && suggestAnchor && companySuggestions.length > 0 && typeof document !== 'undefined' && createPortal(
                                                    <div
                                                        className="fixed z-[10000] max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                                                        style={{ top: suggestAnchor.top, left: suggestAnchor.left, width: Math.max(suggestAnchor.width, 220) }}
                                                        role="listbox"
                                                        aria-label="Company suggestions"
                                                    >
                                                        {companySuggestions.map((s) => (
                                                            <button
                                                                type="button"
                                                                key={`${s.normalizedName}-${s.companyName}`}
                                                                onMouseDown={() => selectCompanySuggestion(s)}
                                                                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <img
                                                                        src={s.logoUrl || '/default-logo.png'}
                                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                                                        alt=""
                                                                        className="w-6 h-6 rounded object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-semibold text-gray-800 truncate">{s.companyName}</p>
                                                                        <p className="text-xs text-gray-500 truncate">
                                                                            {typeof s.rating === 'number' ? `${s.rating.toFixed(1)}/5` : 'Rating not available'}
                                                                            {typeof s.reviewCount === 'number' ? ` • ${formatCompactReviewCount(s.reviewCount)} reviews` : ''}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>,
                                                    document.body
                                                )}
                                                {showCompanySuggestions && !companyLookupLoading && formData.companyName.trim().length >= 2 && companySuggestions.length === 0 && (
                                                    <p className={`text-xs mt-1.5 ${companySuggestError ? 'text-red-600 font-medium' : 'text-amber-800'}`}>
                                                        {companySuggestError || 'No matches for that text. If the server just started, wait 1–2 minutes for the company dataset to import, then try again.'}
                                                    </p>
                                                )}
                                                {(companyLookupLoading || companyLookup) && (
                                                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                                        {companyLookupLoading ? (
                                                            <p className="text-xs text-gray-500">Fetching company profile...</p>
                                                        ) : (
                                                            companyLookup && (
                                                                <div className="flex items-start gap-3">
                                                                    <img
                                                                        src={companyLookup.logoUrl || '/default-logo.png'}
                                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                                                        alt={`${companyLookup.companyName} logo`}
                                                                        className="w-9 h-9 rounded object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
                                                                    />
                                                                    <div className="space-y-1">
                                                                        <p className="text-xs font-semibold text-gray-800">
                                                                            Rating: {typeof companyLookup.rating === 'number' ? `${companyLookup.rating.toFixed(1)}/5` : 'Rating not available'}
                                                                        </p>
                                                                        <p className="text-xs text-gray-600">
                                                                            Reviews: {typeof companyLookup.reviewCount === 'number' ? companyLookup.reviewCount.toLocaleString() : 'Reviews not available'}
                                                                        </p>
                                                                        {Array.isArray(companyLookup.highlyRatedFor) && companyLookup.highlyRatedFor.length > 0 && (
                                                                            <div className="pt-1">
                                                                                <p className="text-[11px] font-semibold text-emerald-700">Highly Rated:</p>
                                                                                <p className="text-[11px] text-gray-600">{companyLookup.highlyRatedFor.slice(0, 3).join(', ')}</p>
                                                                            </div>
                                                                        )}
                                                                        {Array.isArray(companyLookup.criticallyRatedFor) && companyLookup.criticallyRatedFor.length > 0 && (
                                                                            <div className="pt-1">
                                                                                <p className="text-[11px] font-semibold text-red-600">Critically Rated:</p>
                                                                                <p className="text-[11px] text-gray-600">{companyLookup.criticallyRatedFor.slice(0, 3).join(', ')}</p>
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
                                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Role / Job Title</label>
                                                <input type="text" required value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}
                                                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none transition-all" />
                                                {fieldErrors.role && <p className="text-red-500 text-sm mt-1">{fieldErrors.role}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Job Type</label>
                                            <select value={formData.jobType} onChange={e => setFormData({ ...formData, jobType: e.target.value })}
                                                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none">
                                                <option>Full-Time</option>
                                                <option>Internship</option>
                                                <option>Internship + PPO</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">CTC / Stipend</label>
                                            <input type="text" required placeholder="e.g. 12 LPA" value={formData.ctc} onChange={e => setFormData({ ...formData, ctc: e.target.value })}
                                                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none" />
                                            {fieldErrors.ctc && <p className="text-red-500 text-sm mt-1">{fieldErrors.ctc}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Application Deadline</label>
                                            <input type="date" required value={formData.applicationDeadline} onChange={e => { setFormData({ ...formData, applicationDeadline: e.target.value }); setDeadlineError(''); }}
                                                className={clsx('w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-4 focus:ring-primary-500/10 focus:outline-none', deadlineError ? 'border-red-500' : 'border-gray-300 focus:border-primary-500')} />
                                            {deadlineError && <p className="text-red-500 text-sm mt-1">{deadlineError}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Job Description</label>
                                        <textarea required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none"></textarea>
                                        {fieldErrors.description && <p className="text-red-500 text-sm mt-1">{fieldErrors.description}</p>}
                                    </div>

                                    {/* Files */}
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Documents</h4>
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
                                    </div>

                                    {/* Eligibility */}
                                    <div className="min-h-[200px]">
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Eligibility Criteria</h4>
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
                                    </div>

                                    {/* Required Profile Fields */}
                                    <div className="min-h-[180px]">
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Required Student Profile Fields</h4>
                                        <p className="text-xs text-gray-500 mb-3">Students must have these fields filled to apply.</p>
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
                                    </div>

                                    {/* Custom QuestionsBuilder */}
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Custom Application Questions</h4>
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
                                    </div>

                                    {/* Status */}
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Posting Status</h4>
                                        <div className="flex gap-3">
                                            {[
                                                { value: 'DRAFT', label: 'Draft (Hidden)', color: 'amber' },
                                                { value: 'PUBLISHED', label: 'Published (Visible)', color: 'emerald' },
                                                { value: 'CLOSED', label: 'Closed', color: 'red' },
                                            ].map(opt => (
                                                <label key={opt.value} className={clsx('flex-1 text-center px-3 py-2.5 rounded-xl border text-sm font-bold cursor-pointer transition-all',
                                                    formData.status === opt.value
                                                        ? `bg-${opt.color}-50 border-${opt.color}-200 text-${opt.color}-700`
                                                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')}>
                                                    <input type="radio" name="status" value={opt.value} checked={formData.status === opt.value}
                                                        onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="sr-only" />
                                                    {opt.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                </form>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-2xl">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 font-bold text-sm text-gray-600 transition-colors">Cancel</button>
                                <button type="button" disabled={loading} onClick={() => saveJob('DRAFT')}
                                    className="px-5 py-2.5 border border-amber-300 bg-amber-50 text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-100 disabled:opacity-50 transition-colors">
                                    {loading ? 'Saving...' : 'Save as Draft'}
                                </button>
                                <button type="button" disabled={loading} onClick={() => saveJob('PUBLISHED')}
                                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl shadow-md font-bold text-sm hover:bg-primary-700 disabled:opacity-50 transition-all transform active:scale-95">
                                    {loading ? 'Saving...' : (editingJob ? 'Update & Publish' : 'Save Job Posting')}
                                </button>
                            </div>

                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
