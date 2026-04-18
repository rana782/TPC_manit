import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import {
    BarChart3,
    Building2,
    ChevronDown,
    Download,
    IndianRupee,
    LineChart as LineChartIcon,
    Target,
    Users,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type Overview = {
    totalStudents: number;
    placedStudents: number;
    placementRatePct: number;
    totalJobsPublished: number;
    totalCompanies: number;
    totalApplications: number;
    averageCtcLpa: number | null;
    medianCtcLpa: number | null;
};

type TrendRow = { year: number; placedStudents: number; jobsPosted: number; applications: number };
type BranchRow = {
    branch: string;
    totalStudents: number;
    placedStudents: number;
    placementRatePct: number;
    placementsWithCtc: number;
    minCtcLpa: number | null;
    maxCtcLpa: number | null;
    averageCtcLpa: number | null;
    medianCtcLpa: number | null;
};

type PlacementCtcSummary = {
    placementsWithCtc: number;
    minCtcLpa: number | null;
    maxCtcLpa: number | null;
    averageCtcLpa: number | null;
    medianCtcLpa: number | null;
};

type CompanyRow = {
    companyName: string;
    jobsPosted: number;
    placements: number;
    applications: number;
    averageCtcLpa: number | null;
    conversionRatePct: number;
};
type CtcBucket = { bucket: string; count: number };

function fmtLpa(n: number | null | undefined) {
    if (n == null || Number.isNaN(n)) return '—';
    return `${Number(n).toFixed(2)} LPA`;
}

function companyInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
}

