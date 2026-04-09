import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
    LayoutDashboard, Users, ShieldCheck, MessageSquare, Linkedin, BarChart3,
    GraduationCap, Briefcase, FileText, Lock, Unlock,
    CheckCircle2, XCircle, Search, ArrowLeft,
    ToggleLeft, ToggleRight, RefreshCw, UserCheck, UserX,
    Shield, Award, TrendingUp, Sliders, Save, Clock
} from 'lucide-react';

interface Stats {
    totalStudents: number;
    totalJobs: number;
    totalApplications: number;
    placedStudents: number;
    lockedProfiles: number;
    applicationsByStatus: Record<string, number>;
}

interface User {
    id: string;
    email: string;
    role: string;
    isDisabled: boolean;
    createdAt: string;
    student?: {
        firstName: string;
        lastName: string;
        isLocked: boolean;
        placementType: string | null;
        lockedReason: string | null;
    } | null;
}

interface Spoc {
    id: string;
    email: string;
    isDisabled: boolean;
    createdAt: string;
    isVerified?: boolean;
    verifiedAt?: string;
    verifiedBy?: { email: string };
    permJobCreate?: boolean;
    permLockProfile?: boolean;
    permExportCsv?: boolean;
}

interface NotificationLog {
    id: string;
    message: string;
    channel: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
    user: { email: string; student?: { firstName: string; lastName: string } };
    job?: { companyName: string; role: string };
}

interface NotificationTemplate {
    id: string | null;
    type: string;
    templateText: string;
    source: 'DB' | 'DEFAULT';
}

interface LinkedInLog {
    id: string;
    jobId: string | null;
    companyName: string;
    placementYear: number;
    zapStatus: string;
    responseBody: string | null;
    postedAt: string | null;
    createdAt: string;
    postedBy: { email: string };
    job?: { companyName: string; role: string };
}

interface AnalyticsBranchStats {
    branch: string;
    placementCount: number;
    avgCtc: string;
}

interface AnalyticsTrend {
    period: string;
    placements: number;
}

interface AtsConfig {
    skillsMatch: number;
    projects: number;
    certifications: number;
    tools: number;
    experience: number;
}

const API = () => `${import.meta.env.VITE_API_URL}`;

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

type TabKey = 'stats' | 'users' | 'spocs' | 'notifications' | 'linkedin' | 'analytics';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'stats', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'spocs', label: 'SPOCs', icon: ShieldCheck },
    { key: 'notifications', label: 'WhatsApp', icon: MessageSquare },
    { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
    { key: 'analytics', label: 'Analytics & ATS', icon: BarChart3 },
];

