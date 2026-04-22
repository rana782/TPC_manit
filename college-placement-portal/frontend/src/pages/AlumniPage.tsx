import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import { TPC_ELIGIBLE_BRANCHES } from '../constants/tpcBranches';
import {
    ExternalLink,
    Search,
    Users,
    Building2,
    IndianRupee,
    GraduationCap,
    BarChart3,
    LayoutGrid,
    Table2,
    X,
    TrendingUp,
    ChevronRight,
    Download,
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Area,
    AreaChart,
} from 'recharts';

interface AlumniRecord {
    id: string;
    name: string;
    branch: string;
    role: string;
    ctc: string;
    placementYear: number;
    companyName: string;
    linkedinUrl: string | null;
}

function parseCtc(value?: string | null): number | null {
    if (!value) return null;
    const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

type ResultsView = 'table' | 'cards';

export default function AlumniPage() {
    const { token } = useAuth();
    const apiBase = getViteApiBase();
    const [query, setQuery] = useState('');
    const [branch, setBranch] = useState('All');
    const [year, setYear] = useState('All');
    const [rows, setRows] = useState<AlumniRecord[]>([]);
    const [allRows, setAllRows] = useState<AlumniRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [resultsView, setResultsView] = useState<ResultsView>('table');
    const [exporting, setExporting] = useState(false);

    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
    const queryRef = useRef(query);
    queryRef.current = query;

    const runSearch = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const q = queryRef.current.trim();
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (branch !== 'All') params.set('branch', branch);
            if (year !== 'All') params.set('year', year);
            const queryString = params.toString();
            const res = await axios.get(`${apiBase}/alumni/search${queryString ? `?${queryString}` : ''}`, { headers });
            setRows(res.data?.data || []);
        } catch {
            setError('Failed to search alumni.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [apiBase, branch, headers, year]);

    useEffect(() => {
        if (token) void runSearch();
    }, [token, branch, year, runSearch]);

    useEffect(() => {
        if (!token) return;
        const fetchAllForFilters = async () => {
            try {
                const res = await axios.get(`${apiBase}/alumni/search`, { headers });
                setAllRows(res.data?.data || []);
            } catch {
                setAllRows([]);
            }
        };
        void fetchAllForFilters();
    }, [token, apiBase, headers]);

    const branchOptions = useMemo(() => ['All', ...TPC_ELIGIBLE_BRANCHES], []);

    const yearOptions = useMemo(() => {
        const opts = Array.from(new Set(allRows.map((r) => String(r.placementYear || '')).filter(Boolean))).sort(
            (a, b) => Number(b) - Number(a)
        );
        return ['All', ...opts];
    }, [allRows]);

    const totalAlumni = rows.length;
    const ctcValues = rows.map((r) => parseCtc(r.ctc)).filter((v): v is number => v != null);
    const avgPackage = ctcValues.length ? ctcValues.reduce((s, n) => s + n, 0) / ctcValues.length : null;

    const branchOrder = useMemo(
        () => new Map([...TPC_ELIGIBLE_BRANCHES, 'Other', 'Unknown', 'Unspecified'].map((b, i) => [b, i])),
        []
    );
    const branchCounts = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach((r) => {
            const b = r.branch || 'Unknown';
            map[b] = (map[b] || 0) + 1;
        });
        return Object.entries(map)
            .map(([branchLabel, count]) => ({ branch: branchLabel, count }))
            .sort(
                (a, b) =>
                    (branchOrder.get(a.branch) ?? 99) - (branchOrder.get(b.branch) ?? 99) || b.count - a.count
            );
    }, [rows, branchOrder]);

    const branchPackageStats = useMemo(() => {
        const map: Record<string, number[]> = {};
        for (const r of rows) {
            const ctc = parseCtc(r.ctc);
            if (ctc == null) continue;
            const b = (r.branch || 'Unknown').trim() || 'Unknown';
            if (!map[b]) map[b] = [];
            map[b].push(ctc);
        }
        return Object.entries(map)
            .map(([branchFull, values]) => {
                const n = values.length;
                const sum = values.reduce((acc, x) => acc + x, 0);
                const sorted = [...values].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                const median =
                    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
                const display = branchFull.length > 16 ? `${branchFull.slice(0, 14)}…` : branchFull;
                return {
                    branch: display,
                    branchFull,
                    avgLpa: Number((sum / n).toFixed(2)),
                    medianLpa: Number(median.toFixed(2)),
                    countWithCtc: n,
                };
            })
            .sort(
                (a, b) =>
                    (branchOrder.get(a.branchFull) ?? 99) - (branchOrder.get(b.branchFull) ?? 99) ||
                    b.avgLpa - a.avgLpa
            );
    }, [rows, branchOrder]);

    const topBranch = useMemo(() => {
        const map: Record<string, number> = {};
        for (const r of rows) {
            const b = r.branch || 'Unknown';
            map[b] = (map[b] || 0) + 1;
        }
        const best = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
        return best ? best[0] : 'Not available';
    }, [rows]);

    const companyCounts = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach((r) => {
            const c = r.companyName || 'Unknown';
            map[c] = (map[c] || 0) + 1;
        });
        return Object.entries(map)
            .map(([company, count]) => ({ company, count }))
            .sort((a, b) => b.count - a.count);
    }, [rows]);

    const topCompany = companyCounts[0]?.company || 'Not available';

    const timelineByYear = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach((r) => {
            const y = String(r.placementYear || 'Unknown');
            map[y] = (map[y] || 0) + 1;
        });
        return Object.keys(map)
            .sort((a, b) => Number(a) - Number(b))
            .map((yearLabel) => ({ yearLabel, count: map[yearLabel] }));
    }, [rows]);

    const companyAlumni = useMemo(() => {
        if (!selectedCompany) return rows;
        return rows.filter((r) => (r.companyName || '') === selectedCompany);
    }, [rows, selectedCompany]);

    const companyCtcValues = useMemo(
        () => companyAlumni.map((r) => parseCtc(r.ctc)).filter((v): v is number => v != null),
        [companyAlumni]
    );
    const companyAvgPackage = companyCtcValues.length
        ? companyCtcValues.reduce((s, n) => s + n, 0) / companyCtcValues.length
        : null;
    const companyMedianPackage = useMemo(() => {
        if (!companyCtcValues.length) return null;
        const sorted = [...companyCtcValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }, [companyCtcValues]);

    const companyTrendData = useMemo(() => {
        const buckets: Record<string, { total: number; count: number }> = {};
        for (const r of companyAlumni) {
            const yearKey = String(r.placementYear || 'Unknown');
            if (!buckets[yearKey]) buckets[yearKey] = { total: 0, count: 0 };
            const ctc = parseCtc(r.ctc);
            if (ctc != null) {
                buckets[yearKey].total += ctc;
                buckets[yearKey].count += 1;
            }
        }
        return Object.keys(buckets)
            .sort((a, b) => Number(a) - Number(b))
            .map((y) => ({
                year: y,
                avgPackage: buckets[y].count > 0 ? Number((buckets[y].total / buckets[y].count).toFixed(2)) : 0,
            }));
    }, [companyAlumni]);

    const companyHeadcountByYear = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of companyAlumni) {
            const y = String(r.placementYear || 'Unknown');
            m[y] = (m[y] || 0) + 1;
        }
        return Object.keys(m)
            .sort((a, b) => Number(a) - Number(b))
            .map((y) => ({ year: y, headcount: m[y] }));
    }, [companyAlumni]);

    const handleCompanyClick = (company: string) => {
        setSelectedCompany(company || null);
    };

    const clearCompany = () => setSelectedCompany(null);

    const topCompaniesChartData = useMemo(() => companyCounts.slice(0, 8), [companyCounts]);

    const handleExportFiltered = async () => {
        setExporting(true);
        setError('');
        try {
            const params = new URLSearchParams();
            const q = query.trim();
            if (q) params.set('q', q);
            if (branch !== 'All') params.set('branch', branch);
            if (year !== 'All') params.set('year', year);
            if (selectedCompany) params.set('company', selectedCompany);

            const res = await axios.get(
                `${apiBase}/alumni/export${params.toString() ? `?${params.toString()}` : ''}`,
                {
                    headers,
                    responseType: 'blob',
                },
            );

            const cd = String(res.headers['content-disposition'] || '');
            const m = cd.match(/filename="?([^"]+)"?/i);
            const fileName = m?.[1] || `alumni_filtered_export_${new Date().toISOString().slice(0, 10)}.csv`;
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', fileName);
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            const fallback = 'Failed to export alumni data.';
            const blobText = await err?.response?.data?.text?.().catch(() => '');
            if (blobText) {
                try {
                    const parsed = JSON.parse(blobText);
                    setError(parsed?.message || fallback);
                    return;
                } catch {
                    // no-op
                }
            }
            setError(err?.response?.data?.message || fallback);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div
            className="min-h-full bg-gradient-to-b from-slate-100/90 via-white to-slate-50 pb-16"
            data-testid="alumni-directory-page"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
                {/* Hero */}
                <header className="border-b border-slate-200/80 pb-8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
                        Placement cell · Directory
                    </p>
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-display font-bold text-indigo-950 tracking-tight">
                                Alumni network
                            </h1>
                            <p className="text-sm font-semibold text-slate-700 mt-2">Global Alumni Search</p>
                            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
                                Search by alumni name or company. Refine by branch and placement year, then open a
                                company for package and cohort trends.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                <Users className="w-3.5 h-3.5 text-indigo-600" />
                                {totalAlumni} in view
                            </span>
                            {selectedCompany && (
                                <button
                                    type="button"
                                    onClick={clearCompany}
                                    className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 hover:bg-amber-100/80"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Clear company filter
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* Search & filters */}
                <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="relative md:col-span-5">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                                Search
                            </label>
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-[2.125rem] -translate-y-1/2 pointer-events-none" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                                placeholder="Search by alumni name or company..."
                                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none transition-shadow"
                            />
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                                Branch
                            </label>
                            <select
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 bg-slate-50/80 focus:ring-2 focus:ring-indigo-200 outline-none"
                            >
                                {branchOptions.map((b) => (
                                    <option key={b} value={b}>
                                        {b === 'All' ? 'All branches' : b}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                                Placement year
                            </label>
                            <select
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 bg-slate-50/80 focus:ring-2 focus:ring-indigo-200 outline-none"
                            >
                                {yearOptions.map((y) => (
                                    <option key={y} value={y}>
                                        {y === 'All' ? 'All years' : y}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <button
                                type="button"
                                onClick={() => void runSearch()}
                                disabled={loading}
                                className="w-full px-4 py-2.5 rounded-xl bg-indigo-950 text-white text-sm font-bold hover:bg-indigo-900 shadow-md disabled:opacity-60 transition-colors"
                            >
                                {loading ? 'Searching…' : 'Search'}
                            </button>
                        </div>
                    </div>
                </section>

                {error && (
                    <p className="text-sm text-red-700 font-semibold bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                        {error}
                    </p>
                )}

                {/* Company drill-down */}
                {selectedCompany && (
                    <section
                        className="rounded-2xl border border-indigo-200/60 bg-white shadow-lg overflow-hidden"
                        data-testid="company-insights-panel"
                    >
                        <div className="bg-gradient-to-r from-indigo-950 to-indigo-900 px-5 py-4 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">
                                    Company drill-down
                                </p>
                                <h2 className="text-xl font-display font-bold flex items-center gap-2 mt-1">
                                    <Building2 className="w-5 h-5 opacity-90" />
                                    {selectedCompany}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={clearCompany}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-white/90 hover:text-white underline-offset-4 hover:underline shrink-0"
                                data-testid="company-drilldown-back"
                            >
                                ← Back to all results
                            </button>
                        </div>
                        <div className="p-5 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                        Alumni count
                                    </p>
                                    <p className="text-2xl font-display font-bold text-indigo-950 mt-1 tabular-nums">
                                        {companyAlumni.length}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                        Average package
                                    </p>
                                    <p className="text-2xl font-display font-bold text-emerald-800 mt-1">
                                        {companyAvgPackage != null ? `${companyAvgPackage.toFixed(2)} LPA` : '—'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                        Median package
                                    </p>
                                    <p className="text-2xl font-display font-bold text-violet-900 mt-1">
                                        {companyMedianPackage != null ? `${companyMedianPackage.toFixed(2)} LPA` : '—'}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div
                                    className="rounded-xl border border-slate-100 bg-white p-4"
                                    data-testid="company-trend-chart"
                                >
                                    <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-indigo-600" />
                                        Package trend by year
                                    </h3>
                                    <p className="text-[11px] text-slate-500 mb-3">Average LPA where disclosed.</p>
                                    {companyTrendData.length === 0 ? (
                                        <p className="text-sm text-slate-500 py-8 text-center">No package trend data.</p>
                                    ) : (
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={companyTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="alumniCoPkg" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.3} />
                                                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                                                    <YAxis tick={{ fontSize: 11 }} />
                                                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="avgPackage"
                                                        name="Avg LPA"
                                                        stroke="#312e81"
                                                        fill="url(#alumniCoPkg)"
                                                        strokeWidth={2}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white p-4" data-testid="company-headcount-chart">
                                    <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-teal-600" />
                                        Placements per year
                                    </h3>
                                    <p className="text-[11px] text-slate-500 mb-3">Headcount from current result set.</p>
                                    {companyHeadcountByYear.length === 0 ? (
                                        <p className="text-sm text-slate-500 py-8 text-center">No year breakdown.</p>
                                    ) : (
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={companyHeadcountByYear} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                                    <Tooltip contentStyle={{ borderRadius: 12 }} />
                                                    <Bar dataKey="headcount" name="Alumni" fill="#0d9488" radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* KPIs */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="alumni-kpis">
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Total alumni</p>
                        <p className="text-2xl font-display font-bold text-indigo-950 mt-1 tabular-nums">{totalAlumni}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Average package</p>
                        <p className="text-2xl font-display font-bold text-emerald-800 mt-1">
                            {avgPackage != null ? `${avgPackage.toFixed(2)} LPA` : '—'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Top company</p>
                        <p className="text-lg font-display font-bold text-amber-800 mt-1 truncate" title={topCompany}>
                            {topCompany}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Top branch</p>
                        <p className="text-lg font-display font-bold text-violet-900 mt-1 truncate" title={topBranch}>
                            {topBranch}
                        </p>
                    </div>
                </section>

                {/* Charts */}
                <section className="grid grid-cols-1 xl:grid-cols-2 gap-6" data-testid="alumni-charts">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-indigo-600" />
                            Branch distribution
                        </h3>
                        <p className="text-[11px] text-slate-500 mb-4">Alumni count by programme for the current filter.</p>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={branchCounts} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="branch" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={52} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: 12 }} />
                                    <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm" data-testid="alumni-branch-package-chart">
                        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                            <IndianRupee className="w-4 h-4 text-emerald-600" />
                            Branch vs average and median package
                        </h3>
                        <p className="text-[11px] text-slate-500 mb-3">
                            Mean and median LPA (alumni with parseable CTC only).
                        </p>
                        {branchPackageStats.length === 0 ? (
                            <p className="text-sm text-slate-500 py-12 text-center">No salary figures to compare.</p>
                        ) : (
                            <div
                                className="w-full"
                                style={{ height: Math.min(440, Math.max(280, branchPackageStats.length * 52)) }}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={branchPackageStats}
                                        margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                                        barCategoryGap="14%"
                                        barGap={2}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis
                                            type="number"
                                            tick={{ fontSize: 11 }}
                                            domain={([, max]) => [0, Math.max(1, Math.ceil((max ?? 0) * 1.12))]}
                                            label={{
                                                value: 'LPA',
                                                position: 'insideBottomRight',
                                                offset: -4,
                                                style: { fontSize: 11, fill: '#64748b' },
                                            }}
                                        />
                                        <YAxis type="category" dataKey="branch" width={108} tick={{ fontSize: 10 }} interval={0} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(79, 70, 229, 0.06)' }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const p = payload[0].payload as (typeof branchPackageStats)[0];
                                                return (
                                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md max-w-[240px]">
                                                        <p className="font-bold text-slate-900">{p.branchFull}</p>
                                                        <p className="text-emerald-700 mt-1 font-semibold">Average: {p.avgLpa} LPA</p>
                                                        <p className="text-indigo-700 font-semibold">Median: {p.medianLpa} LPA</p>
                                                        <p className="text-slate-500 mt-1">{p.countWithCtc} with package data</p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 4 }} />
                                        <Bar dataKey="avgLpa" name="Average (LPA)" fill="#059669" radius={[0, 4, 4, 0]} maxBarSize={22} />
                                        <Bar dataKey="medianLpa" name="Median (LPA)" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                            <GraduationCap className="w-4 h-4 text-violet-600" />
                            Placement cohort trend
                        </h3>
                        <p className="text-[11px] text-slate-500 mb-4">Alumni volume by placement year.</p>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timelineByYear} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="alumniTimeline" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="yearLabel" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: 12 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        name="Alumni"
                                        stroke="#6d28d9"
                                        fill="url(#alumniTimeline)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-amber-600" />
                            Top employers
                        </h3>
                        <p className="text-[11px] text-slate-500 mb-4">Cross-check with the directory below; open a company from the table or cards.</p>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topCompaniesChartData}
                                    layout="vertical"
                                    margin={{ left: 8, right: 8, top: 4, bottom: 4 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="company" width={100} tick={{ fontSize: 9 }} />
                                    <Tooltip contentStyle={{ borderRadius: 12 }} />
                                    <Bar dataKey="count" fill="#ea580c" radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                {/* Results */}
                <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Directory results</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {companyAlumni.length} record{companyAlumni.length !== 1 ? 's' : ''}
                                {selectedCompany ? ` at ${selectedCompany}` : ''}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void handleExportFiltered()}
                                disabled={exporting || companyAlumni.length === 0}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                data-testid="alumni-export-filtered"
                            >
                                <Download className="h-3.5 w-3.5" />
                                {exporting ? 'Exporting…' : 'Download Excel (CSV)'}
                            </button>
                            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setResultsView('table')}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                        resultsView === 'table'
                                            ? 'bg-indigo-950 text-white'
                                            : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                    data-testid="alumni-view-table"
                                >
                                    <Table2 className="w-3.5 h-3.5" />
                                    Table
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setResultsView('cards')}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                        resultsView === 'cards'
                                            ? 'bg-indigo-950 text-white'
                                            : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                    data-testid="alumni-view-cards"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                    Cards
                                </button>
                            </div>
                        </div>
                    </div>

                    {companyAlumni.length === 0 ? (
                        <p className="text-sm text-slate-500 px-5 py-12 text-center">No results found.</p>
                    ) : resultsView === 'table' ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Branch</th>
                                        <th className="px-4 py-3">Company</th>
                                        <th className="px-4 py-3 hidden md:table-cell">Role</th>
                                        <th className="px-4 py-3 hidden lg:table-cell">Package</th>
                                        <th className="px-4 py-3">Year</th>
                                        <th className="px-4 py-3 text-right">Profile</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {companyAlumni.map((alumni) => (
                                        <tr key={alumni.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                                                {alumni.name}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{alumni.branch || '—'}</td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleCompanyClick(alumni.companyName)}
                                                    className="font-bold text-indigo-700 hover:text-indigo-900 hover:underline inline-flex items-center gap-0.5"
                                                    data-testid="alumni-company-link"
                                                >
                                                    {alumni.companyName || '—'}
                                                    <ChevronRight className="w-3.5 h-3.5 opacity-50" aria-hidden />
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 hidden md:table-cell max-w-[10rem] truncate">
                                                {alumni.role || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 hidden lg:table-cell whitespace-nowrap">
                                                {alumni.ctc || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 tabular-nums">{alumni.placementYear || '—'}</td>
                                            <td className="px-4 py-3 text-right">
                                                {alumni.linkedinUrl ? (
                                                    <a
                                                        href={alumni.linkedinUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
                                                    >
                                                        LinkedIn
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {companyAlumni.map((alumni) => (
                                <article
                                    key={alumni.id}
                                    className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 hover:border-indigo-200 hover:bg-white transition-colors flex flex-col gap-2"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-900 truncate">{alumni.name}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">{alumni.branch || '—'}</p>
                                        </div>
                                        <span className="text-[10px] font-bold tabular-nums text-slate-500 bg-white border border-slate-100 rounded-lg px-2 py-0.5 shrink-0">
                                            {alumni.placementYear || '—'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCompanyClick(alumni.companyName)}
                                        className="text-left text-sm font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                                        data-testid="alumni-company-link"
                                    >
                                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{alumni.companyName || '—'}</span>
                                    </button>
                                    <p className="text-xs text-slate-600">
                                        {alumni.role || '—'} · {alumni.ctc || 'Package N/A'}
                                    </p>
                                    {alumni.linkedinUrl ? (
                                        <a
                                            href={alumni.linkedinUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline mt-auto pt-1"
                                        >
                                            LinkedIn
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    ) : (
                                        <span className="text-xs text-slate-400 mt-auto pt-1">No LinkedIn</span>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