export default function AnalyticsDashboard() {
    const { token, user, loading: authLoading } = useAuth();
    const apiBase = getViteApiBase();
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const [year, setYear] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [overview, setOverview] = useState<Overview | null>(null);
    const [trends, setTrends] = useState<TrendRow[]>([]);
    const [branches, setBranches] = useState<BranchRow[]>([]);
    const [placementCtcSummary, setPlacementCtcSummary] = useState<PlacementCtcSummary | null>(null);
    const [companies, setCompanies] = useState<CompanyRow[]>([]);
    const [ctcDist, setCtcDist] = useState<CtcBucket[]>([]);
    const [ctcStats, setCtcStats] = useState<{
        averageLpa: number | null;
        medianLpa: number | null;
        maxLpa: number | null;
    } | null>(null);

    const [exportOpen, setExportOpen] = useState(false);
    const exportRef = useRef<HTMLDivElement>(null);
    const [downloadingBranch, setDownloadingBranch] = useState<string | null>(null);

    const yearQuery = useMemo(() => (year ? `?year=${encodeURIComponent(year)}` : ''), [year]);

    const yearOptions = useMemo(() => {
        const ys = new Set<number>();
        for (const t of trends) ys.add(t.year);
        return [...ys].sort((a, b) => b - a);
    }, [trends]);

    const loadAll = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const q = yearQuery;
            const res = await axios.get(`${apiBase}/analytics/placement-dashboard${q}`, {
                headers,
                timeout: 120000,
            });
            const d = res.data;
            setOverview(d?.overview ?? null);
            setTrends(Array.isArray(d?.trends) ? d.trends : []);
            setBranches(Array.isArray(d?.branches) ? d.branches : []);
            setPlacementCtcSummary(d?.placementCtcSummary ?? null);
            setCompanies(Array.isArray(d?.companies) ? d.companies : []);
            setCtcDist(Array.isArray(d?.distribution) ? d.distribution : []);
            setCtcStats(d?.stats ?? null);
        } catch (err: unknown) {
            const ax = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
            const status = ax.response?.status;
            const msg = ax.response?.data?.message;
            if (status === 401) {
                setError('Session expired. Sign in again.');
            } else if (status === 403) {
                setError('You do not have access to placement analytics (SPOC or Coordinator only).');
            } else if (typeof msg === 'string' && msg.trim()) {
                setError(msg);
            } else if (ax.message === 'Network Error' || ax.message?.includes('timeout')) {
                setError('Request timed out or network error. Ensure the API is running and try again.');
            } else {
                setError('Failed to load placement analytics. Try again or check your connection.');
            }
            setOverview(null);
            setTrends([]);
            setBranches([]);
            setPlacementCtcSummary(null);
            setCompanies([]);
            setCtcDist([]);
            setCtcStats(null);
        } finally {
            setLoading(false);
        }
    }, [apiBase, headers, token, yearQuery]);

    useEffect(() => {
        if (authLoading) return;
        if (!token || !['SPOC', 'COORDINATOR'].includes(user?.role || '')) {
            setError('Access denied. Analytics is available for SPOC/Coordinator.');
            setLoading(false);
            return;
        }
        void loadAll();
    }, [authLoading, token, user?.role, loadAll]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
        };
        if (exportOpen) document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [exportOpen]);

    const branchChartData = useMemo(
        () =>
            branches.map((b) => ({
                branch: b.branch.length > 14 ? `${b.branch.slice(0, 12)}…` : b.branch,
                branchFull: b.branch,
                totalStudents: b.totalStudents,
                placedStudents: b.placedStudents,
                placementRatePct: b.placementRatePct,
            })),
        [branches]
    );

    const placementCtcChartData = useMemo(() => {
        const withCtc = branches.filter((b) => b.placementsWithCtc > 0);
        const sorted = [...withCtc].sort((a, b) => (b.averageCtcLpa ?? 0) - (a.averageCtcLpa ?? 0));
        return sorted.map((b) => ({
            branch: b.branch.length > 14 ? `${b.branch.slice(0, 12)}…` : b.branch,
            branchFull: b.branch,
            minLpa: b.minCtcLpa ?? 0,
            medianLpa: b.medianCtcLpa ?? 0,
            avgLpa: b.averageCtcLpa ?? 0,
            maxLpa: b.maxCtcLpa ?? 0,
            placedStudents: b.placedStudents,
            placementsWithCtc: b.placementsWithCtc,
        }));
    }, [branches]);

    const companyChartData = useMemo(() => {
        const sorted = [...companies].sort((a, b) => b.placements - a.placements);
        return sorted.slice(0, 14).map((c) => ({
            name: c.companyName.length > 22 ? `${c.companyName.slice(0, 20)}…` : c.companyName,
            nameFull: c.companyName,
            placements: c.placements,
            applications: c.applications,
            jobsPosted: c.jobsPosted,
        }));
    }, [companies]);

    const companyTableRows = useMemo(() => {
        return [...companies].sort((a, b) => b.placements - a.placements).slice(0, 14);
    }, [companies]);

    const funnelSteps = useMemo(() => {
        if (!overview) return [];
        const cohort = overview.totalStudents;
        const apps = overview.totalApplications;
        const placed = overview.placedStudents;
        const safeCohort = Math.max(cohort, 1);
        const appIntensity = Math.min(100, (apps / safeCohort) * 100);
        const placedPct = Math.min(100, (placed / safeCohort) * 100);
        return [
            { label: 'Student cohort', sub: 'Registered student pool', value: cohort, widthPct: 100 },
            {
                label: 'Application volume',
                sub: 'Total applications (all roles)',
                value: apps,
                widthPct: appIntensity,
            },
            {
                label: 'Placed',
                sub: `${overview.placementRatePct}% of cohort`,
                value: placed,
                widthPct: placedPct,
            },
        ];
    }, [overview]);

    const downloadCsv = async (type: 'branch' | 'company' | 'placement-ctc' | 'placement-ctc-total' | 'summary') => {
        if (!token) return;
        setExportOpen(false);
        try {
            const params = new URLSearchParams({ type });
            if (year) params.set('year', year);
            const resp = await fetch(`${apiBase}/analytics/export-dashboard?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error('export failed');
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analytics_${type}_${year || 'all'}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            setError('CSV export failed.');
        }
    };

    const downloadBranchExcel = async (branch: string) => {
        if (!token || !branch) return;
        setDownloadingBranch(branch);
        try {
            const params = new URLSearchParams({ branch });
            if (year) params.set('year', year);
            const resp = await fetch(`${apiBase}/analytics/branch-report-excel?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error('branch export failed');
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safe = branch.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'branch';
            a.download = `branch_placement_timeline_${safe}_${year || 'all'}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            setError('Failed to download branch placement Excel report.');
        } finally {
            setDownloadingBranch(null);
        }
    };

    if (authLoading || (loading && !overview && !error)) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[50vh]" data-testid="analytics-dashboard-loading">
                <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
            </div>
        );
    }

    if (error && !overview && !authLoading) {
        return (
            <div className="p-10 text-center" data-testid="analytics-dashboard-error">
                <p className="text-red-600 font-bold">{error}</p>
                <div className="mt-4">
                    <Link to="/dashboard" className="text-sm font-bold text-primary-700 underline">
                        Back to dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const kpi = overview;

    return (
        <div
            className="min-h-full bg-gradient-to-b from-slate-100/90 via-white to-slate-50"
            data-testid="analytics-dashboard-page"
        >
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-8 space-y-8">
                {/* Page header */}
                <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 border-b border-slate-200/80 pb-8">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
                            Placement cell · Intelligence
                        </p>
                        <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 tracking-tight">
                            Placement analytics
                        </h1>
                        <p className="text-sm text-slate-600 mt-2 max-w-xl leading-relaxed">
                            Decision-focused view of cohort outcomes, branch performance, recruiter activity, and
                            compensation distribution. All figures respect the academic year filter below.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                                Academic year
                            </span>
                            <select
                                data-testid="analytics-year-filter"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="bg-transparent border-none text-sm font-bold text-indigo-950 focus:ring-0 cursor-pointer pr-6 min-w-[7rem]"
                            >
                                <option value="">All years</option>
                                {yearOptions.map((y) => (
                                    <option key={y} value={String(y)}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {loading && (
                            <span className="text-xs text-slate-400 text-center sm:text-left" data-testid="analytics-refreshing">
                                Updating…
                            </span>
                        )}
                        <button
                            type="button"
                            data-testid="analytics-export-summary"
                            onClick={() => void downloadCsv('summary')}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-xs font-bold text-indigo-950 shadow-sm hover:bg-slate-50 transition-colors w-full sm:w-auto"
                        >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            Summary CSV
                        </button>
                        <div className="relative" ref={exportRef}>
                            <button
                                type="button"
                                onClick={() => setExportOpen((o) => !o)}
                                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-indigo-950 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md hover:bg-indigo-900 transition-colors"
                                aria-expanded={exportOpen}
                                aria-haspopup="menu"
                            >
                                <Download className="w-4 h-4 shrink-0" />
                                Export
                                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {exportOpen && (
                                <div
                                    className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                                    role="menu"
                                >
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void downloadCsv('summary')}
                                    >
                                        Summary CSV
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-testid="analytics-export-branch"
                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void downloadCsv('branch')}
                                    >
                                        Branch breakdown CSV
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-testid="analytics-export-company"
                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void downloadCsv('company')}
                                    >
                                        Company analytics CSV
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-testid="analytics-export-placement-ctc"
                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void downloadCsv('placement-ctc')}
                                    >
                                        Branch + CTC CSV
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        data-testid="analytics-export-placement-ctc-total"
                                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void downloadCsv('placement-ctc-total')}
                                    >
                                        CTC totals only CSV
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {error && overview && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3">
                        {error}
                    </p>
                )}

                {/* Primary KPI cards */}
                <section data-testid="analytics-kpi-section">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-primary-600" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Key performance</h2>
                    </div>
                    {!kpi ? (
                        <p className="text-sm text-slate-500">No overview data.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm hover:border-indigo-200/60 transition-colors">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                                    Placed students
                                </p>
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-3xl font-display font-bold text-indigo-950 tabular-nums">
                                        {kpi.placedStudents.toLocaleString()}
                                    </p>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-2">
                                    From {kpi.totalStudents.toLocaleString()} in cohort · {kpi.placementRatePct}% rate
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm hover:border-indigo-200/60 transition-colors">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                                    Average CTC
                                </p>
                                <p className="text-3xl font-display font-bold text-indigo-950">{fmtLpa(kpi.averageCtcLpa)}</p>
                                <p className="text-[11px] text-slate-400 mt-2">Median {fmtLpa(kpi.medianCtcLpa)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm hover:border-indigo-200/60 transition-colors">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                                    Applications
                                </p>
                                <p className="text-3xl font-display font-bold text-indigo-950 tabular-nums">
                                    {kpi.totalApplications.toLocaleString()}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-2">
                                    Across {kpi.totalJobsPublished} published roles · {kpi.totalCompanies} companies
                                </p>
                            </div>
                        </div>
                    )}
                </section>

                {/* Trends + funnel */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <section
                        className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
                        data-testid="analytics-trends-section"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                            <div>
                                <h2 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                                    <LineChartIcon className="w-5 h-5 text-emerald-600 shrink-0" />
                                    Placement trends
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">
                                    Year-over-year placed students, jobs posted, and application volume.
                                </p>
                            </div>
                        </div>
                        {trends.length === 0 ? (
                            <p className="text-sm text-slate-500 py-16 text-center">No trend data for this filter.</p>
                        ) : (
                            <div className="h-80 w-full min-h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="gPlaced" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                                                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="gJobs" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.3} />
                                                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="gApps" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.28} />
                                                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                                            formatter={(v: number, name: string) => [v, name]}
                                        />
                                        <Legend />
                                        <Area
                                            type="monotone"
                                            dataKey="placedStudents"
                                            name="Placed"
                                            stroke="#059669"
                                            fill="url(#gPlaced)"
                                            strokeWidth={2}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="jobsPosted"
                                            name="Jobs posted"
                                            stroke="#2563eb"
                                            fill="url(#gJobs)"
                                            strokeWidth={2}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="applications"
                                            name="Applications"
                                            stroke="#7c3aed"
                                            fill="url(#gApps)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </section>

                    <section
                        className="rounded-2xl bg-indigo-950 text-white p-6 shadow-xl flex flex-col"
                        data-testid="analytics-funnel-section"
                    >
                        <h2 className="text-lg font-display font-bold">Recruitment funnel</h2>
                        <p className="text-xs text-indigo-200/90 mt-1 mb-6 leading-relaxed">
                            Cohort-to-outcome flow from live data. Bar width is normalized to cohort size for comparison.
                        </p>
                        {!overview || funnelSteps.length === 0 ? (
                            <p className="text-sm text-indigo-200/80 py-8">No funnel data.</p>
                        ) : (
                            <div className="flex flex-col gap-6 flex-1">
                                {funnelSteps.map((step, i) => (
                                    <div key={step.label} className="relative">
                                        <div className="flex justify-between items-baseline gap-2 mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">
                                                {step.label}
                                            </span>
                                            <span className="font-display font-bold text-lg tabular-nums shrink-0">
                                                {step.value.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    i === 0 ? 'bg-white' : 'bg-indigo-300'
                                                }`}
                                                style={{ width: `${step.widthPct}%` }}
                                            />
                                        </div>
                                        <p className="text-[10px] text-indigo-300/90 mt-1.5">{step.sub}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Branch unified section */}
                <section
                    className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
                    data-testid="analytics-branch-section"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                                <Users className="w-5 h-5 text-primary-600 shrink-0" />
                                Branch vs placed
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Cohort, placed count, and placement rate merged in one view. Click any bar to download that branch Excel report.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                            <span className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1">
                                Branches: {branchChartData.length}
                            </span>
                            <span className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1">
                                Best rate: {branches.length ? `${Math.max(...branches.map((b) => b.placementRatePct)).toFixed(2)}%` : '—'}
                            </span>
                            {downloadingBranch && (
                                <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-indigo-800">
                                    Downloading {downloadingBranch} report...
                                </span>
                            )}
                        </div>
                    </div>
                    {branchChartData.length === 0 ? (
                        <p className="text-sm text-slate-500 py-12 text-center">No branch data for this year filter.</p>
                    ) : (
                        <>
                            <div className="h-80 w-full min-h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={branchChartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="branch" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: 12 }}
                                            formatter={(v: number, name: string, item) => {
                                                if (name === 'Placed') {
                                                    const rate = item?.payload?.placementRatePct;
                                                    return [`${v} (Rate ${Number(rate ?? 0).toFixed(2)}%)`, name];
                                                }
                                                return [v, name];
                                            }}
                                            labelFormatter={(_, p) => (p?.[0]?.payload?.branchFull as string) || ''}
                                        />
                                        <Legend />
                                        <Bar
                                            dataKey="totalStudents"
                                            name="Cohort"
                                            fill="#93c5fd"
                                            radius={[4, 4, 0, 0]}
                                            cursor="pointer"
                                            onClick={(d: { branchFull?: string }) => void downloadBranchExcel(d?.branchFull || '')}
                                        />
                                        <Bar
                                            dataKey="placedStudents"
                                            name="Placed"
                                            fill="#34d399"
                                            radius={[4, 4, 0, 0]}
                                            cursor="pointer"
                                            onClick={(d: { branchFull?: string }) => void downloadBranchExcel(d?.branchFull || '')}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">
                                Excel report includes: placement timeline, student, company, CTC, resume link, LinkedIn link, and min/max/avg/median CTC summary.
                            </p>
                        </>
                    )}
                </section>

                {/* CTC by branch */}
                <section
                    className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
                    data-testid="analytics-placement-ctc-section"
                >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                            <h2 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                                <IndianRupee className="w-5 h-5 text-emerald-600 shrink-0" />
                                Package spread by branch
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Min, median, average, and max LPA where placement CTC is recorded.
                            </p>
                        </div>
                    </div>
                    {placementCtcSummary && placementCtcSummary.placementsWithCtc > 0 && (
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600 mb-4">
                            <span className="bg-slate-50 rounded-lg px-2.5 py-1 border border-slate-100">
                                Records: {placementCtcSummary.placementsWithCtc}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2.5 py-1 border border-slate-100">
                                Min {fmtLpa(placementCtcSummary.minCtcLpa)}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2.5 py-1 border border-slate-100">
                                Max {fmtLpa(placementCtcSummary.maxCtcLpa)}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2.5 py-1 border border-slate-100">
                                Avg {fmtLpa(placementCtcSummary.averageCtcLpa)}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2.5 py-1 border border-slate-100">
                                Median {fmtLpa(placementCtcSummary.medianCtcLpa)}
                            </span>
                        </div>
                    )}
                    {placementCtcChartData.length === 0 ? (
                        <p className="text-sm text-slate-500 py-12 text-center">No branch-level CTC data for this filter.</p>
                    ) : (
                        <div
                            className="w-full"
                            style={{ height: Math.min(480, Math.max(280, placementCtcChartData.length * 56)) }}
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={placementCtcChartData}
                                    margin={{ top: 8, right: 24, left: 4, bottom: 8 }}
                                    barCategoryGap="12%"
                                    barGap={0}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 11 }}
                                        domain={([, max]) => [0, Math.max(1, Math.ceil((max ?? 0) * 1.08))]}
                                        label={{
                                            value: 'LPA',
                                            position: 'insideBottomRight',
                                            offset: -2,
                                            style: { fontSize: 11, fill: '#64748b' },
                                        }}
                                    />
                                    <YAxis type="category" dataKey="branch" width={100} tick={{ fontSize: 10 }} interval={0} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(5, 150, 105, 0.06)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const p = payload[0].payload as (typeof placementCtcChartData)[0];
                                            return (
                                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md max-w-[260px]">
                                                    <p className="font-bold text-slate-900">{p.branchFull}</p>
                                                    <p className="text-slate-600 mt-1">
                                                        Placed: {p.placedStudents} · With CTC: {p.placementsWithCtc}
                                                    </p>
                                                    <p className="text-slate-500">
                                                        Min {p.minLpa.toFixed(2)} · Median {p.medianLpa.toFixed(2)} · Avg{' '}
                                                        {p.avgLpa.toFixed(2)} · Max {p.maxLpa.toFixed(2)} LPA
                                                    </p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 6 }} />
                                    <Bar dataKey="minLpa" name="Min (LPA)" fill="#64748b" radius={[0, 3, 3, 0]} maxBarSize={14} />
                                    <Bar dataKey="medianLpa" name="Median (LPA)" fill="#6366f1" radius={[0, 3, 3, 0]} maxBarSize={14} />
                                    <Bar dataKey="avgLpa" name="Avg (LPA)" fill="#059669" radius={[0, 3, 3, 0]} maxBarSize={14} />
                                    <Bar dataKey="maxLpa" name="Max (LPA)" fill="#ea580c" radius={[0, 3, 3, 0]} maxBarSize={14} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>

                {/* Company analytics + CTC distribution — symmetric paired cards */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
                    <section
                        className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
                        data-testid="analytics-company-section"
                    >
                        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-6 pb-4 pt-6">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
                                <Building2 className="h-5 w-5 text-indigo-600" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="font-display text-lg font-bold text-slate-900">Company analytics</h2>
                                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                    Leading recruiters by placements and application volume for the current filter.
                                </p>
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col">
                            {companyTableRows.length === 0 ? (
                                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                                    <Building2 className="h-10 w-10 text-slate-200" aria-hidden />
                                    <p className="text-sm font-medium text-slate-600">No company activity for this filter.</p>
                                    <p className="max-w-xs text-xs text-slate-400">Try clearing the academic year or widening the scope.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="min-h-0 max-h-[200px] flex-1 overflow-auto border-b border-slate-100">
                                        <table className="w-full min-w-[520px] text-sm">
                                            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm">
                                                <tr className="text-left">
                                                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Company
                                                    </th>
                                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Jobs
                                                    </th>
                                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Apps
                                                    </th>
                                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Placed
                                                    </th>
                                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Avg CTC
                                                    </th>
                                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Conv.
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {companyTableRows.map((c) => (
                                                    <tr key={c.companyName} className="transition-colors hover:bg-slate-50/80">
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex min-w-0 items-center gap-2.5">
                                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-indigo-900">
                                                                    {companyInitials(c.companyName)}
                                                                </span>
                                                                <span className="truncate font-semibold text-slate-900">{c.companyName}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.jobsPosted}</td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.applications}</td>
                                                        <td className="px-4 py-2.5 text-right text-base font-bold tabular-nums text-indigo-950">
                                                            {c.placements}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">
                                                            {fmtLpa(c.averageCtcLpa)}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.conversionRatePct}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="shrink-0 border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-6 py-4">
                                        <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
                                            Placements vs applications
                                        </p>
                                        {companyChartData.length > 0 ? (
                                            <div className="h-[240px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart
                                                        layout="vertical"
                                                        data={companyChartData}
                                                        margin={{ top: 4, right: 16, left: 0, bottom: 8 }}
                                                        barCategoryGap="14%"
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                                        <YAxis
                                                            type="category"
                                                            dataKey="name"
                                                            width={88}
                                                            tick={{ fontSize: 10 }}
                                                            tickLine={false}
                                                            axisLine={false}
                                                        />
                                                        <Tooltip
                                                            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                                                            formatter={(v: number, name: string) => [v, name]}
                                                            labelFormatter={(_, p) => (p?.[0]?.payload?.nameFull as string) || ''}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                                                        <Bar dataKey="placements" name="Placements" fill="#4f46e5" radius={[0, 4, 4, 0]} maxBarSize={18} />
                                                        <Bar dataKey="applications" name="Applications" fill="#a5b4fc" radius={[0, 4, 4, 0]} maxBarSize={18} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        ) : (
                                            <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 text-center">
                                                <BarChart3 className="mb-2 h-8 w-8 text-slate-200" aria-hidden />
                                                <p className="text-xs font-medium text-slate-500">Not enough data for a comparison chart</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    <section
                        className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
                        data-testid="analytics-ctc-section"
                    >
                        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-6 pb-4 pt-6">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 ring-1 ring-teal-100">
                                <IndianRupee className="h-5 w-5 text-teal-700" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="font-display text-lg font-bold text-slate-900">CTC distribution</h2>
                                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                    Placement packages grouped in LPA buckets — aligned with company metrics for the same scope.
                                </p>
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-4">
                            {ctcDist.length === 0 || ctcDist.every((b) => b.count === 0) ? (
                                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
                                    <IndianRupee className="h-10 w-10 text-slate-200" aria-hidden />
                                    <p className="text-sm font-medium text-slate-600">No CTC data for this filter.</p>
                                    <p className="max-w-xs text-xs text-slate-400">Placements with recorded CTC will appear here.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-4 flex flex-wrap gap-2">
                                        <span className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                            Avg {fmtLpa(ctcStats?.averageLpa ?? null)}
                                        </span>
                                        <span className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                            Median {fmtLpa(ctcStats?.medianLpa ?? null)}
                                        </span>
                                        <span className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                            Max {ctcStats?.maxLpa != null ? `${ctcStats.maxLpa.toFixed(2)} LPA` : '—'}
                                        </span>
                                    </div>
                                    <div className="mt-auto shrink-0 border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white pt-4">
                                        <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
                                            Count by package band
                                        </p>
                                        <div className="h-[240px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={ctcDist} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                    <XAxis
                                                        dataKey="bucket"
                                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                                        interval={0}
                                                        height={48}
                                                        tickMargin={8}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{
                                                            borderRadius: 12,
                                                            border: '1px solid #e2e8f0',
                                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                                                        }}
                                                        formatter={(v: number) => [`${v} placements`, 'Count']}
                                                        labelStyle={{ fontWeight: 700, color: '#0f172a' }}
                                                    />
                                                    <Bar dataKey="count" name="Placements" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={48} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
