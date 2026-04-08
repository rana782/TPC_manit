import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import { ExternalLink, Search, Users, Building2, IndianRupee, GraduationCap, BarChart3 } from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    LineChart,
    Line,
    Legend,
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

export default function AlumniDirectoryPage() {
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

    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const runSearch = async () => {
        setLoading(true);
        setError('');
        try {
            const q = query.trim();
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
    };

    useEffect(() => {
        if (token) runSearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, branch, year]);

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
        fetchAllForFilters();
    }, [token, apiBase, headers]);

    const branchOptions = useMemo(() => {
        const opts = Array.from(new Set(allRows.map((r) => r.branch).filter(Boolean))).sort();
        return ['All', ...opts];
    }, [allRows]);

    const yearOptions = useMemo(() => {
        const opts = Array.from(new Set(allRows.map((r) => String(r.placementYear || '')).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
        return ['All', ...opts];
    }, [allRows]);

    const totalAlumni = rows.length;
    const ctcValues = rows.map((r) => parseCtc(r.ctc)).filter((v): v is number => v != null);
    const avgPackage = ctcValues.length ? ctcValues.reduce((s, n) => s + n, 0) / ctcValues.length : null;

    const branchCounts = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach((r) => {
            const b = r.branch || 'Unknown';
            map[b] = (map[b] || 0) + 1;
        });
        return Object.entries(map).map(([branch, count]) => ({ branch, count })).sort((a, b) => b.count - a.count);
    }, [rows]);

    /** Per-branch average & median LPA (only alumni with parseable CTC). Sorted by average descending. */
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
                const display =
                    branchFull.length > 16 ? `${branchFull.slice(0, 14)}…` : branchFull;
                return {
                    branch: display,
                    branchFull,
                    avgLpa: Number((sum / n).toFixed(2)),
                    medianLpa: Number(median.toFixed(2)),
                    countWithCtc: n,
                };
            })
            .sort((a, b) => b.avgLpa - a.avgLpa);
    }, [rows]);

    const topBranch = branchCounts[0]?.branch || 'Not available';

    const companyCounts = useMemo(() => {
        const map: Record<string, number> = {};
        rows.forEach((r) => {
            const c = r.companyName || 'Unknown';
            map[c] = (map[c] || 0) + 1;
        });
        return Object.entries(map).map(([company, count]) => ({ company, count })).sort((a, b) => b.count - a.count);
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
            .map((year) => ({
                year,
                avgPackage: buckets[year].count > 0 ? Number((buckets[year].total / buckets[year].count).toFixed(2)) : 0
            }));
    }, [companyAlumni]);

    const handleCompanyClick = (company: string) => {
        setSelectedCompany(company || null);
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto" data-testid="alumni-directory-page">
            <div>
                <h1 className="text-3xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                    <Users className="w-6 h-6 text-primary-600" /> Global Alumni Search
                </h1>
                <p className="text-sm text-gray-500 mt-1">Search by alumni name or company.</p>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="relative md:col-span-6">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by alumni name or company..."
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white"
                        />
                    </div>
                    <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 md:col-span-3"
                    >
                        {branchOptions.map((b) => (
                            <option key={b} value={b}>{b === 'All' ? 'All Branches' : b}</option>
                        ))}
                    </select>
                    <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 md:col-span-2"
                    >
                        {yearOptions.map((y) => (
                            <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>
                        ))}
                    </select>
                    <button
                        onClick={runSearch}
                        className="px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 shadow-sm md:col-span-1"
                    >
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>
            </div>

            {error && <p className="text-sm text-red-600 font-bold">{error}</p>}

            {selectedCompany && (
                <div className="bg-white border border-primary-100 rounded-2xl p-4 shadow-sm space-y-3" data-testid="company-insights-panel">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold text-primary-700 uppercase">Company Drill-down</p>
                            <h2 className="text-xl font-black text-gray-900">{selectedCompany}</h2>
                        </div>
                        <button
                            onClick={() => setSelectedCompany(null)}
                            className="text-xs font-bold text-primary-700 hover:text-primary-900 underline"
                            data-testid="company-drilldown-back"
                        >
                            ← Back to All Alumni
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-primary-50 border border-primary-100 rounded-xl p-3">
                            <p className="text-xs font-bold text-gray-600 uppercase">Total Alumni</p>
                            <p className="text-xl font-black text-primary-700">{companyAlumni.length}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                            <p className="text-xs font-bold text-gray-600 uppercase">Average Package</p>
                            <p className="text-xl font-black text-emerald-700">{companyAvgPackage != null ? `${companyAvgPackage.toFixed(2)} LPA` : 'Not available'}</p>
                        </div>
                        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                            <p className="text-xs font-bold text-gray-600 uppercase">Median Package</p>
                            <p className="text-xl font-black text-violet-700">{companyMedianPackage != null ? `${companyMedianPackage.toFixed(2)} LPA` : 'Not available'}</p>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl p-3" data-testid="company-trend-chart">
                        <h3 className="text-sm font-black text-gray-900 mb-2">Package Trend by Year</h3>
                        {companyTrendData.length === 0 ? (
                            <p className="text-sm text-gray-500">No package trend data available.</p>
                        ) : (
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={companyTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="year" />
                                        <YAxis />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="avgPackage" stroke="#2563eb" strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="alumni-kpis">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Alumni</p>
                    <p className="text-2xl font-black text-primary-700 mt-1">{totalAlumni}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Average Package</p>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{avgPackage != null ? `${avgPackage.toFixed(2)} LPA` : 'Not available'}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Top Hiring Company</p>
                    <p className="text-xl font-black text-violet-700 mt-1">{topCompany}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Top Branch</p>
                    <p className="text-xl font-black text-indigo-700 mt-1">{topBranch}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="alumni-charts">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary-600" /> Branch-wise Alumni Distribution
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={branchCounts}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="branch" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#2563eb" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm" data-testid="alumni-branch-package-chart">
                    <h3 className="text-sm font-black text-gray-900 mb-1 flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-emerald-600" /> Branch vs average & median package
                    </h3>
                    <p className="text-[11px] text-gray-500 mb-2">
                        Grouped bars per branch: mean and median LPA from alumni with a parseable CTC. Horizontal layout keeps branch names readable.
                    </p>
                    {branchPackageStats.length === 0 ? (
                        <p className="text-sm text-gray-500 py-12 text-center">No salary figures available to compare by branch.</p>
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
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 11 }}
                                        domain={([, max]) => [0, Math.max(1, Math.ceil((max ?? 0) * 1.12))]}
                                        label={{ value: 'LPA', position: 'insideBottomRight', offset: -4, style: { fontSize: 11, fill: '#6b7280' } }}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="branch"
                                        width={108}
                                        tick={{ fontSize: 10 }}
                                        interval={0}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const p = payload[0].payload as (typeof branchPackageStats)[0];
                                            return (
                                                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md max-w-[240px]">
                                                    <p className="font-bold text-gray-900">{p.branchFull}</p>
                                                    <p className="text-emerald-700 mt-1 font-semibold">Average: {p.avgLpa} LPA</p>
                                                    <p className="text-indigo-700 font-semibold">Median: {p.medianLpa} LPA</p>
                                                    <p className="text-gray-500 mt-1">{p.countWithCtc} alumni with package data</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        align="right"
                                        wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                                    />
                                    <Bar
                                        dataKey="avgLpa"
                                        name="Average (LPA)"
                                        fill="#059669"
                                        radius={[0, 4, 4, 0]}
                                        maxBarSize={22}
                                    />
                                    <Bar
                                        dataKey="medianLpa"
                                        name="Median (LPA)"
                                        fill="#6366f1"
                                        radius={[0, 4, 4, 0]}
                                        maxBarSize={22}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-violet-600" /> Placement Timeline
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timelineByYear}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="yearLabel" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-600" /> Top Companies Hiring Alumni
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={companyCounts.slice(0, 8)} layout="vertical" margin={{ left: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis type="category" dataKey="company" width={100} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#ea580c" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                {companyAlumni.length === 0 ? (
                    <p className="text-sm text-gray-500">No results found.</p>
                ) : (
                    <div className="space-y-2">
                        {companyAlumni.map((alumni) => (
                            <div key={alumni.id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">{alumni.name}</p>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {alumni.branch || 'Unknown'} •
                                        {' '}
                                        <button
                                            type="button"
                                            onClick={() => handleCompanyClick(alumni.companyName)}
                                            className="text-blue-600 hover:underline font-bold"
                                            data-testid="alumni-company-link"
                                        >
                                            {alumni.companyName || 'Unknown company'}
                                        </button>
                                        {' '}• {alumni.placementYear || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {alumni.role || 'N/A'} • {alumni.ctc || 'Not available'}
                                    </p>
                                </div>
                                {alumni.linkedinUrl ? (
                                    <a
                                        href={alumni.linkedinUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
                                    >
                                        LinkedIn <ExternalLink className="w-3 h-3" />
                                    </a>
                                ) : (
                                    <span className="text-xs text-gray-400">LinkedIn not available</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
