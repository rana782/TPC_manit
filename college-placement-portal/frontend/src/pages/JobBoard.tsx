import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import {
    Briefcase, Clock, IndianRupee, GraduationCap,
    CheckCircle2, XCircle, Users, AlertCircle, X, FileText, Sparkles,
    Calendar, Building2, Lock, ArrowRight, Loader2, Zap, LayoutList, ChevronRight, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader from '../components/layout/PageHeader';
import StarRating from '../components/StarRating';
import CompanySentimentSummary from '../components/CompanySentimentSummary';
import { formatCompactReviewCount } from '../utils/formatCompactReviewCount';
import { parseLookupRating, parseLookupReviews } from '../utils/parseCompanyLookup';
import { getViteApiBase } from '../utils/apiBase';
import { sanitizeJobMatchExplanation } from '../utils/atsDisplay';
import AtsSuggestionsPanel from '../components/ats/AtsSuggestionsPanel';

interface Job {
    id: string;
    role: string;
    companyName: string;
    description: string;
    jobType: string;
    ctc: string;
    cgpaMin: number;
    eligibleBranches: string[];
    requiredProfileFields: string[];
    customQuestions: { id: string; label: string; type: string; required: boolean }[];
    applicationDeadline: string;
    location?: string | null;
    stages?: { id: string; name: string; scheduledDate: string; status: string }[];
}

interface Resume {
    id: string;
    fileName: string;
}

interface Application {
    id: string;
    jobId: string;
    status: string;
    appliedAt: string;
    applicationData: Record<string, any>;
    job: {
        role: string;
        companyName: string;
        stages?: { id: string; name: string; status: string; scheduledDate: string }[];
    };
    atsScore?: number;
    semanticScore?: number;
    skillScore?: number;
    atsExplanation?: string;
    atsMatchedKeywords?: string[];
    skillsMatched?: string[];
    skillsMissing?: string[];
    suggestions?: string[];
}

interface AtsScoreData {
    resumeId: string;
    score: number;
    matchScore?: number;
    semanticScore?: number;
    skillScore?: number;
    explanation: string;
    matchedKeywords: string[];
    skillsMatched?: string[];
    skillsMissing?: string[];
    suggestions?: string[];
    recommended?: boolean;
}

interface CompanyProfileData {
    rating: number | null;
    reviews: number | null;
    logoUrl: string | null;
    highlyRatedFor: string[];
    criticallyRatedFor: string[];
}

function ratingColorClass(rating: number): string {
    if (rating >= 4) return 'text-emerald-600';
    if (rating >= 3) return 'text-amber-600';
    return 'text-red-600';
}

function getCompanyProfile(companyProfiles: Record<string, CompanyProfileData>, companyName: string): CompanyProfileData {
    return companyProfiles[companyName] || { rating: null, reviews: null, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] };
}

