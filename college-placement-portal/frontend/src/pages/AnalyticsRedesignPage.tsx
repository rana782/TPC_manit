import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import {
    BarChart3,
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
    lockedProfiles: number;
    studentsWithBacklogs: number;
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

export default function AnalyticsRedesignPage() {
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
    const [ctcStats, setCtcStats] = useState<{ averageLpa: number | null; medianLpa: number | null; maxLpa: number | null } | null>(
        null
    );

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
            const [ovRes, trRes, brRes, coRes, ctRes] = await Promise.all([
                axios.get(`${apiBase}/analytics/overview${q}`, { headers }),
                axios.get(`${apiBase}/analytics/trends${q}`, { headers }),
                axios.get(`${apiBase}/analytics/branch${q}`, { headers }),
                axios.get(`${apiBase}/analytics/company${q}`, { headers }),
                axios.get(`${apiBase}/analytics/ctc${q}`, { headers }),
            ]);

            setOverview(ovRes.data?.overview ?? null);
            setTrends(Array.isArray(trRes.data?.trends) ? trRes.data.trends : []);
            setBranches(Array.isArray(brRes.data?.branches) ? brRes.data.branches : []);
            setPlacementCtcSummary(brRes.data?.placementCtcSummary ?? null);
            setCompanies(Array.isArray(coRes.data?.companies) ? coRes.data.companies : []);
            setCtcDist(Array.isArray(ctRes.data?.distribution) ? ctRes.data.distribution : []);
            setCtcStats(ctRes.data?.stats ?? null);
        } catch {
            setError('Failed to load placement analytics. Try again or check your connection.');
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

    const branchChartData = useMemo(
        () =>
            branches.map((b) => ({
                branch: b.branch.length > 14 ? `${b.branch.slice(0, 12)}…` : b.branch,
                branchFull: b.branch,
                totalStudents: b.totalStudents,
                placedStudents: b.placedStudents,
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

    const downloadCsv = async (type: 'branch' | 'company' | 'placement-ctc' | 'placement-ctc-total' | 'summary') => {
        if (!token) return;
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
        <div className="space-y-8 max-w-7xl mx-auto pb-12" data-testid="analytics-dashboard-page">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                        <Target className="w-7 h-7 text-primary-600" />
                        Placement command center
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Year-scoped metrics across applications, jobs, and placements — live data only.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-bold text-gray-500 uppercase shrink-0">Year</label>
                    <select
                        data-testid="analytics-year-filter"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white shadow-sm min-w-[160px]"
                    >
                        <option value="">All years</option>
                        {yearOptions.map((y) => (
                            <option key={y} value={String(y)}>
                                {y}
                            </option>
                        ))}
                    </select>
                    {loading && (
                        <span className="text-xs text-gray-400" data-testid="analytics-refreshing">
                            Updating…
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => void downloadCsv('summary')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-primary-700 shadow-sm hover:bg-primary-50"
                        data-testid="analytics-export-summary"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Summary CSV
                    </button>
                </div>
            </div>

            {error && overview && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{error}</p>}

            {/* KPI */}
            <section data-testid="analytics-kpi-section">
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-3">KPI overview</h2>
                {!kpi ? (
                    <p className="text-sm text-gray-500">No overview data.</p>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {[
                            { label: 'Total students', value: kpi.totalStudents },
                            { label: 'Placed students', value: kpi.placedStudents },
                            { label: 'Placement rate', value: `${kpi.placementRatePct}%` },
                            { label: 'Jobs published', value: kpi.totalJobsPublished },
                            { label: 'Companies', value: kpi.totalCompanies },
                            { label: 'Applications', value: kpi.totalApplications },
                            { label: 'Avg CTC', value: fmtLpa(kpi.averageCtcLpa) },
                            { label: 'Median CTC', value: fmtLpa(kpi.medianCtcLpa) },
                            { label: 'Locked profiles', value: kpi.lockedProfiles },
                            { label: 'With backlogs', value: kpi.studentsWithBacklogs },
                        ].map((c) => (
                            <div
                                key={c.label}
                                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:border-primary-100 transition-colors"
                            >
                                <p className="text-[11px] font-bold text-gray-500 uppercase leading-tight">{c.label}</p>
                                <p className="text-xl font-black text-gray-900 mt-1 tabular-nums">{c.value}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Trends */}
            <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm" data-testid="analytics-trends-section">
                <h2 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
                    <LineChartIcon className="w-5 h-5 text-emerald-600" />
                    Placement trends
                </h2>
                <p className="text-xs text-gray-500 mb-4">By calendar year: placed students, jobs posted, applications.</p>
                {trends.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">No trend data for this filter.</p>
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                                    formatter={(v: number, name: string) => [v, name]}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="placedStudents" name="Placed" stroke="#059669" fill="url(#gPlaced)" strokeWidth={2} />
                                <Area type="monotone" dataKey="jobsPosted" name="Jobs posted" stroke="#2563eb" fill="url(#gJobs)" strokeWidth={2} />
                                <Area type="monotone" dataKey="applications" name="Applications" stroke="#7c3aed" fill="url(#gApps)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Branch intelligence */}
                <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm" data-testid="analytics-branch-section">
                    <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <Users className="w-5 h-5 text-primary-600" />
                                Branch intelligence
                            </h2>
                            <p className="text-xs text-gray-500 mt-1">Application cohort size vs placed students by branch.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void downloadCsv('branch')}
                            className="shrink-0 text-xs font-bold text-primary-700 flex items-center gap-1 hover:underline"
                            data-testid="analytics-export-branch"
                        >
                            <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                    </div>
                    {branchChartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-10 text-center">No branch data for this year filter.</p>
                    ) : (
                        <div className="h-80 w-full min-h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={branchChartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                    <XAxis dataKey="branch" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: 12 }}
                                        formatter={(v: number, name: string) => [v, name]}
                                        labelFormatter={(_, p) => (p?.[0]?.payload?.branchFull as string) || ''}
                                    />
                                    <Legend />
                                    <Bar dataKey="totalStudents" name="Students (cohort)" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="placedStudents" name="Placed" fill="#34d399" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>

                {/* Placement CTC by branch */}
                <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm" data-testid="analytics-placement-ctc-section">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <IndianRupee className="w-5 h-5 text-emerald-600" />
                                Placement package by branch
                            </h2>
                            <p className="text-xs text-gray-500 mt-1">
                                Min / median / average / max LPA from placement records with a parseable CTC (horizontal bars per branch).
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => void downloadCsv('placement-ctc')}
                                className="text-xs font-bold text-primary-700 flex items-center gap-1 hover:underline"
                                data-testid="analytics-export-placement-ctc"
                            >
                                <Download className="w-3.5 h-3.5" /> Branch + total CSV
                            </button>
                            <button
                                type="button"
                                onClick={() => void downloadCsv('placement-ctc-total')}
                                className="text-xs font-bold text-primary-700 flex items-center gap-1 hover:underline"
                                data-testid="analytics-export-placement-ctc-total"
                            >
                                <Download className="w-3.5 h-3.5" /> Total only
                            </button>
                        </div>
                    </div>
                    {placementCtcSummary && placementCtcSummary.placementsWithCtc > 0 && (
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600 mb-3">
                            <span className="bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                                Records with CTC: {placementCtcSummary.placementsWithCtc}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                                Global min {fmtLpa(placementCtcSummary.minCtcLpa)}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                                Global max {fmtLpa(placementCtcSummary.maxCtcLpa)}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                                Global avg {fmtLpa(placementCtcSummary.averageCtcLpa)}
                            </span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                                Global median {fmtLpa(placementCtcSummary.medianCtcLpa)}
                            </span>
                        </div>
                    )}
                    {placementCtcChartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-10 text-center">No branch-level CTC data for this filter.</p>
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
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 11 }}
                                        domain={([, max]) => [0, Math.max(1, Math.ceil((max ?? 0) * 1.08))]}
                                        label={{ value: 'LPA', position: 'insideBottomRight', offset: -2, style: { fontSize: 11, fill: '#6b7280' } }}
                                    />
                                    <YAxis type="category" dataKey="branch" width={100} tick={{ fontSize: 10 }} interval={0} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(5, 150, 105, 0.06)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const p = payload[0].payload as (typeof placementCtcChartData)[0];
                                            return (
                                                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md max-w-[260px]">
                                                    <p className="font-bold text-gray-900">{p.branchFull}</p>
                                                    <p className="text-slate-600 mt-1">Placed: {p.placedStudents} · With CTC: {p.placementsWithCtc}</p>
                                                    <p className="text-slate-500">Min {p.minLpa.toFixed(2)} · Median {p.medianLpa.toFixed(2)} · Avg {p.avgLpa.toFixed(2)} · Max {p.maxLpa.toFixed(2)} LPA</p>
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
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Company */}
                <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm" data-testid="analytics-company-section">
                    <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-indigo-600" />
                                Company intelligence
                            </h2>
                            <p className="text-xs text-gray-500 mt-1">Top companies by placements (scoped year).</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void downloadCsv('company')}
                            className="shrink-0 text-xs font-bold text-primary-700 flex items-center gap-1 hover:underline"
                            data-testid="analytics-export-company"
                        >
                            <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                    </div>
                    {companyChartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-10 text-center">No company activity for this filter.</p>
                    ) : (
                        <div className="h-96 w-full min-h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart layout="vertical" data={companyChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: 12 }}
                                        formatter={(v: number, name: string) => [v, name]}
                                        labelFormatter={(_, p) => (p?.[0]?.payload?.nameFull as string) || ''}
                                    />
                                    <Legend />
                                    <Bar dataKey="placements" name="Placements" fill="#6366f1" radius={[0, 4, 4, 0]} />
                                    <Bar dataKey="applications" name="Applications" fill="#a5b4fc" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>

                {/* CTC */}
                <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm" data-testid="analytics-ctc-section">
                    <h2 className="text-lg font-black text-gray-900 mb-1">CTC distribution</h2>
                    <p className="text-xs text-gray-500 mb-3">Placement packages in LPA buckets for the selected placement year scope.</p>
                    {ctcDist.length === 0 || ctcDist.every((b) => b.count === 0) ? (
                        <p className="text-sm text-gray-500 py-10 text-center">No CTC data for this filter.</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-3 text-xs font-semibold text-gray-600 mb-3">
                                <span className="bg-gray-50 rounded-lg px-2 py-1">Avg {fmtLpa(ctcStats?.averageLpa ?? null)}</span>
                                <span className="bg-gray-50 rounded-lg px-2 py-1">Median {fmtLpa(ctcStats?.medianLpa ?? null)}</span>
                                <span className="bg-gray-50 rounded-lg px-2 py-1">
                                    Max {ctcStats?.maxLpa != null ? `${ctcStats.maxLpa.toFixed(2)} LPA` : '—'}
                                </span>
                            </div>
                            <div className="h-72 w-full min-h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={ctcDist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <Tooltip contentStyle={{ borderRadius: 12 }} />
                                        <Bar dataKey="count" name="Placements" fill="#0d9488" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
