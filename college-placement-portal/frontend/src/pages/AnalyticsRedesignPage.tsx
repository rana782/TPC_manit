import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import { BarChart3, Download, TrendingUp, Users } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type BranchTimelinePoint = { label: string; value: number };
type CompanyDist = { companyName: string; count: number };
type BranchWiseRow = {
    branch: string;
    placedCount: number;
    averagePackage: number | null;
    medianPackage: number | null;
    timeline: BranchTimelinePoint[];
    companyDistribution: CompanyDist[];
};

export default function AnalyticsRedesignPage() {
    const { token, user, loading: authLoading } = useAuth();
    const apiBase = getViteApiBase();
    const [rows, setRows] = useState<BranchWiseRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [exportFields, setExportFields] = useState('branch,totalPlaced,averagePackage,medianPackage,placementYear,companyNames');

    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    useEffect(() => {
        if (authLoading) return;
        if (!token || !['SPOC', 'COORDINATOR'].includes(user?.role || '')) {
            setError('Access denied. Analytics is available for SPOC/Coordinator.');
            setLoading(false);
            return;
        }

        const fetchBranchWise = async () => {
            try {
                const res = await axios.get(`${apiBase}/analytics/branch-wise-current`, { headers });
                const data = res.data?.branchWise || [];
                setRows(data);
                if (data.length > 0) setSelectedBranch(data[0].branch);
            } catch {
                setError('Failed to load branch-wise analytics.');
            } finally {
                setLoading(false);
            }
        };

        fetchBranchWise();
    }, [authLoading, token, user?.role, apiBase, headers]);

    const totalPlaced = rows.reduce((sum, r) => sum + r.placedCount, 0);
    const pkgRows = rows.filter((r) => r.averagePackage != null);
    const globalAvg = pkgRows.length
        ? pkgRows.reduce((sum, r) => sum + Number(r.averagePackage || 0), 0) / pkgRows.length
        : null;
    const selectedRow = rows.find((r) => r.branch === selectedBranch) || null;

    const timelineChartData = selectedRow?.timeline || [];

    const handleExport = async () => {
        try {
            const params = exportFields ? `?fields=${encodeURIComponent(exportFields)}` : '';
            const resp = await fetch(`${apiBase}/analytics/export-csv${params}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!resp.ok) throw new Error('Export failed');
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.setAttribute('download', `branch_wise_placements_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch {
            setError('CSV export failed.');
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-10 text-center">
                <p className="text-red-600 font-bold">{error}</p>
                <div className="mt-4">
                    <Link to="/dashboard" className="text-sm font-bold text-primary-700 underline">Back to dashboard</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto" data-testid="analytics-redesign-page">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                        Branch-wise Placement Analytics <BarChart3 className="w-6 h-6 text-primary-600" />
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Currently placed students by branch with package stats and timelines.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Currently Placed</p>
                    <p className="text-2xl font-black text-primary-700 mt-1">{totalPlaced}</p>
                </div>
                <div className="bg-gradient-to-br from-violet-50 to-white border border-violet-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Branches with Placements</p>
                    <p className="text-2xl font-black text-violet-700 mt-1">{rows.length}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500 uppercase">Avg Package (Across Branches)</p>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{globalAvg != null ? `${globalAvg.toFixed(2)} LPA` : 'Not available'}</p>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h2 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary-600" /> Branch-wise currently placed details
                </h2>
                {rows.length === 0 ? (
                    <p className="text-sm text-gray-500">No data yet.</p>
                ) : (
                    <div className="space-y-3">
                        {rows.map((r) => (
                            <div key={r.branch} className="border border-gray-100 rounded-xl p-4 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
                                <p className="text-base font-black text-gray-900 mb-2">Branch: {r.branch}</p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                                    <p className="bg-gray-50 rounded-lg px-3 py-2"><span className="font-bold">Currently Placed:</span> {r.placedCount}</p>
                                    <p className="bg-gray-50 rounded-lg px-3 py-2"><span className="font-bold">Average Package:</span> {r.averagePackage != null ? `${r.averagePackage} LPA` : 'Not available'}</p>
                                    <p className="bg-gray-50 rounded-lg px-3 py-2"><span className="font-bold">Median Package:</span> {r.medianPackage != null ? `${r.medianPackage} LPA` : 'Not available'}</p>
                                    <p className="bg-gray-50 rounded-lg px-3 py-2"><span className="font-bold">Top Companies:</span> {r.companyDistribution?.slice(0, 3).map((c) => c.companyName).join(', ') || 'No data yet'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-600" /> Timeline analytics (branch-wise)
                    </h2>
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold bg-gray-50 focus:bg-white"
                    >
                        {rows.map((r) => (
                            <option key={r.branch} value={r.branch}>{r.branch}</option>
                        ))}
                    </select>
                </div>
                {timelineChartData.length === 0 ? (
                    <p className="text-sm text-gray-500">No timeline data yet.</p>
                ) : (
                    <div className="h-72 rounded-xl border border-gray-100 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timelineChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="value" stroke="#2563eb" name="Placed count" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-primary-700 rounded-2xl p-5 space-y-3 text-white shadow-lg">
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <Download className="w-5 h-5 text-white" /> <span className="text-white">CSV export (branch-wise fields)</span>
                </h2>
                <textarea
                    value={exportFields}
                    onChange={(e) => setExportFields(e.target.value)}
                    className="w-full border border-white/20 rounded-xl p-3 text-sm bg-white/10 placeholder:text-white/60"
                    rows={3}
                />
                <button
                    onClick={handleExport}
                    className="px-4 py-2 rounded-lg bg-white text-indigo-700 text-sm font-bold hover:bg-indigo-50"
                >
                    Export CSV
                </button>
            </div>
        </div>
    );
}