function getStatusCfg(status: string) {
    const s = status?.toUpperCase() || '';
    if (s.includes('ACCEPT') || s === 'SELECTED') return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Accepted' };
    if (s.includes('REJECT')) return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', label: 'Rejected' };
    if (s.includes('WITHDRAWN')) return { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-300', label: 'Withdrawn' };
    if (s.includes('SHORTLIST') || s.includes('INTERVIEW')) return { icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Shortlisted' };
    if (s.includes('REVIEW')) return { icon: Clock, color: 'text-primary-600', bg: 'bg-primary-50', border: 'border-primary-200', label: 'Under Review' };
    return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', label: status || 'Applied' };
}

function parseJsonField(val: any): any[] {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

export default function JobBoard() {
    const { token, user, loading: authLoading } = useAuth();
    const apiBase = useMemo(() => getViteApiBase(), []);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [resumes, setResumes] = useState<Resume[]>([]);
    const [myApplications, setMyApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [activeTab, setActiveTab] = useState<'jobs' | 'applications'>('jobs');
    const [isLocked, setIsLocked] = useState(false);
    const [lockedReason, setLockedReason] = useState('');

    // Apply modal & Stepper state
    const [applyingJob, setApplyingJob] = useState<Job | null>(null);
    const [currentStep, setCurrentStep] = useState(1); // 1: Resume (+ inline ATS), 2: Questions or Review, 3: Review
    
    const [selectedResumeId, setSelectedResumeId] = useState('');
    const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
    const [applyError, setApplyError] = useState('');
    /** ATS match for the current job + selected resume only (POST /api/ats/score). */
    const [jobMatchScore, setJobMatchScore] = useState<AtsScoreData | null>(null);
    const [matchScoreLoading, setMatchScoreLoading] = useState(false);
    const [matchScoreError, setMatchScoreError] = useState('');
    const matchScoreAbortRef = useRef<AbortController | null>(null);
    const [withdrawingApplicationId, setWithdrawingApplicationId] = useState<string | null>(null);

    // Job details modal (read-only)
    const [jobDetailsModalOpen, setJobDetailsModalOpen] = useState(false);
    const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
    const [jobDetailsError, setJobDetailsError] = useState('');
    const [jobDetails, setJobDetails] = useState<Job | null>(null);
    const [jobApplicantsCount, setJobApplicantsCount] = useState<number>(0);
    const [companyProfiles, setCompanyProfiles] = useState<Record<string, CompanyProfileData>>({});

    // Filter states
    const [selectedBranch, setSelectedBranch] = useState('');
    const [minCtc, setMinCtc] = useState<number | ''>('');
    const [jobsFetchFailed, setJobsFetchFailed] = useState(false);

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

    const fetchAll = async () => {
        try {
            setJobsFetchFailed(false);
            const [jobsRes, resumesRes, appsRes, profileRes] = await Promise.all([
                axios.get(`${apiBase}/jobs`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${apiBase}/student/resumes`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: true, data: [] } })),
                axios.get(`${apiBase}/applications`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: true, applications: [] } })),
                axios.get(`${apiBase}/student/profile`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: false } }))
            ]);
            const jobsPayload = jobsRes.data;
            const rawJobs = Array.isArray(jobsPayload)
                ? jobsPayload
                : Array.isArray(jobsPayload?.jobs)
                    ? jobsPayload.jobs
                    : Array.isArray(jobsPayload?.data)
                        ? jobsPayload.data
                        : [];

            if (jobsPayload?.success !== false) {
                const parsed = rawJobs
                    .map((j: any) => ({
                        ...j,
                        status: typeof j.status === 'string' ? j.status.toUpperCase() : j.status,
                        eligibleBranches: Array.isArray(j.eligibleBranches) ? j.eligibleBranches : (() => { try { return JSON.parse(j.eligibleBranches); } catch { return []; } })(),
                        requiredProfileFields: Array.isArray(j.requiredProfileFields) ? j.requiredProfileFields : (() => { try { return JSON.parse(j.requiredProfileFields); } catch { return []; } })(),
                        customQuestions: Array.isArray(j.customQuestions) ? j.customQuestions : (() => { try { return JSON.parse(j.customQuestions); } catch { return []; } })(),
                    }));
                setJobs(parsed);
                await Promise.all([
                    fetchCompanyProfiles(parsed.map((j: Job) => j.companyName))
                ]);
            }
            const resumeSource = resumesRes.data.data || resumesRes.data.resumes || [];
            if (resumesRes.data.success) setResumes(resumeSource);
            if (appsRes.data.success) {
                const apps = (appsRes.data.applications || []).map((a: any) => ({
                    ...a,
                    atsMatchedKeywords: Array.isArray(a.atsMatchedKeywords) ? a.atsMatchedKeywords : (() => { try { return JSON.parse(a.atsMatchedKeywords); } catch { return []; } })(),
                    skillsMatched: Array.isArray(a.skillsMatched) ? a.skillsMatched : (() => { try { return JSON.parse(a.skillsMatched); } catch { return []; } })(),
                    skillsMissing: Array.isArray(a.skillsMissing) ? a.skillsMissing : (() => { try { return JSON.parse(a.skillsMissing); } catch { return []; } })(),
                    suggestions: Array.isArray(a.suggestions) ? a.suggestions : (() => { try { return JSON.parse(a.suggestions); } catch { return []; } })(),
                }));
                setMyApplications(apps);
            }
            if (profileRes.data.success) {
                setIsLocked(profileRes.data.data.isLocked);
                setLockedReason(profileRes.data.data.lockedReason || '');
            }
        } catch (err: any) {
            setJobsFetchFailed(true);
            setError(err.response?.data?.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading) return;

        if (!token) {
            setLoading(false);
            return;
        }

        if (!user) {
            setJobsFetchFailed(true);
            setError('Could not verify your profile. Please sign in again.');
            setLoading(false);
            return;
        }

        if (user.role === 'STUDENT') {
            setError('');
            fetchAll();
        } else {
            setLoading(false);
        }
    }, [token, user, authLoading]);

    /** Clear ATS preview when switching resume or job (user must click "ATS Match" again). */
    useEffect(() => {
        setJobMatchScore(null);
        setMatchScoreError('');
        setMatchScoreLoading(false);
    }, [selectedResumeId, applyingJob?.id]);

    const fetchJobMatchScore = useCallback(async () => {
        if (!applyingJob?.id || !selectedResumeId || !token) {
            setApplyError('Select a resume first.');
            return;
        }
        matchScoreAbortRef.current?.abort();
        const ac = new AbortController();
        matchScoreAbortRef.current = ac;
        setMatchScoreLoading(true);
        setMatchScoreError('');
        setJobMatchScore(null);
        setApplyError('');
        try {
            const res = await axios.post(
                `${apiBase}/ats/score`,
                { jobId: applyingJob.id, resumeId: selectedResumeId },
                {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: ac.signal,
                    timeout: 180000,
                }
            );
            if (!res.data?.success || !res.data?.data) {
                setMatchScoreError(res.data?.message || 'Could not compute match score.');
                return;
            }
            const d = res.data.data;
            setJobMatchScore({
                resumeId: d.resumeId,
                score: typeof d.score === 'number' ? d.score : Number(d.matchScore) || 0,
                matchScore: typeof d.matchScore === 'number' ? d.matchScore : Number(d.score) || 0,
                semanticScore: d.semanticScore,
                skillScore: d.skillScore,
                explanation: d.explanation ?? '',
                matchedKeywords: Array.isArray(d.matchedKeywords) ? d.matchedKeywords : [],
                skillsMatched: Array.isArray(d.skillsMatched) ? d.skillsMatched : [],
                skillsMissing: Array.isArray(d.skillsMissing) ? d.skillsMissing : [],
                suggestions: Array.isArray(d.suggestions) ? d.suggestions : [],
            });
        } catch (err: unknown) {
            const e = err as { code?: string; name?: string; response?: { data?: { message?: string } }; message?: string };
            if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
            const msg = e?.response?.data?.message || e?.message || 'Could not compute match score.';
            setMatchScoreError(msg);
        } finally {
            if (!ac.signal.aborted) setMatchScoreLoading(false);
        }
    }, [applyingJob?.id, selectedResumeId, token, apiBase]);

    const handleApplyClick = (job: Job) => {
        setApplyingJob(job);
        setCurrentStep(1); // Reset to first step
        setApplyError('');
        setSelectedResumeId('');
        setCustomAnswers({});
        setJobMatchScore(null);
        setMatchScoreError('');
        setMatchScoreLoading(false);
    };

    const openJobDetails = async (jobId: string) => {
        setJobDetailsModalOpen(true);
        setJobDetailsLoading(true);
        setJobDetailsError('');
        setJobDetails(null);
        setJobApplicantsCount(0);

        try {
            const res = await axios.get(
                `${apiBase}/jobs/student/${jobId}/details`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.success) {
                setJobDetails(res.data.job);
                setJobApplicantsCount(Number(res.data.applicantsCount ?? 0));
            } else {
                setJobDetailsError(res.data?.message || 'Failed to load job details');
            }
        } catch (err: any) {
            setJobDetailsError(err.response?.data?.message || 'Failed to load job details');
        } finally {
            setJobDetailsLoading(false);
        }
    };

    const handleNextStep = () => {
        setApplyError('');
        if (currentStep === 1) {
            if (!selectedResumeId) {
                setApplyError('Please select a resume to continue.');
                return;
            }
            // ATS match is optional — stop any in-flight score request when continuing
            matchScoreAbortRef.current?.abort();
            setMatchScoreLoading(false);
        }
        if (currentStep === 2 && hasQuestions && applyingJob?.customQuestions) {
            for (const q of applyingJob.customQuestions) {
                if (q.required && !customAnswers[q.label]) {
                    setApplyError(`Please answer the required question: "${q.label}"`);
                    return;
                }
            }
        }
        setCurrentStep(prev => prev + 1);
    };

    const handlePrevStep = () => {
        setCurrentStep(prev => prev - 1);
        setApplyError('');
    };

    const handleApplySubmit = async () => {
        setApplyError('');
        if (!selectedResumeId) return;

        try {
            const res = await axios.post(`${apiBase}/applications`, {
                jobId: applyingJob?.id,
                resumeId: selectedResumeId,
                answers: customAnswers
            }, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 120000,
            });

            if (res.data.success) {
                const atsScore = res.data.matchScore ?? res.data.atsScore ?? res.data.application?.atsScore;
                const atsMsg = atsScore != null && atsScore > 0
                    ? ` Match score: ${Math.round(atsScore)} / 100.`
                    : ' Application submitted. ATS is running in background and will update shortly.';
                setSuccess('Successfully applied!' + atsMsg);
                setApplyingJob(null);
                setSelectedResumeId('');
                setCustomAnswers({});
                setCurrentStep(1);
                fetchAll();
            }
        } catch (err: any) {
            const data = err.response?.data;
            const msg = data?.message || data?.error || err.message || 'Application failed. Check your profile fields.';
            setApplyError(typeof msg === 'string' ? msg : 'Application failed. Check your profile fields.');
        }
    };

    const handleWithdrawApplication = async (applicationId: string) => {
        try {
            setWithdrawingApplicationId(applicationId);
            await axios.put(`${apiBase}/applications/${applicationId}/withdraw`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuccess('Application withdrawn successfully.');
            fetchAll();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to withdraw application');
        } finally {
            setWithdrawingApplicationId(null);
        }
    };

    const activeApplications = myApplications.filter((a) => String(a.status || '').toUpperCase() !== 'WITHDRAWN');
    const appliedJobIds = new Set(activeApplications.map(a => a.jobId));
    const activeApplicationByJobId = new Map<string, Application>();
    activeApplications.forEach((app) => {
        if (!activeApplicationByJobId.has(app.jobId)) {
            activeApplicationByJobId.set(app.jobId, app);
        }
    });
    const branchFilteredJobs = jobs.filter((j) => {
        const branches = parseJsonField(j.eligibleBranches);
        return !selectedBranch || branches.includes(selectedBranch);
    });
    const filteredJobs = branchFilteredJobs.filter((j) => !minCtc || (parseFloat(j.ctc || '0') >= minCtc));

    const hasActiveFilters = Boolean(selectedBranch || minCtc !== '');
    const noJobsReason = (() => {
        if (!jobsFetchFailed && jobs.length === 0) return 'NO_OPEN_PUBLISHED_JOBS';
        if (jobsFetchFailed) return 'API_ERROR';
        if (hasActiveFilters && filteredJobs.length === 0) return 'FILTERED_OUT';
        return 'NONE';
    })();
    const jobsDiagnostics = {
        totalFetchedJobs: jobs.length,
        jobsAfterServerVisibility: jobs.length,
        jobsAfterBranchFilter: branchFilteredJobs.length,
        jobsAfterCtcFilter: filteredJobs.length,
        selectedBranch: selectedBranch || 'Any',
        minCtc: minCtc === '' ? 'Any' : String(minCtc),
        lastFetchError: jobsFetchFailed
    };

    // Stepper: Resume (with inline ATS) → [Questions?] → Review — no separate ATS step
    const hasQuestions = applyingJob?.customQuestions && applyingJob.customQuestions.length > 0;
    const totalSteps = hasQuestions ? 3 : 2;

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen bg-gray-50 font-sans">
            <PageHeader
                title="Job Board"
                subtitle={`${jobs.length} opportunities available`}
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Job Board' }]}
            />

            <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    
                    {/* Left Sidebar (260px) */}
                    <div className="w-full lg:w-[260px] flex-shrink-0 space-y-6 lg:sticky lg:top-8">
                        {/* Tab Navigation */}
                        <div className="bg-white rounded-xl border border-gray-200 p-2 shadow-sm">
                            {[
                                { key: 'jobs' as const, label: 'Available Jobs', count: jobs.length, icon: Briefcase },
                                { key: 'applications' as const, label: 'My Applications', count: myApplications.length, icon: FileText },
                            ].map(tab => (
                                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                    className={clsx('w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all mb-1 last:mb-0',
                                        activeTab === tab.key ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-gray-600 hover:bg-gray-50')}>
                                    <div className="flex items-center gap-3">
                                        <tab.icon className={clsx("w-5 h-5", activeTab === tab.key ? 'text-primary-600' : 'text-gray-400')} />
                                        {tab.label}
                                    </div>
                                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-bold', activeTab === tab.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500')}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Filters */}
                        {activeTab === 'jobs' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-5">
                                <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">Filters</h3>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Branch</label>
                                        <select data-testid="branch-select" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none">
                                            <option value="">All Branches</option>
                                            <option value="CSE">CSE</option>
                                            <option value="ECE">ECE</option>
                                            <option value="MDS">MDS</option>
                                            <option value="EE">EE</option>
                                            <option value="Mech">Mech</option>
                                            <option value="Civil">Civil</option>
                                            <option value="MME">MME</option>
                                            <option value="Chem">Chem</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Min CTC (LPA)</label>
                                        <div className="relative">
                                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                            <input data-testid="ctc-input" type="number" placeholder="e.g. 5"
                                                value={minCtc} onChange={e => setMinCtc(e.target.value ? Number(e.target.value) : '')}
                                                className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none" />
                                        </div>
                                    </div>
                                    
                                    {(selectedBranch || minCtc !== '') && (
                                        <button onClick={() => { setSelectedBranch(''); setMinCtc(''); }}
                                            className="w-full py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50 rounded-lg transition-colors mt-2">
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0 space-y-6">
                        <AnimatePresence>
                            {(success || error) && (
                                <div className="flex flex-col gap-3 mb-6">
                                    {success && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                            className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm shadow-sm">
                                            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                                            <span className="font-medium">{success}</span>
                                        </motion.div>
                                    )}
                                    {error && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                            className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm shadow-sm">
                                            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                                            <span className="font-medium">{error}</span>
                                        </motion.div>
                                    )}
                                </div>
                            )}
                        </AnimatePresence>

                        {isLocked && (
                            <div data-testid="lock-notice" className="flex items-start gap-4 p-5 mb-6 rounded-xl bg-red-50 border border-red-200 shadow-sm">
                                <div className="mt-0.5 p-2 bg-red-100 rounded-lg">
                                    <Lock className="w-5 h-5 text-red-600 flex-shrink-0" />
                                </div>
                                <div>
                                    <p className="text-base font-bold text-red-900">Profile Locked</p>
                                    <p className="text-sm text-red-700 mt-1">{lockedReason || 'You are restricted from applying to new jobs.'}</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'jobs' && (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-xl font-bold text-gray-900">Recommended Roles</h2>
                                    <span className="text-sm text-gray-500 font-medium">{filteredJobs.length} results</span>
                                </div>
                                
                                {filteredJobs.length === 0 ? (
                                    <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center shadow-sm">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Briefcase className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">No roles found</h3>
                                        <p className="text-sm text-gray-500 max-w-sm mx-auto">
                                            {noJobsReason === 'FILTERED_OUT' && 'No jobs match your current filters. Try resetting branch/CTC filters.'}
                                            {noJobsReason === 'NO_OPEN_PUBLISHED_JOBS' && 'No currently open published jobs are available right now. Check back soon.'}
                                            {noJobsReason === 'API_ERROR' && 'Could not load jobs from server. Please refresh the page and try again.'}
                                            {noJobsReason === 'NONE' && 'Try adjusting your filters or check back later for new opportunities.'}
                                        </p>
                                        {hasActiveFilters && (
                                            <button
                                                onClick={() => { setSelectedBranch(''); setMinCtc(''); }}
                                                className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-200 hover:bg-primary-100 transition-colors"
                                            >
                                                Reset Filters
                                            </button>
                                        )}
                                        <div className="mt-5 mx-auto max-w-md rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left">
                                            <p className="text-xs font-semibold text-gray-600">
                                                Fetched: {jobsDiagnostics.totalFetchedJobs} | Visible: {jobsDiagnostics.jobsAfterServerVisibility} | After Branch: {jobsDiagnostics.jobsAfterBranchFilter} | After CTC: {jobsDiagnostics.jobsAfterCtcFilter}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Branch: {jobsDiagnostics.selectedBranch}, Min CTC: {jobsDiagnostics.minCtc}, API Error: {jobsDiagnostics.lastFetchError ? 'Yes' : 'No'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredJobs.map((job, i) => {
                                            const branches = parseJsonField(job.eligibleBranches);
                                            const reqFields = parseJsonField(job.requiredProfileFields);
                                            const isExpired = new Date() > new Date(job.applicationDeadline);
                                            const activeApplication = activeApplicationByJobId.get(job.id);
                                            const isApplied = appliedJobIds.has(job.id);
                                            const canWithdraw = !!activeApplication && !isExpired && String(activeApplication.status || '').toUpperCase() === 'APPLIED';
                                            const prof = getCompanyProfile(companyProfiles, job.companyName);
                                            const positiveFeatures = prof.highlyRatedFor.filter((s): s is string => typeof s === 'string' && !!s.trim());
                                            const negativeFeatures = prof.criticallyRatedFor.filter((s): s is string => typeof s === 'string' && !!s.trim());

                                            return (
                                                <motion.div key={job.id} data-testid="job-card"
                                                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                                    className="bg-white rounded-2xl border border-gray-200 overflow-visible hover:shadow-lg hover:border-primary-200 transition-all duration-300 group">
                                                    
                                                    <div className="p-6">
                                                        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                                                            <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 self-start group-hover:bg-primary-50 group-hover:border-primary-100 transition-colors">
                                                                    <img
                                                                        src={getCompanyProfile(companyProfiles, job.companyName).logoUrl || '/default-logo.png'}
                                                                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                                                        alt={`${job.companyName} logo`}
                                                                        className="w-10 h-10 object-contain"
                                                                    />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
                                                                    <div>
                                                                        <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">{job.role}</h3>
                                                                        <p className="text-base text-gray-600 font-medium flex items-center gap-2">
                                                                            {job.companyName}
                                                                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                                            <span className="text-gray-500 text-sm">{job.jobType || 'Full-Time'}</span>
                                                                        </p>
                                                                        <div className="text-xs font-semibold text-gray-500 mt-1">
                                                                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                                                            {typeof prof.rating === 'number' ? (
                                                                                <>
                                                                                    <StarRating rating={prof.rating} />
                                                                                    <span className={ratingColorClass(prof.rating)}>{prof.rating.toFixed(1)}/5</span>
                                                                                    {typeof prof.reviews === 'number' && (
                                                                                        <span className="text-gray-500 whitespace-nowrap">({formatCompactReviewCount(prof.reviews)} reviews)</span>
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
                                                                    <div className="flex-shrink-0 mt-2 sm:mt-0 relative">
                                                                        {isApplied ? (
                                                                            canWithdraw && activeApplication ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleWithdrawApplication(activeApplication.id)}
                                                                                    disabled={withdrawingApplicationId === activeApplication.id}
                                                                                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-700 border border-red-200 shadow-sm w-full sm:w-auto disabled:opacity-60"
                                                                                >
                                                                                    <XCircle className="w-4 h-4" />
                                                                                    {withdrawingApplicationId === activeApplication.id ? 'Withdrawing...' : 'Withdraw Application'}
                                                                                </button>
                                                                            ) : (
                                                                                <span className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm w-full sm:w-auto">
                                                                                    <CheckCircle2 className="w-4 h-4" />Applied
                                                                                </span>
                                                                            )
                                                                        ) : isExpired ? (
                                                                            <span className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 border border-red-200 shadow-sm w-full sm:w-auto">
                                                                                <XCircle className="w-4 h-4" />Closed
                                                                            </span>
                                                                        ) : isLocked ? (
                                                                            <button disabled className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-500 border border-gray-200 shadow-sm w-full sm:w-auto opacity-50 cursor-not-allowed">
                                                                                <Lock className="w-4 h-4" />Already Placed
                                                                            </button>
                                                                        ) : (
                                                                            <button onClick={() => handleApplyClick(job)}
                                                                                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-all shadow-sm hover:shadow-primary-500/25 w-full sm:w-auto transform active:scale-95">
                                                                                <Zap className="w-4 h-4" />Apply Now
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-wrap items-center gap-3 mt-4">
                                                                    {job.ctc && (
                                                                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg">
                                                                            <IndianRupee className="w-4 h-4 text-emerald-600" />
                                                                            <span className="text-sm font-bold text-gray-900">{job.ctc} LPA</span>
                                                                        </div>
                                                                    )}
                                                                    {job.cgpaMin > 0 && (
                                                                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg">
                                                                            <GraduationCap className="w-4 h-4 text-amber-600" />
                                                                            <span className="text-sm font-bold text-gray-900">{job.cgpaMin}+ CGPA</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg">
                                                                        <Clock className="w-4 h-4 text-blue-600" />
                                                                        <span className="text-sm font-bold text-gray-900">Deadline: {new Date(job.applicationDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                                    </div>
                                                                </div>

                                                                <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {branches.slice(0, 4).map((b: string, bi: number) => (
                                                                            <span key={bi} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100/50">{b}</span>
                                                                        ))}
                                                                        {reqFields.slice(0, 2).map((f: string, fi: number) => (
                                                                            <span key={fi} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">{f}</span>
                                                                        ))}
                                                                        {(branches.length > 4 || reqFields.length > 2) && (
                                                                            <span className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-500">+{Math.max(0, branches.length - 4) + Math.max(0, reqFields.length - 2)} more</span>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <button onClick={() => openJobDetails(job.id)} className="text-sm font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                                                        View Details <ArrowRight className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'applications' && (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-xl font-bold text-gray-900">Application History</h2>
                                </div>
                                
                                {myApplications.length === 0 ? (
                                    <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center shadow-sm">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <FileText className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">No applications yet</h3>
                                        <p className="text-sm text-gray-500 max-w-sm mx-auto">You haven't applied to any roles. Explore available jobs to kickstart your career journey.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {myApplications.map((app, i) => {
                                            const cfg = getStatusCfg(app.status);
                                            const keywords = parseJsonField(app.atsMatchedKeywords);
                                            const matchedSkills = parseJsonField(app.skillsMatched);
                                            const missingSkills = parseJsonField(app.skillsMissing);
                                            const suggestions = parseJsonField(app.suggestions);
                                            const atsExplanationClean = sanitizeJobMatchExplanation(String(app.atsExplanation || ''));
                                            return (
                                                <motion.div key={app.id}
                                                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                                    className={clsx('bg-white rounded-2xl border shadow-sm overflow-hidden relative', cfg.border)}>
                                                    
                                                    {/* Status accent edge */}
                                                    <div className={clsx('absolute left-0 top-0 bottom-0 w-1.5', cfg.bg, 'bg-opacity-100')} style={{ backgroundColor: cfg.color.replace('text-', '') /* mock */ }} />
                                                    
                                                    <div className="p-6 pl-8">
                                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-3 mb-2">
                                                                    <h4 className="text-lg font-bold text-gray-900">{app.job.role}</h4>
                                                                    <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border', cfg.bg, cfg.color, cfg.border)}>
                                                                        <cfg.icon className="w-3.5 h-3.5" />{cfg.label}
                                                                    </span>
                                                                </div>
                                                                <div className="text-base text-gray-600 font-medium flex items-center gap-2">
                                                                    <Building2 className="w-4 h-4 text-gray-400" />
                                                                    {app.job.companyName}
                                                                </div>
                                                                <div className="text-sm text-gray-500 mt-2 flex items-center gap-1.5">
                                                                    <Clock className="w-4 h-4 text-gray-400" />
                                                                    Applied on {new Date(app.appliedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                                </div>

                                                                {/* ATS Score */}
                                                                {app.atsScore != null && app.atsScore > 0 ? (
                                                                    <div className="mt-5 p-4 rounded-xl bg-gray-50 border border-gray-100 w-full max-w-md">
                                                                        <div className="flex items-center justify-between mb-3">
                                                                            <div className="flex items-center gap-2">
                                                                                <Sparkles className="w-4 h-4 text-primary-600" />
                                                                                <span className="text-sm font-bold text-gray-900">ATS Score</span>
                                                                            </div>
                                                                            <span className={clsx('px-2.5 py-1 rounded-lg text-xs font-bold border',
                                                                                app.atsScore >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                                                                app.atsScore >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                                                                'bg-red-50 text-red-700 border-red-200')}>
                                                                                {Math.round(Number(app.atsScore))} / 100
                                                                            </span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                                                                            <div className={clsx('h-2 rounded-full transition-all duration-1000',
                                                                                app.atsScore >= 70 ? 'bg-emerald-500' : app.atsScore >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                                                                                style={{ width: `${app.atsScore}%` }} />
                                                                        </div>
                                                                        {keywords.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                                                {keywords.slice(0, 6).map((kw: string, ki: number) => (
                                                                                    <span key={ki} className="px-2 py-0.5 rounded-md text-xs font-medium bg-white border border-gray-200 text-gray-600">{kw}</span>
                                                                                ))}
                                                                                {keywords.length > 6 && (
                                                                                    <span className="px-2 py-0.5 rounded-md text-xs font-medium text-gray-400">+{keywords.length - 6}</span>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        {atsExplanationClean && (
                                                                            <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                                                                                {atsExplanationClean}
                                                                            </p>
                                                                        )}
                                                                        {(matchedSkills.length > 0 || missingSkills.length > 0) && (
                                                                            <div className="mt-3 grid grid-cols-1 gap-2">
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {matchedSkills.map((skill: string, si: number) => (
                                                                                        <span key={`m-${si}`} className="px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 border border-emerald-100 text-emerald-700">{skill}</span>
                                                                                    ))}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {missingSkills.map((skill: string, si: number) => (
                                                                                        <span key={`x-${si}`} className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 border border-red-100 text-red-700">{skill}</span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {suggestions.length > 0 && (
                                                                            <div className="mt-3">
                                                                                <AtsSuggestionsPanel
                                                                                    suggestions={suggestions}
                                                                                    idPrefix={`app-${app.id}-sug`}
                                                                                    maxItems={5}
                                                                                    compact
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-200 w-full max-w-md">
                                                                        <p className="text-sm text-amber-800">ATS analysis is pending or temporarily unavailable. Your application is submitted successfully.</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            
                                                            {/* Timeline */}
                                                            {app.job.stages && app.job.stages.length > 0 && (
                                                                <div className="w-full md:w-64 flex-shrink-0 bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Application Journey</p>
                                                                    <div className="space-y-4">
                                                                        {app.job.stages.map((stage, idx) => (
                                                                            <div key={stage.id} className="relative flex gap-3">
                                                                                {idx !== app.job.stages!.length - 1 && (
                                                                                    <div className="absolute left-[7px] top-5 bottom-[-16px] w-0.5 bg-gray-200" />
                                                                                )}
                                                                                <div className={clsx('w-4 h-4 rounded-full flex-shrink-0 mt-0.5 z-10 ring-4 ring-gray-50',
                                                                                    stage.status === 'COMPLETED' ? 'bg-emerald-500' : 
                                                                                    stage.status === 'IN_PROGRESS' ? 'bg-primary-500' : 'bg-gray-300')} />
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className={clsx("text-sm font-bold", stage.status === 'COMPLETED' ? "text-gray-900" : "text-gray-600")}>{stage.name}</p>
                                                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                                                        {stage.status === 'COMPLETED' ? 'Completed' : 
                                                                                         stage.status === 'IN_PROGRESS' ? 'In Progress' : 
                                                                                         new Date(stage.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* === ADVANCED JOB DETAILS & APPLY MODAL (STEPPER UI) === */}
            <AnimatePresence>
                {applyingJob && (
                    <motion.div data-testid="apply-modal"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 lg:p-12 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col lg:flex-row overflow-hidden max-h-full">
                            
                            {/* Left Panel: Job Details */}
                            <div className="w-full lg:w-1/2 bg-white flex flex-col border-b lg:border-b-0 lg:border-r border-gray-100 max-h-[40vh] lg:max-h-full overflow-y-auto custom-scrollbar">
                                <div className="p-8">
                                    <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-6">
                                        <Building2 className="w-8 h-8 text-primary-600" />
                                    </div>
                                    <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{applyingJob.role}</h2>
                                    <p className="text-lg font-medium text-gray-600 mb-6">{applyingJob.companyName}</p>
                                    
                                    <div className="flex flex-wrap items-center gap-3 mb-8">
                                        {applyingJob.ctc && (
                                            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg">
                                                <IndianRupee className="w-4 h-4" />{applyingJob.ctc} LPA
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                                            <Briefcase className="w-4 h-4 text-gray-400" />{applyingJob.jobType || 'Full-Time'}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                                            <Calendar className="w-4 h-4 text-gray-400" />Apply by {new Date(applyingJob.applicationDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </span>
                                    </div>

                                    <div className="prose prose-sm sm:prose-base text-gray-600 max-w-none mb-8">
                                        <h3 className="text-lg font-bold text-gray-900 mb-3">About the Role</h3>
                                        <p className="whitespace-pre-wrap leading-relaxed">{applyingJob.description || 'No description provided for this role.'}</p>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-4">Requirements & Eligibility</h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                <p className="text-sm font-bold text-gray-500 mb-2">ELIGIBLE BRANCHES</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {parseJsonField(applyingJob.eligibleBranches).map((b: string) => (
                                                        <span key={b} className="px-2 py-1 rounded bg-white border border-gray-200 text-sm font-bold text-gray-700">{b}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                <p className="text-sm font-bold text-gray-500 mb-2">MINIMUM CGPA</p>
                                                <p className="text-lg font-bold text-gray-900">{applyingJob.cgpaMin || 0}</p>
                                            </div>
                                            {parseJsonField(applyingJob.requiredProfileFields).length > 0 && (
                                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                    <p className="text-sm font-bold text-gray-500 mb-2">REQUIRED PROFILE FIELDS</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {parseJsonField(applyingJob.requiredProfileFields).map((f: string) => (
                                                            <span key={f} className="px-2 py-1 rounded bg-white border border-gray-200 text-sm font-medium text-gray-700">{f}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Panel: Stepper Application Form */}
                            <div className="w-full lg:w-1/2 bg-gray-50 flex flex-col relative max-h-[60vh] lg:max-h-full overflow-y-auto">
                                <button onClick={() => setApplyingJob(null)} className="absolute top-6 right-6 p-2 rounded-full bg-white border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors z-10">
                                    <X className="w-5 h-5" />
                                </button>
                                
                                <div className="p-6 sm:p-8 flex flex-col h-full">
                                    
                                    {/* Stepper Header */}
                                    <div className="mb-8 pr-10">
                                        <h3 className="text-2xl font-bold text-gray-900 mb-6">Complete Application</h3>
                                        <div className="flex items-center justify-between relative">
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-gray-200 z-0" />
                                            {Array.from({ length: totalSteps }).map((_, idx) => {
                                                const stepNum = idx + 1;
                                                const active = currentStep === stepNum;
                                                const completed = currentStep > stepNum;
                                                return (
                                                    <div key={stepNum} className="relative z-10 flex flex-col items-center gap-2">
                                                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300',
                                                            completed ? 'bg-emerald-500 text-white ring-4 ring-emerald-50 border border-emerald-600' :
                                                            active ? 'bg-primary-600 text-white ring-4 ring-primary-50 border-2 border-primary-700 scale-110' :
                                                            'bg-white text-gray-400 border-2 border-gray-200'
                                                        )}>
                                                            {completed ? <Check className="w-4 h-4" /> : stepNum}
                                                        </div>
                                                        <span className={clsx('text-[10px] font-bold uppercase tracking-wider absolute -bottom-5 w-20 text-center',
                                                            active ? 'text-primary-700' : completed ? 'text-emerald-600' : 'text-gray-400')}>
                                                            {stepNum === 1 ? 'Resume' : (stepNum === 2 && hasQuestions) ? 'Questions' : 'Review'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Step Content */}
                                    <div className="flex-1 overflow-y-auto py-2 pr-2 custom-scrollbar relative">
                                        <AnimatePresence mode="wait">
                                            
                                            {/* STEP 1: RESUME SELECTION */}
                                            {currentStep === 1 && (
                                                <motion.div key="step1" data-testid="step-resume"
                                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
                                                    className="space-y-4">
                                                    <div>
                                                        <h4 className="text-lg font-bold text-gray-900 mb-1">Select your resume</h4>
                                                        <p className="text-sm text-gray-500"><strong>ATS Match</strong> is optional — use it to preview how your resume fits this job, or continue without scoring.</p>
                                                    </div>

                                                    {resumes.length === 0 ? (
                                                        <div className="p-6 rounded-xl border-2 border-dashed border-red-200 bg-red-50 text-center">
                                                            <FileText className="w-10 h-10 text-red-300 mx-auto mb-3" />
                                                            <p className="text-sm text-red-600 font-bold mb-2">No resumes found</p>
                                                            <Link to="/resumes" className="inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-700 bg-white px-4 py-2 rounded-lg shadow-sm border border-red-100">
                                                                Upload a resume <ArrowRight className="w-4 h-4" />
                                                            </Link>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {resumes.map((r) => (
                                                                <div key={r.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                                                    <label className={clsx('relative flex items-center gap-3 p-4 cursor-pointer transition-all',
                                                                        selectedResumeId === r.id ? 'bg-primary-50/50' : 'hover:bg-gray-50')}>
                                                                        <input type="radio" name="resume" value={r.id} className="sr-only" onChange={() => setSelectedResumeId(r.id)} />
                                                                        <div className={clsx('flex items-center justify-center w-6 h-6 rounded-full border-2 flex-shrink-0 transition-colors',
                                                                            selectedResumeId === r.id ? 'border-primary-500 text-primary-600' : 'border-gray-300 text-transparent')}>
                                                                            {selectedResumeId === r.id && <div className="w-2.5 h-2.5 bg-primary-600 rounded-full" />}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                                            <div className="min-w-0">
                                                                                <p className="text-base font-bold text-gray-900 truncate">{r.fileName}</p>
                                                                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> PDF</p>
                                                                            </div>
                                                                            {selectedResumeId === r.id && (
                                                                                <button
                                                                                    type="button"
                                                                                    data-testid="apply-ats-match-button"
                                                                                    disabled={matchScoreLoading}
                                                                                    onClick={(e) => { e.preventDefault(); fetchJobMatchScore(); }}
                                                                                    className="inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-60 transition-colors"
                                                                                >
                                                                                    {matchScoreLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                                                    ATS Match
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </label>

                                                                    {selectedResumeId === r.id && (
                                                                        <div className="border-t border-gray-100 px-4 pb-4 pt-2 space-y-3" data-testid="apply-ats-inline">
                                                                            {matchScoreLoading && (
                                                                                <p className="text-sm text-violet-700 font-medium flex items-center gap-2">
                                                                                    <Loader2 className="w-4 h-4 animate-spin" /> Calculating match against this job description…
                                                                                </p>
                                                                            )}
                                                                            {matchScoreError && (
                                                                                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-800 text-sm rounded-lg border border-red-100">
                                                                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {matchScoreError}
                                                                                </div>
                                                                            )}
                                                                            {jobMatchScore && !matchScoreLoading && (
                                                                                (() => {
                                                                                    const sd = jobMatchScore;
                                                                                    const displayScore = sd.matchScore ?? sd.score;
                                                                                    const isHigh = displayScore >= 70;
                                                                                    const isMed = displayScore >= 40 && displayScore < 70;
                                                                                    const explanationClean = sanitizeJobMatchExplanation(String(sd.explanation || ''));
                                                                                    return (
                                                                                        <div className="space-y-4">
                                                                                            <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                                                                                                <div className="flex items-center justify-between mb-3">
                                                                                                    <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                                                                        <Sparkles className="w-4 h-4 text-gray-400" /> Match score
                                                                                                    </span>
                                                                                                    <span className={clsx('text-xl font-black',
                                                                                                        isHigh ? 'text-emerald-600' : isMed ? 'text-amber-600' : 'text-red-600')}>
                                                                                                        {displayScore}<span className="text-sm font-bold text-gray-400">/100</span>
                                                                                                    </span>
                                                                                                </div>
                                                                                                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1">
                                                                                                    <motion.div
                                                                                                        initial={{ width: 0 }}
                                                                                                        animate={{ width: `${displayScore}%` }}
                                                                                                        transition={{ duration: 0.8, ease: 'easeOut' }}
                                                                                                        className={clsx('h-full rounded-full',
                                                                                                            isHigh ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                                                                                                            isMed ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                                                                            'bg-gradient-to-r from-red-400 to-red-500')}
                                                                                                    />
                                                                                                </div>
                                                                                                <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                                                                                    <span>0</span><span>Weak</span><span>Strong</span><span>100</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            {explanationClean && (
                                                                                                <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 leading-relaxed">
                                                                                                    {explanationClean}
                                                                                                </div>
                                                                                            )}
                                                                                            {sd.matchedKeywords?.length > 0 && (
                                                                                                <div>
                                                                                                    <h5 className="text-xs font-bold text-gray-600 mb-2">Keywords matched</h5>
                                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                                        {sd.matchedKeywords.map((kw, ki) => (
                                                                                                            <span key={ki} className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center gap-1">
                                                                                                                <Check className="w-3 h-3" />{kw}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                            {(sd.skillsMatched?.length || sd.skillsMissing?.length) ? (
                                                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                                                                                    <div>
                                                                                                        <h5 className="text-xs font-bold text-gray-600 mb-1.5">Matched skills</h5>
                                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                                            {(sd.skillsMatched || []).map((skill, si) => (
                                                                                                                <span key={`${skill}-${si}`} className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 border border-emerald-100 text-emerald-700">{skill}</span>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div>
                                                                                                        <h5 className="text-xs font-bold text-gray-600 mb-1.5">Missing skills</h5>
                                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                                            {(sd.skillsMissing || []).map((skill, si) => (
                                                                                                                <span key={`${skill}-${si}`} className="px-2 py-0.5 rounded text-xs font-semibold bg-red-50 border border-red-100 text-red-700">{skill}</span>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ) : null}
                                                                                            {sd.suggestions?.length ? (
                                                                                                <AtsSuggestionsPanel
                                                                                                    suggestions={sd.suggestions || []}
                                                                                                    idPrefix={`apply-ats-${selectedResumeId}`}
                                                                                                    maxItems={8}
                                                                                                />
                                                                                            ) : null}
                                                                                        </div>
                                                                                    );
                                                                                })()
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}

                                            {/* STEP 2: EMPLOYER QUESTIONS (Conditional) */}
                                            {currentStep === 2 && hasQuestions && (
                                                <motion.div key="step2-questions" data-testid="step-questions"
                                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
                                                    className="space-y-6">
                                                    <div>
                                                        <h4 className="text-lg font-bold text-gray-900 mb-1">Employer Questions</h4>
                                                        <p className="text-sm text-gray-500">Please answer the following questions required by the company.</p>
                                                    </div>
                                                    
                                                    <div className="space-y-5">
                                                        {applyingJob!.customQuestions.map((q) => (
                                                            <div key={q.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                                                <label className="block text-sm font-bold text-gray-800 mb-2">
                                                                    {q.label} {q.required && <span className="text-red-500">*</span>}
                                                                </label>
                                                                {q.type === 'textarea' ? (
                                                                    <textarea rows={3} value={customAnswers[q.label] || ''} placeholder="Write your answer here..."
                                                                        onChange={e => setCustomAnswers({ ...customAnswers, [q.label]: e.target.value })}
                                                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none transition-all shadow-inner bg-gray-50" />
                                                                ) : (
                                                                    <input type={q.type === 'url' ? 'url' : 'text'} value={customAnswers[q.label] || ''} placeholder="Your answer..."
                                                                        onChange={e => setCustomAnswers({ ...customAnswers, [q.label]: e.target.value })}
                                                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none transition-all shadow-inner bg-gray-50" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}


                                            {/* FINAL STEP: REVIEW & SUBMIT */}
                                            {currentStep === totalSteps && (
                                                <motion.div key="step-final" data-testid="step-review"
                                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
                                                    className="space-y-6">
                                                    <div className="text-center py-6">
                                                        <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-primary-100">
                                                            <LayoutList className="w-10 h-10 text-primary-600" />
                                                        </div>
                                                        <h4 className="text-2xl font-black text-gray-900 mb-2">Ready to Apply</h4>
                                                        <p className="text-base text-gray-500 max-w-sm mx-auto">You are about to submit your application for <strong>{applyingJob.role}</strong> at <strong>{applyingJob.companyName}</strong>.</p>
                                                    </div>

                                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                                            <span className="text-sm font-bold text-gray-500">Selected Resume</span>
                                                            <span className="text-sm font-bold text-gray-900">{resumes.find(r => r.id === selectedResumeId)?.fileName || 'None'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-bold text-gray-500">ATS Match Prediction</span>
                                                            <span className="text-sm font-bold text-gray-900">{jobMatchScore?.matchScore ?? jobMatchScore?.score ?? 'N/A'}/100</span>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                            
                                        </AnimatePresence>
                                        
                                        {applyError && (
                                            <div className="mt-4 flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-bold shadow-sm">
                                                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />{applyError}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons Footer */}
                                    <div className="mt-6 pt-5 border-t border-gray-200 flex items-center justify-between gap-4">
                                        <button type="button" onClick={handlePrevStep} disabled={currentStep === 1}
                                            className="px-6 py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-900 disabled:opacity-0 transition-all">
                                            Back
                                        </button>
                                        
                                        {currentStep < totalSteps ? (
                                            <button type="button" onClick={handleNextStep} disabled={currentStep === 1 && !selectedResumeId}
                                                className="flex-1 max-w-[200px] flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black shadow-md hover:shadow-lg disabled:opacity-50 transition-all">
                                                Next <ChevronRight className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button type="button" onClick={handleApplySubmit}
                                                className="flex-1 max-w-[250px] flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white text-base font-bold rounded-xl hover:bg-primary-700 shadow-lg hover:shadow-primary-500/25 transition-all transform active:scale-95">
                                                <Zap className="w-5 h-5" /> Submit Application
                                            </button>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* === JOB DETAILS (READ-ONLY) MODAL === */}
            <AnimatePresence>
                {jobDetailsModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 lg:p-12 overflow-y-auto"
                        onClick={() => setJobDetailsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 12 }}
                            transition={{ duration: 0.18 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="job-details-modal"
                        >
                            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-500 truncate">Company</p>
                                    <h2 className="text-2xl font-extrabold text-gray-900 truncate">
                                        {jobDetails?.companyName || '—'}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setJobDetailsModalOpen(false)}
                                    className="p-2 rounded-full bg-white border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0"
                                    aria-label="Close job details"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="px-6 py-5">
                                {jobDetailsLoading ? (
                                    <div className="flex items-center justify-center py-16">
                                        <div className="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    jobDetails && (
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold text-gray-500">Job Title</p>
                                                <p className="text-xl font-bold text-gray-900">{jobDetails.role}</p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Package</p>
                                                    <p className="text-sm font-bold text-gray-900">{jobDetails.ctc ? `${jobDetails.ctc} LPA` : 'Not specified'}</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 sm:col-span-2">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Location</p>
                                                    <p className="text-sm font-bold text-gray-900">{jobDetails.location || 'Not specified'}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <p className="text-sm font-semibold text-gray-900">Eligibility</p>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-700">
                                                        Branch: {jobDetails.eligibleBranches?.length ? jobDetails.eligibleBranches.join(', ') : 'Any'}
                                                    </span>
                                                    <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-700">
                                                        Minimum CGPA: {jobDetails.cgpaMin || 0}
                                                    </span>
                                                    {jobDetails.requiredProfileFields?.length ? (
                                                        <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-700">
                                                            Required fields: {jobDetails.requiredProfileFields.slice(0, 3).join(', ')}
                                                            {jobDetails.requiredProfileFields.length > 3 ? ` +${jobDetails.requiredProfileFields.length - 3}` : ''}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold text-gray-900">Job Description</p>
                                                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                                                    {jobDetails.description || 'No description provided for this role.'}
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold text-gray-900">Timeline</p>
                                                {jobDetails.stages && jobDetails.stages.length > 0 ? (
                                                    <div className="space-y-3">
                                                        {jobDetails.stages.map((stage) => (
                                                            <div key={stage.id} className="flex items-start gap-3">
                                                                <div className="w-2.5 h-2.5 rounded-full bg-primary-500 mt-2 flex-shrink-0" />
                                                                <div>
                                                                    <p className="text-sm font-bold text-gray-900">{stage.name}</p>
                                                                    <p className="text-xs text-gray-500">
                                                                        {stage.scheduledDate
                                                                            ? new Date(stage.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                                                            : 'TBD'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-gray-500">Timeline not available</p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold text-gray-900">Applicants</p>
                                                <p className="text-lg font-bold text-gray-900">
                                                    Applied by {jobApplicantsCount} students
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}

                                {/* Error must be shown below the modal content block */}
                                {!jobDetailsLoading && jobDetailsError && (
                                    <div
                                        data-testid="job-details-error"
                                        className="mt-4 flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-bold shadow-sm"
                                    >
                                        <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                                        {jobDetailsError}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
