import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import {
    BarChart3, TrendingUp, Building2, GraduationCap, Download,
    Search, ArrowLeft, RefreshCw, Briefcase, Award,
    IndianRupee, ExternalLink, UserCircle
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell,
    AreaChart, Area
} from 'recharts';

const API = () => import.meta.env.VITE_API_URL;

interface YearData { year: number | string; count: number; }
interface CompanyData { company: string; title: string; acceptedCount: number; }
interface BranchData { branch: string; count: number; placementCount?: number; avgCtc?: string; }
interface TrendData { period: string; placements: number; }
interface AlumniRecord { id: string; name: string; branch: string; role: string; ctc: string; placementYear: number; linkedinUrl: string | null; }

const COLORS = [
    '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
    '#0891b2', '#4f46e5', '#9333ea', '#c026d3', '#059669'
];

export default function AnalyticsPage() {
    const { token, user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [byYear, setByYear] = useState<YearData[]>([]);
    const [byCompany, setByCompany] = useState<CompanyData[]>([]);
    const [byBranch, setByBranch] = useState<BranchData[]>([]);
    const [trends, setTrends] = useState<TrendData[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportFields, setExportFields] = useState('firstName,lastName,department,company,jobTitle,graduationYear');
    const [error, setError] = useState('');
    const [alumniCompany, setAlumniCompany] = useState('');
    const [alumniList, setAlumniList] = useState<AlumniRecord[]>([]);
    const [alumniLoading, setAlumniLoading] = useState(false);
    const headers = { Authorization: `Bearer ${token}` };
    const baseUrl = API();

    useEffect(() => {
        if (authLoading) return;
        if (!token || !['SPOC', 'COORDINATOR'].includes(user?.role || '')) {
            setError('Access denied. Only SPOC and Coordinators can view analytics.');
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                const [y, c, b, t, bc] = await Promise.all([
                    axios.get(`${baseUrl}/api/analytics/by-year`, { headers }),
                    axios.get(`${baseUrl}/api/analytics/by-company?limit=10`, { headers }),
                    axios.get(`${baseUrl}/api/analytics/by-branch`, { headers }),
                    axios.get(`${baseUrl}/api/analytics/placement-trends`, { headers }),
                    axios.get(`${baseUrl}/api/analytics/branch-comparison`, { headers })
                ]);
                setByYear(y.data.data || []);
                setByCompany(c.data.data || []);
                setTrends(t.data.data || []);
                
                // Merge branch counts with comparison data (for avg ctc)
                const counts = b.data.data || [];
                const comparison = bc.data.data || [];
                const mergedBranches = counts.map((bc: any) => {
                    const comp = comparison.find((c: any) => c.branch === bc.branch);
                    return { ...bc, ...comp };
                });
                setByBranch(mergedBranches);
            } catch (err) {
                console.error(err);
                setError('Failed to load analytics. Check your connection.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [token, user, authLoading]);

    const fetchAlumni = async (company: string) => {
        if (!company.trim()) return;
        setAlumniLoading(true);
        try {
            const res = await axios.get(`${baseUrl}/api/alumni/company/${encodeURIComponent(company.trim())}`, { headers });
            setAlumniList(res.data.data || []);
        } catch {
            setAlumniList([]);
        } finally {
            setAlumniLoading(false);
        }
    };

    const handleExport = () => {
        const params = exportFields ? `?fields=${encodeURIComponent(exportFields)}` : '';
        const url = `${baseUrl}/api/analytics/export-csv${params}`;
        
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.blob())
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.setAttribute('download', `placements_report_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            });
    };

    if (loading) return (
        <div className="p-8 flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
    );

    if (error) return (
        <div className="p-12 text-center">
            <div className="bg-red-50 text-red-600 p-6 rounded-2xl inline-block max-w-md border border-red-100 shadow-sm">
                <p className="font-bold mb-4">{error}</p>
                <Link to="/dashboard" className="text-sm font-bold bg-white px-4 py-2 rounded-xl shadow-sm border border-red-200 hover:bg-red-50">
                    ← Back to Dashboard
                </Link>
            </div>
        </div>
    );

    const totalPlaced = byYear.reduce((s, y) => s + y.count, 0);
    const topCompany = byCompany[0]?.company || '—';
    const avgCtc = byBranch.reduce((acc, b) => acc + parseFloat(b.avgCtc || '0'), 0) / (byBranch.filter(b => b.avgCtc && b.avgCtc !== '0').length || 1);

    return (
        <div className="p-6 lg:p-10 space-y-8 max-w-[1600px] mx-auto overflow-hidden">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        Placement Analytics <BarChart3 className="w-8 h-8 text-primary-600" />
                    </h1>
                    <p className="text-gray-500 font-medium tracking-tight">Real-time placement statistics and recruitment insights.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => window.location.reload()} className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shadow-sm">
                        <RefreshCw className="w-5 h-5" />
                    </button>
                    <Link to="/dashboard" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg hover:bg-black transition-all active:scale-95">
                        <ArrowLeft className="w-4 h-4" /> Dashboard
                    </Link>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Students Placed', value: totalPlaced, icon: GraduationCap, color: 'text-primary-600', bg: 'bg-primary-50', border: 'border-primary-100', trend: '+12% from last year' },
                    { label: 'Top Hiring Company', value: topCompany, icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', trend: 'Leading this season' },
                    { label: 'Average CTC (LPA)', value: `${avgCtc.toFixed(1)} LPA`, icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', trend: 'Across all branches' },
                    { label: 'Active Recruitment Gears', value: byBranch.filter(b => b.branch !== 'Unspecified').length, icon: Briefcase, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100', trend: 'Branches participating' },
                ].map((stat, i) => (
                    <motion.button
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => stat.label === 'Total Students Placed' ? navigate('/placed-students') : undefined}
                        className={clsx("p-6 rounded-3xl border shadow-sm flex flex-col justify-between text-left", stat.bg, stat.border, stat.label === 'Total Students Placed' ? 'cursor-pointer hover:shadow-md transition-all' : 'cursor-default')}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <stat.icon className={clsx("w-6 h-6", stat.color)} />
                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live</div>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                            <p className={clsx("text-2xl font-black tracking-tight", stat.color)}>{stat.value}</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-black/5 flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                             {stat.trend}
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Main Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Placement Trends Area Chart */}
                <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-500" /> Placement Trends
                        </h3>
                        <div className="flex gap-2">
                            {['Month', 'Year'].map(tab => (
                                <button key={tab} className={clsx("px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all", tab === 'Month' ? "bg-primary-50 text-primary-700" : "text-gray-400 hover:bg-gray-50")}>
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPlacements" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="period" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <YAxis fontSize={10} fontWeight={700} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="placements" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorPlacements)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Branch-wise Success Bar Chart */}
                <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                    <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Award className="w-5 h-5 text-indigo-500" /> Success by Branch
                    </h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byBranch.filter(b => b.branch !== 'Unspecified').slice(0, 8)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <XAxis dataKey="branch" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <YAxis fontSize={10} fontWeight={700} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="count" fill="#7c3aed" radius={[6, 6, 0, 0]} name="Students Placed" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Recruiters - Horizontal Bar Chart */}
                <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6 lg:col-span-1">
                    <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-cyan-500" /> Top Target Companies
                    </h3>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byCompany.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                                <XAxis type="number" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                                <YAxis type="category" dataKey="company" fontSize={10} fontWeight={700} axisLine={false} tickLine={false} tick={{ fill: '#1e293b' }} width={80} />
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="acceptedCount" fill="#059669" radius={[0, 6, 6, 0]} name="Offers Accepted" barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* CTC Distribution across Branches */}
                <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6 lg:col-span-1">
                    <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <IndianRupee className="w-5 h-5 text-emerald-500" /> Salary Distribution Avg
                    </h3>
                    <div className="h-[400px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={byBranch.filter(b => b.avgCtc && parseFloat(b.avgCtc) > 0).slice(0, 6)}
                                    dataKey={(d) => parseFloat(d.avgCtc || '0')}
                                    nameKey="branch"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={8}
                                >
                                    {byBranch.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Combined Tools Section (CSV Export + Alumni Search) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* CSV Tool */}
                <div className="bg-gradient-to-br from-primary-600 to-indigo-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-primary-200">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                            <Download className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black tracking-tight">Export Placements Report</h3>
                            <p className="text-primary-100 text-xs font-bold opacity-80 uppercase tracking-wider">On-Campus Alumni Database</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-primary-200">Customize Export Fields</label>
                        <textarea
                            value={exportFields}
                            onChange={e => setExportFields(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-sm font-bold placeholder:text-white/40 focus:outline-none focus:ring-4 focus:ring-white/10 min-h-[100px]"
                        />
                        <button
                            onClick={handleExport}
                            className="w-full bg-white text-primary-700 py-4 rounded-2xl font-black text-sm shadow-xl hover:scale-[1.02] transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" /> Download Students CSV
                        </button>
                        <p className="text-[10px] text-white/50 text-center font-bold italic mt-2">
                             Full data access restricted to SPOC/Coordinator roles.
                        </p>
                    </div>
                </div>

                {/* Alumni Search */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 bg-indigo-50 rounded-2xl">
                            <Search className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black tracking-tight text-gray-900">Alumni Directory</h3>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Industry Connection Lookup</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Enter company name..."
                                value={alumniCompany}
                                onChange={e => setAlumniCompany(e.target.value)}
                                className="w-full pl-11 pr-4 py-4 rounded-2xl border border-gray-100 text-sm font-bold bg-gray-50 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => fetchAlumni(alumniCompany)}
                            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 whitespace-nowrap"
                        >
                            {alumniLoading ? 'Searching…' : 'Deep Search'}
                        </button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {alumniList.length > 0 ? (
                            alumniList.map((alumni, i) => (
                                <motion.div
                                    key={alumni.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="p-4 rounded-2xl border border-gray-50 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 group-hover:bg-indigo-100 group-hover:border-indigo-200 transition-colors">
                                            <UserCircle className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-gray-900">{alumni.name}</p>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{alumni.branch} • {alumni.placementYear}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-emerald-600">{alumni.ctc}</p>
                                        <p className="text-[10px] font-bold text-gray-400">{alumni.role}</p>
                                    </div>
                                    <div className="pl-4">
                                        {alumni.linkedinUrl && (
                                            <a href={alumni.linkedinUrl} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 transition-all">
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="text-center py-10">
                                <Building2 className="w-12 h-12 text-gray-100 mx-auto mb-3" />
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    {alumniCompany ? "No records found in directory" : "Search company to see alumni"}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Custom CSS for scrollbar needed here if desired, otherwise standard