export default function AdminDashboard() {
    const { token, user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('stats');
    const [roleFilter, setRoleFilter] = useState('');
    const [pendingSpocs, setPendingSpocs] = useState<Spoc[]>([]);
    const [approvedSpocs, setApprovedSpocs] = useState<Spoc[]>([]);
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplate[]>([]);
    const [savingTemplateType, setSavingTemplateType] = useState<string | null>(null);
    const [linkedInLogs, setLinkedInLogs] = useState<LinkedInLog[]>([]);
    const [linkedInEnabled, setLinkedInEnabled] = useState(false);
    const [branchStats, setBranchStats] = useState<AnalyticsBranchStats[]>([]);
    const [trendStats, setTrendStats] = useState<AnalyticsTrend[]>([]);
    const [atsConfig, setAtsConfig] = useState<AtsConfig | null>(null);
    const [error, setError] = useState('');
    const [actionMsg, setActionMsg] = useState('');
    const [userSearch, setUserSearch] = useState('');

    const headers = { Authorization: `Bearer ${token}` };

    const fetchStats = async () => {
        const res = await axios.get(`${API()}/api/admin/stats`, { headers });
        if (res.data.success) setStats(res.data.stats);
    };

    const fetchUsers = async (role = '') => {
        const params = role ? `?role=${role}` : '';
        const res = await axios.get(`${API()}/api/admin/users${params}`, { headers });
        if (res.data.success) { setUsers(res.data.users); setTotal(res.data.total); }
    };

    const fetchSpocs = async () => {
        try {
            const [pendingRes, approvedRes] = await Promise.all([
                axios.get(`${API()}/api/admin/spocs/pending`, { headers }),
                axios.get(`${API()}/api/admin/spocs/approved`, { headers })
            ]);
            if (pendingRes.data.success) setPendingSpocs(pendingRes.data.spocs);
            if (approvedRes.data.success) setApprovedSpocs(approvedRes.data.spocs);
        } catch (e) { console.error("Failed to fetch SPOCs", e); }
    };

    const fetchNotifications = async () => {
        try {
            const [logsRes, settingsRes, templatesRes] = await Promise.all([
                axios.get(`${API()}/api/notifications/admin/logs`, { headers }),
                axios.get(`${API()}/api/notifications/admin/settings`, { headers }),
                axios.get(`${API()}/api/notifications/admin/templates`, { headers })
            ]);
            if (logsRes.data.success) setLogs(logsRes.data.logs);
            if (settingsRes.data.success) setWhatsappEnabled(settingsRes.data.setting?.value === 'true');
            if (templatesRes.data.success) setNotificationTemplates(templatesRes.data.templates || []);
        } catch (e) { console.error("Failed to fetch notification data", e); }
    };

    const fetchLinkedInData = async () => {
        try {
            const [logsRes, settingsRes] = await Promise.all([
                axios.get(`${API()}/api/announcements/linkedin/logs`, { headers }),
                axios.get(`${API()}/api/announcements/linkedin/settings`, { headers })
            ]);
            if (logsRes.data.success) setLinkedInLogs(logsRes.data.logs);
            if (settingsRes.data.success) setLinkedInEnabled(settingsRes.data.setting?.value === 'true');
        } catch (e) { console.error("Failed to fetch LinkedIn data", e); }
    };

    const fetchAnalyticsAndAts = async () => {
        try {
            const [branchRes, trendRes, atsRes] = await Promise.all([
                axios.get(`${API()}/api/analytics/branch-comparison`, { headers }),
                axios.get(`${API()}/api/analytics/placement-trends`, { headers }),
                axios.get(`${API()}/api/ats/config`, { headers })
            ]);
            if (branchRes.data.success) setBranchStats(branchRes.data.data);
            if (trendRes.data.success) setTrendStats(trendRes.data.data);
            if (atsRes.data.success) setAtsConfig(atsRes.data.data);
        } catch (e) { console.error("Failed to fetch analytics/ATS config", e); }
    };

    useEffect(() => {
        if (token && user?.role === 'COORDINATOR') {
            Promise.all([fetchStats(), fetchUsers(), fetchSpocs(), fetchNotifications(), fetchLinkedInData(), fetchAnalyticsAndAts()]).finally(() => setLoading(false));
        } else {
            setLoading(false);
            setError('Access Denied: Only Coordinators can access the Admin Panel.');
        }
    }, [token, user]);

    const handleDisable = async (id: string) => {
        if (!window.confirm('Disable this user?')) return;
        try {
            await axios.patch(`${API()}/api/admin/users/${id}/disable`, {}, { headers });
            setActionMsg('User disabled.');
            fetchUsers(roleFilter);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed'); }
    };

    const handleEnable = async (id: string) => {
        try {
            await axios.patch(`${API()}/api/admin/users/${id}/enable`, {}, { headers });
            setActionMsg('User enabled.');
            fetchUsers(roleFilter);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed'); }
    };

    const handleUnlock = async (userId: string) => {
        const reason = window.prompt("Enter override reason for unlocking this student:", "Administrative Unlock");
        if (!reason) return;
        try {
            await axios.post(`${API()}/api/admin/overrides`, {
                actionType: 'UNLOCK_STUDENT', entity: 'Student', entityId: userId,
                spocId: user?.id, reason
            }, { headers });
            setActionMsg('Profile unlocked via Override log.');
            fetchUsers(roleFilter);
            fetchStats();
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to unlock'); }
    };

    const handleApproveSpoc = async (id: string) => {
        try {
            await axios.patch(`${API()}/api/admin/spocs/${id}/approve`, {}, { headers });
            setActionMsg('SPOC approved successfully.');
            fetchSpocs();
            fetchStats();
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to approve SPOC'); }
    };

    const handleRejectPendingSpoc = async (id: string, email: string) => {
        const ok = window.confirm(
            `Reject pending SPOC request for ${email}?\n\nThis permanently deletes the account.`
        );
        if (!ok) return;
        try {
            await axios.post(`${API()}/api/admin/spocs/${id}/reject`, {}, { headers });
            setActionMsg('Pending SPOC request rejected and account deleted.');
            fetchSpocs();
            fetchUsers(roleFilter);
            fetchStats();
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || 'Failed to reject SPOC request');
        }
    };

    const handleTogglePermission = async (id: string, perm: string, currentVal: boolean) => {
        try {
            await axios.patch(`${API()}/api/admin/spocs/${id}/permissions`, { [perm]: !currentVal }, { headers });
            setActionMsg(`Permission ${perm} updated.`);
            fetchSpocs();
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to update permission'); }
    };

    const handleRevokeSpoc = async (id: string, email: string) => {
        const ok = window.confirm(
            `Revoke ${email}?\n\nThis permanently deletes the SPOC account and related SPOC-owned data from the database.`
        );
        if (!ok) return;
        try {
            await axios.post(`${API()}/api/admin/spocs/${id}/revoke`, {}, { headers });
            setActionMsg('SPOC revoked and deleted successfully.');
            fetchSpocs();
            fetchUsers(roleFilter);
            fetchStats();
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || 'Failed to revoke SPOC');
        }
    };

    const handleRoleFilter = (role: string) => { setRoleFilter(role); fetchUsers(role); };

    const toggleWhatsappSettings = async (enabled: boolean) => {
        try {
            await axios.patch(`${API()}/api/notifications/admin/settings`, { whatsappEnabled: enabled }, { headers });
            setWhatsappEnabled(enabled);
            setActionMsg(`WhatsApp notifications ${enabled ? 'Enabled' : 'Disabled'}.`);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to update settings'); }
    };

    const updateTemplateDraft = (type: string, templateText: string) => {
        setNotificationTemplates((prev) =>
            prev.map((template) => (template.type === type ? { ...template, templateText } : template))
        );
    };

    const saveNotificationTemplate = async (type: string) => {
        const template = notificationTemplates.find((t) => t.type === type);
        if (!template || !template.templateText.trim()) {
            setActionMsg('Template text cannot be empty.');
            return;
        }
        try {
            setSavingTemplateType(type);
            await axios.put(
                `${API()}/api/notifications/admin/templates/${encodeURIComponent(type)}`,
                { templateText: template.templateText },
                { headers }
            );
            setActionMsg(`Template ${type} saved.`);
            await fetchNotifications();
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || `Failed to save template ${type}`);
        } finally {
            setSavingTemplateType(null);
        }
    };

    const toggleLinkedInSettings = async (enabled: boolean) => {
        try {
            await axios.patch(`${API()}/api/announcements/linkedin/settings`, { enabled }, { headers });
            setLinkedInEnabled(enabled);
            setActionMsg(`LinkedIn Announcements ${enabled ? 'Enabled' : 'Disabled'}.`);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to update settings'); }
    };

    const handlePublishLinkedIn = async (jobId: string) => {
        if (!window.confirm("Trigger LinkedIn Post for this job?")) return;
        const customTemplate = window.prompt(
            'Edit caption template (leave empty to use backend default template):',
            '🎉 Congratulations from TPC!\\n'
        );
        try {
            const body: any = {};
            if (typeof customTemplate === 'string' && customTemplate.trim()) {
                body.post_template = customTemplate.trim();
            }
            const res = await axios.post(`${API()}/api/announcements/job/${jobId}/publish`, body, { headers });
            setActionMsg(res.data.message);
            fetchLinkedInData();
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to trigger publish'); }
    };

    // Helpers
    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            APPLIED: 'bg-blue-50 text-blue-700 border-blue-200',
            REVIEWING: 'bg-amber-50 text-amber-700 border-amber-200',
            SHORTLISTED: 'bg-cyan-50 text-cyan-700 border-cyan-200',
            ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            REJECTED: 'bg-red-50 text-red-700 border-red-200',
            SENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            FAILED: 'bg-red-50 text-red-700 border-red-200',
            PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
            SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
        return map[status] || 'bg-gray-50 text-gray-600 border-gray-200';
    };

    const roleBadge = (role: string) => {
        const map: Record<string, string> = {
            STUDENT: 'bg-blue-50 text-blue-700 border-blue-200',
            SPOC: 'bg-amber-50 text-amber-700 border-amber-200',
            COORDINATOR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
        return map[role] || 'bg-gray-50 text-gray-600 border-gray-200';
    };

    const filteredUsers = users.filter(u => {
        if (!userSearch) return true;
        const name = u.student ? `${u.student.firstName} ${u.student.lastName}` : '';
        return name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
    });

    if (loading) return (
        <div className="p-8 flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
    );

    if (!user || user.role !== 'COORDINATOR') return (
        <div className="p-8 text-center">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-600 font-bold mb-2">{error}</p>
            <Link to="/dashboard" className="text-primary-600 font-bold text-sm hover:underline">← Back to Dashboard</Link>
        </div>
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-full" data-testid="admin-dashboard">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Coordinator Panel</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage users, SPOCs, integrations, and placement analytics.</p>
                </div>
                <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-primary-600 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Dashboard
                </Link>
            </div>

            {/* Action message */}
            <AnimatePresence>
                {actionMsg && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="mb-5 flex items-center justify-between gap-3 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold rounded-xl">
                        <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {actionMsg}</span>
                        <button onClick={() => setActionMsg('')} className="text-emerald-600 hover:text-emerald-800"><XCircle className="w-4 h-4" /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto pb-px">
                {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={clsx('inline-flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap',
                            activeTab === tab.key
                                ? 'border-primary-600 text-primary-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')}>
                        <tab.icon className="w-4 h-4" /> {tab.label}
                        {tab.key === 'users' && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-md font-bold text-gray-500">{total}</span>}
                        {tab.key === 'spocs' && pendingSpocs.length > 0 && (
                            <span className="w-5 h-5 text-xs bg-red-500 text-white rounded-full flex items-center justify-center">{pendingSpocs.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ═══════════════ STATS TAB ═══════════════ */}
            {activeTab === 'stats' && stats && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        {[
                            { label: 'Total Students', value: stats.totalStudents, icon: GraduationCap, color: 'text-primary-600', bg: 'bg-primary-50', border: 'border-primary-100' },
                            { label: 'Jobs Posted', value: stats.totalJobs, icon: Briefcase, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
                            { label: 'Applications', value: stats.totalApplications, icon: FileText, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
                            { label: 'Placed Students', value: stats.placedStudents ?? 0, icon: Award, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                            { label: 'Locked Profiles', value: stats.lockedProfiles ?? 0, icon: Lock, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
                        ].map(stat => (
                            <button
                                key={stat.label}
                                type="button"
                                onClick={() => stat.label === 'Placed Students' ? navigate('/placed-students') : undefined}
                                className={`${stat.bg} ${stat.border} border rounded-2xl p-4 relative overflow-hidden text-left w-full ${stat.label === 'Placed Students' ? 'cursor-pointer hover:shadow-sm transition-all' : 'cursor-default'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`${stat.bg} p-2.5 rounded-xl`}>
                                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">{stat.label}</p>
                                        <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Application Status Breakdown */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Application Status Breakdown</h3>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(stats.applicationsByStatus).map(([status, count]) => (
                                <div key={status} className={`px-4 py-3 rounded-xl border ${statusBadge(status)} text-center min-w-[100px]`}>
                                    <p className="text-2xl font-black">{count}</p>
                                    <p className="text-xs font-bold uppercase tracking-wider mt-0.5">{status}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ USERS TAB ═══════════════ */}
            {activeTab === 'users' && (
                <div className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1 border border-gray-100">
                            {['', 'STUDENT', 'SPOC', 'COORDINATOR'].map(role => (
                                <button key={role} onClick={() => handleRoleFilter(role)}
                                    className={clsx('px-3 py-2 rounded-lg text-xs font-bold transition-all',
                                        roleFilter === role ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700')}>
                                    {role || 'All Roles'}
                                </button>
                            ))}
                        </div>
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="text" placeholder="Search name or email..." value={userSearch} onChange={e => setUserSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none bg-white shadow-sm" />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="users-table">
                        <table className="min-w-full divide-y divide-gray-50">
                            <thead>
                                <tr className="bg-gray-50/80">
                                    <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Account</th>
                                    <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Profile Lock</th>
                                    <th className="px-5 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredUsers.map(u => (
                                    <tr key={u.id} className={clsx('hover:bg-gray-50/50 transition-colors', u.isDisabled && 'opacity-50')}>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                                    <Users className="w-4 h-4 text-gray-400" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{u.student ? `${u.student.firstName} ${u.student.lastName}` : '—'}</p>
                                                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${roleBadge(u.role)}`}>{u.role}</span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={clsx('inline-flex items-center gap-1 text-xs font-bold',
                                                u.isDisabled ? 'text-red-600' : 'text-emerald-600')}>
                                                {u.isDisabled ? <><XCircle className="w-3.5 h-3.5" /> Disabled</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Active</>}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {u.student?.isLocked ? (
                                                <div className="space-y-1">
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                                                        <Lock className="w-3.5 h-3.5" /> Locked
                                                    </span>
                                                    {u.student.placementType && (
                                                        <p className="text-xs text-gray-500">{u.student.placementType}</p>
                                                    )}
                                                    <button onClick={() => handleUnlock(u.id)}
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors mt-1">
                                                        <Unlock className="w-3 h-3" /> Override Unlock
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                                    <Unlock className="w-3.5 h-3.5" /> Free
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            {u.isDisabled ? (
                                                <button onClick={() => handleEnable(u.id)}
                                                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                                                    <UserCheck className="w-3.5 h-3.5" /> Enable
                                                </button>
                                            ) : (
                                                <button onClick={() => handleDisable(u.id)}
                                                    className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                                                    <UserX className="w-3.5 h-3.5" /> Disable
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">No users found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════ SPOC TAB ═══════════════ */}
            {activeTab === 'spocs' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="spoc-management">
                    {/* Pending Approvals */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="p-5 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-amber-500" /> Pending Approvals
                                {pendingSpocs.length > 0 && (
                                    <span className="ml-auto w-6 h-6 text-xs bg-red-500 text-white rounded-full flex items-center justify-center font-bold">{pendingSpocs.length}</span>
                                )}
                            </h3>
                        </div>
                        <div className="p-5 space-y-3" data-testid="pending-approvals">
                            {pendingSpocs.length === 0 ? (
                                <div className="text-center py-6">
                                    <CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400 font-bold">No pending SPOC accounts.</p>
                                </div>
                            ) : pendingSpocs.map(spoc => (
                                <div key={spoc.id} className="flex items-center justify-between p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
                                            <ShieldCheck className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{spoc.email}</p>
                                            <p className="text-xs text-gray-500">Registered {new Date(spoc.createdAt).toLocaleDateString('en-IN')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleApproveSpoc(spoc.id)}
                                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition-all transform active:scale-95">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        <button onClick={() => handleRejectPendingSpoc(spoc.id, spoc.email)}
                                            className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-2 rounded-lg text-xs font-bold transition-all">
                                            <XCircle className="w-3.5 h-3.5" /> Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active SPOCs & Permissions */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="p-5 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-emerald-500" /> Active SPOCs & Permissions
                                <span className="text-xs text-gray-400 font-medium ml-1">({approvedSpocs.length})</span>
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            {approvedSpocs.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6 font-bold">No approved SPOC accounts.</p>
                            ) : approvedSpocs.map(spoc => (
                                <div key={spoc.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{spoc.email}</p>
                                            <p className="text-xs text-gray-500">Verified by {spoc.verifiedBy?.email || 'Admin'}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { key: 'permJobCreate', label: 'Post Jobs', icon: Briefcase },
                                            { key: 'permLockProfile', label: 'Lock Profiles', icon: Lock },
                                            { key: 'permExportCsv', label: 'Export CSV', icon: FileText },
                                        ].map(perm => {
                                            const isOn = !!(spoc as any)[perm.key];
                                            return (
                                                <button key={perm.key} onClick={() => handleTogglePermission(spoc.id, perm.key, isOn)}
                                                    className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                                                        isOn ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-500')}>
                                                    <perm.icon className="w-3 h-3" />
                                                    {perm.label}
                                                    {isOn ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-gray-400" />}
                                                </button>
                                            );
                                        })}
                                        <button
                                            onClick={() => handleRevokeSpoc(spoc.id, spoc.email)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                                        >
                                            <UserX className="w-3 h-3" />
                                            Revoke & Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ NOTIFICATIONS TAB ═══════════════ */}
            {activeTab === 'notifications' && (
                <div className="space-y-6" data-testid="notifications-tab">
                    {/* WhatsApp Toggle Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center', whatsappEnabled ? 'bg-emerald-50' : 'bg-gray-100')}>
                                <MessageSquare className={clsx('w-6 h-6', whatsappEnabled ? 'text-emerald-600' : 'text-gray-400')} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">WhatsApp Integration</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Toggle Zapier/Twilio webhook notifications for placement events.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={clsx('text-xs font-bold', whatsappEnabled ? 'text-emerald-600' : 'text-red-600')}>
                                {whatsappEnabled ? 'Enabled' : 'Offline (Mocked)'}
                            </span>
                            <button onClick={() => toggleWhatsappSettings(!whatsappEnabled)}
                                className={clsx('p-1 rounded-full transition-colors', whatsappEnabled ? 'text-emerald-600' : 'text-gray-400')}>
                                {whatsappEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                            </button>
                        </div>
                    </div>

                    {/* WhatsApp Templates */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6" data-testid="notification-templates">
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">WhatsApp Message Templates</h3>
                            <p className="text-xs text-gray-500 mt-1">Edit placeholders like <code>{'{student_name}'}</code>, <code>{'{company_name}'}</code>, <code>{'{role}'}</code>, <code>{'{status}'}</code>, <code>{'{date}'}</code>.</p>
                        </div>
                        <div className="space-y-4">
                            {notificationTemplates.length === 0 ? (
                                <p className="text-sm text-gray-400 font-bold">No templates available.</p>
                            ) : (
                                notificationTemplates.map((template) => (
                                    <div key={template.type} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <p className="text-sm font-bold text-gray-900">{template.type}</p>
                                            <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-bold',
                                                template.source === 'DB' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-600 bg-gray-100 border-gray-200')}>
                                                {template.source}
                                            </span>
                                        </div>
                                        <textarea
                                            value={template.templateText}
                                            onChange={(e) => updateTemplateDraft(template.type, e.target.value)}
                                            rows={3}
                                            className="w-full rounded-lg border border-gray-200 bg-white text-sm px-3 py-2.5 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none"
                                        />
                                        <div className="flex justify-end mt-3">
                                            <button
                                                onClick={() => saveNotificationTemplate(template.type)}
                                                disabled={savingTemplateType === template.type}
                                                className={clsx(
                                                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                                                    savingTemplateType === template.type
                                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                        : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                                                )}
                                            >
                                                <Save className="w-3.5 h-3.5" />
                                                {savingTemplateType === template.type ? 'Saving...' : 'Save Template'}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Notification Logs */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="notification-logs">
                        <div className="p-5 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Recent Outbound Messages</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-50">
                                <thead>
                                    <tr className="bg-gray-50/80">
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Message</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Context</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {logs.length === 0 ? (
                                        <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">No outbound webhooks found.</td></tr>
                                    ) : logs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap font-medium">
                                                {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-5 py-3">
                                                <p className="text-sm font-bold text-gray-900">{log.user.student ? `${log.user.student.firstName} ${log.user.student.lastName}` : '—'}</p>
                                                <p className="text-xs text-gray-500">{log.user.email}</p>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-gray-600 max-w-[300px] truncate">"{log.message}"</td>
                                            <td className="px-5 py-3">
                                                {log.job ? (
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900">{log.job.companyName}</p>
                                                        <p className="text-xs text-gray-500">{log.job.role}</p>
                                                    </div>
                                                ) : <span className="text-xs text-gray-400">—</span>}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusBadge(log.status)}`}>{log.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ LINKEDIN TAB ═══════════════ */}
            {activeTab === 'linkedin' && (
                <div className="space-y-6">
                    {/* LinkedIn Toggle Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center', linkedInEnabled ? 'bg-blue-50' : 'bg-gray-100')}>
                                <Linkedin className={clsx('w-6 h-6', linkedInEnabled ? 'text-blue-600' : 'text-gray-400')} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">LinkedIn Placement Announcements</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Auto-publish placement results to LinkedIn via Zapier webhook.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={clsx('text-xs font-bold', linkedInEnabled ? 'text-emerald-600' : 'text-red-600')}>
                                {linkedInEnabled ? 'Auto-Publish On' : 'Disabled'}
                            </span>
                            <button onClick={() => toggleLinkedInSettings(!linkedInEnabled)}
                                className={clsx('p-1 rounded-full transition-colors', linkedInEnabled ? 'text-blue-600' : 'text-gray-400')}>
                                {linkedInEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                            </button>
                        </div>
                    </div>

                    {/* LinkedIn Logs */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Publish History</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-50">
                                <thead>
                                    <tr className="bg-gray-50/80">
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Company</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Posted By</th>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {linkedInLogs.length === 0 ? (
                                        <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">No LinkedIn announcements found.</td></tr>
                                    ) : linkedInLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap font-medium">
                                                {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-5 py-3">
                                                <p className="text-sm font-bold text-gray-900">{log.companyName}</p>
                                                <p className="text-xs text-gray-500">Batch {log.placementYear}</p>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-gray-600">{log.postedBy?.email}</td>
                                            <td className="px-5 py-3">
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusBadge(log.zapStatus)}`}>{log.zapStatus}</span>
                                                {log.zapStatus === 'FAILED' && log.responseBody && (
                                                    <p className="text-xs text-red-500 mt-1 max-w-[180px] truncate">{log.responseBody}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {log.jobId && (
                                                    <button onClick={() => handlePublishLinkedIn(log.jobId!)}
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition-colors">
                                                        <RefreshCw className="w-3 h-3" /> Retry
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ ANALYTICS TAB ═══════════════ */}
            {activeTab === 'analytics' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Branch Comparison */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-gray-400" /> Placements by Branch
                            </h4>
                            {branchStats.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={branchStats} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="branch" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }} />
                                        <Legend />
                                        <Bar dataKey="placementCount" fill="#6366f1" name="Students Placed" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[300px] text-gray-400 font-bold text-sm">No branch data available</div>
                            )}
                        </div>

                        {/* Placement Trends */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-gray-400" /> Placement Trends (Monthly)
                            </h4>
                            {trendStats.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={trendStats} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '13px' }} />
                                        <Legend />
                                        <Line type="monotone" dataKey="placements" stroke="#10b981" strokeWidth={3} name="Total Placements" dot={{ r: 5, fill: '#10b981' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[300px] text-gray-400 font-bold text-sm">No trend data available</div>
                            )}
                        </div>
                    </div>

                    {/* ATS Configuration */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-gray-400" /> ATS Engine Tuning
                        </h4>
                        <p className="text-xs text-gray-500 mb-5">Adjust keyword-matching weights. <strong>All weights must sum to 1.0 (100%).</strong></p>

                        {atsConfig ? (
                            <div className="space-y-4">
                                {Object.entries(atsConfig).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-4">
                                        <label className="w-36 text-sm font-bold text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                                        <div className="flex-1 relative">
                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${val * 100}%` }} />
                                            </div>
                                        </div>
                                        <input type="number" step="0.05" min="0" max="1" value={val}
                                            onChange={(e) => setAtsConfig({ ...atsConfig, [key]: parseFloat(e.target.value) || 0 })}
                                            className="w-20 text-right rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-bold focus:border-primary-500 focus:outline-none" />
                                        <span className="w-14 text-xs font-bold text-gray-400 text-right">{Math.round(val * 100)}%</span>
                                    </div>
                                ))}

                                <div className="flex justify-between items-center pt-4 border-t border-dashed border-gray-200">
                                    <span className={clsx('text-sm font-bold',
                                        Math.abs(Object.values(atsConfig).reduce((a, b) => a + b, 0) - 1) < 0.01 ? 'text-emerald-600' : 'text-red-600')}>
                                        Total: {(Object.values(atsConfig).reduce((a, b) => a + b, 0)).toFixed(2)}
                                    </span>
                                    <button onClick={async () => {
                                        try {
                                            const res = await axios.put(`${API()}/api/ats/config`, atsConfig, { headers });
                                            setActionMsg('ATS weights saved successfully.');
                                            setAtsConfig(res.data.data);
                                        } catch (e: any) { alert(e.response?.data?.message || 'Failed to update weights.'); }
                                    }}
                                        className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all transform active:scale-95">
                                        <Save className="w-4 h-4" /> Save Weights
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">Loading ATS Config...</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
