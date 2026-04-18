import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
    Users, ShieldCheck, Mail, Linkedin,
    Briefcase, FileText, Lock, Unlock,
    CheckCircle2, XCircle, Search, ArrowLeft,
    ToggleLeft, ToggleRight, RefreshCw, UserCheck, UserX,
    Shield, Save, Clock, Settings2, UserCircle, Trash2
} from 'lucide-react';

function formatEmailLocal(email: string) {
    const local = email.split('@')[0] || email;
    return local
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

function accountDisplayName(u: User) {
    if (u.student?.firstName?.trim() || u.student?.lastName?.trim()) {
        return `${u.student!.firstName ?? ''} ${u.student!.lastName ?? ''}`.trim();
    }
    return formatEmailLocal(u.email);
}

function initialsFromDisplayName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return (name.slice(0, 2) || '—').toUpperCase();
}

function logUserDisplayName(user: { email: string; student?: { firstName: string; lastName: string } | null }) {
    if (user.student?.firstName?.trim() || user.student?.lastName?.trim()) {
        return `${user.student.firstName ?? ''} ${user.student.lastName ?? ''}`.trim();
    }
    return formatEmailLocal(user.email);
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

type TabKey = 'users' | 'spocs' | 'email' | 'linkedin';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'spocs', label: 'SPOCs', icon: ShieldCheck },
    { key: 'email', label: 'Email Automation', icon: Mail },
    { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
];

export default function AdminDashboard() {
    const { token, user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('users');
    const [roleFilter, setRoleFilter] = useState('');
    const [pendingSpocs, setPendingSpocs] = useState<Spoc[]>([]);
    const [approvedSpocs, setApprovedSpocs] = useState<Spoc[]>([]);
    const [emailLogs, setEmailLogs] = useState<NotificationLog[]>([]);
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [emailTemplate, setEmailTemplate] = useState('');
    const [emailTemplateSource, setEmailTemplateSource] = useState<'DB' | 'DEFAULT'>('DEFAULT');
    const [savingEmailTemplate, setSavingEmailTemplate] = useState(false);
    const [linkedInLogs, setLinkedInLogs] = useState<LinkedInLog[]>([]);
    const [linkedInEnabled, setLinkedInEnabled] = useState(false);
    const [error, setError] = useState('');
    const [actionMsg, setActionMsg] = useState('');
    const [userSearch, setUserSearch] = useState('');

    const headers = { Authorization: `Bearer ${token}` };

    const fetchUsers = async (role = '') => {
        const params = role ? `?role=${role}` : '';
        const res = await axios.get(`${getViteApiBase()}/admin/users${params}`, { headers });
        if (res.data.success) { setUsers(res.data.users); setTotal(res.data.total); }
    };

    const fetchSpocs = async () => {
        try {
            const [pendingRes, approvedRes] = await Promise.all([
                axios.get(`${getViteApiBase()}/admin/spocs/pending`, { headers }),
                axios.get(`${getViteApiBase()}/admin/spocs/approved`, { headers })
            ]);
            if (pendingRes.data.success) setPendingSpocs(pendingRes.data.spocs);
            if (approvedRes.data.success) setApprovedSpocs(approvedRes.data.spocs);
        } catch (e) { console.error("Failed to fetch SPOCs", e); }
    };

    const fetchEmailAutomation = async () => {
        try {
            const [logsRes, settingsRes, templateRes] = await Promise.all([
                axios.get(`${getViteApiBase()}/notifications/admin/email/logs?channel=EMAIL`, { headers }),
                axios.get(`${getViteApiBase()}/notifications/admin/email/settings`, { headers }),
                axios.get(`${getViteApiBase()}/notifications/admin/email/template`, { headers })
            ]);
            if (logsRes.data.success) setEmailLogs((logsRes.data.logs || []).filter((l: NotificationLog) => l.channel === 'EMAIL'));
            if (settingsRes.data.success) setEmailEnabled(settingsRes.data.setting?.value === 'true');
            if (templateRes.data.success) {
                setEmailTemplate(templateRes.data.template || '');
                setEmailTemplateSource(templateRes.data.source === 'DB' ? 'DB' : 'DEFAULT');
            }
        } catch (e) { console.error("Failed to fetch email automation data", e); }
    };

    const fetchLinkedInData = async () => {
        try {
            const [logsRes, settingsRes] = await Promise.all([
                axios.get(`${getViteApiBase()}/announcements/linkedin/logs`, { headers }),
                axios.get(`${getViteApiBase()}/announcements/linkedin/settings`, { headers })
            ]);
            if (logsRes.data.success) setLinkedInLogs(logsRes.data.logs);
            if (settingsRes.data.success) setLinkedInEnabled(settingsRes.data.setting?.value === 'true');
        } catch (e) { console.error("Failed to fetch LinkedIn data", e); }
    };

    useEffect(() => {
        if (token && user?.role === 'COORDINATOR') {
            Promise.all([fetchUsers(), fetchSpocs(), fetchEmailAutomation(), fetchLinkedInData()]).finally(() => setLoading(false));
        } else {
            setLoading(false);
            setError('Access Denied: Only Coordinators can access the Admin Panel.');
        }
    }, [token, user]);

    const handleDisable = async (id: string) => {
        if (!window.confirm('Disable this user?')) return;
        try {
            await axios.patch(`${getViteApiBase()}/admin/users/${id}/disable`, {}, { headers });
            setActionMsg('User disabled.');
            fetchUsers(roleFilter);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed'); }
    };

    const handleEnable = async (id: string) => {
        try {
            await axios.patch(`${getViteApiBase()}/admin/users/${id}/enable`, {}, { headers });
            setActionMsg('User enabled.');
            fetchUsers(roleFilter);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed'); }
    };

    const handleDeleteUser = async (target: User) => {
        if (target.id === user?.id) {
            setActionMsg('You cannot delete your own coordinator account.');
            return;
        }
        const warn = [
            `Delete user account permanently?`,
            '',
            `Email: ${target.email}`,
            `Role: ${target.role}`,
            '',
            'This action deletes the account and related data.'
        ].join('\n');
        const ok = window.confirm(warn);
        if (!ok) return;
        try {
            await axios.delete(`${getViteApiBase()}/admin/users/${target.id}`, { headers });
            setActionMsg(`Deleted ${target.email}.`);
            await fetchUsers(roleFilter);
            if (target.role === 'SPOC') await fetchSpocs();
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || 'Failed to delete user');
        }
    };

    const handleUnlock = async (userId: string) => {
        const reason = window.prompt("Enter override reason for unlocking this student:", "Administrative Unlock");
        if (!reason) return;
        try {
            await axios.post(`${getViteApiBase()}/admin/overrides`, {
                actionType: 'UNLOCK_STUDENT', entity: 'Student', entityId: userId,
                spocId: user?.id, reason
            }, { headers });
            setActionMsg('Profile unlocked via Override log.');
            fetchUsers(roleFilter);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to unlock'); }
    };

    const handleApproveSpoc = async (id: string) => {
        try {
            await axios.patch(`${getViteApiBase()}/admin/spocs/${id}/approve`, {}, { headers });
            setActionMsg('SPOC approved successfully.');
            fetchSpocs();
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to approve SPOC'); }
    };

    const handleRejectPendingSpoc = async (id: string, email: string) => {
        const ok = window.confirm(
            `Reject pending SPOC request for ${email}?\n\nThis permanently deletes the account.`
        );
        if (!ok) return;
        try {
            await axios.post(`${getViteApiBase()}/admin/spocs/${id}/reject`, {}, { headers });
            setActionMsg('Pending SPOC request rejected and account deleted.');
            fetchSpocs();
            fetchUsers(roleFilter);
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || 'Failed to reject SPOC request');
        }
    };

    const handleTogglePermission = async (id: string, perm: string, currentVal: boolean) => {
        try {
            await axios.patch(`${getViteApiBase()}/admin/spocs/${id}/permissions`, { [perm]: !currentVal }, { headers });
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
            await axios.post(`${getViteApiBase()}/admin/spocs/${id}/revoke`, {}, { headers });
            setActionMsg('SPOC revoked and deleted successfully.');
            fetchSpocs();
            fetchUsers(roleFilter);
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || 'Failed to revoke SPOC');
        }
    };

    const handleRoleFilter = (role: string) => { setRoleFilter(role); fetchUsers(role); };

    const toggleEmailSettings = async (enabled: boolean) => {
        try {
            await axios.patch(`${getViteApiBase()}/notifications/admin/email/settings`, { emailEnabled: enabled }, { headers });
            setEmailEnabled(enabled);
            setActionMsg(`Email automation ${enabled ? 'enabled' : 'disabled'}.`);
        } catch (e: any) { setActionMsg(e.response?.data?.message || 'Failed to update settings'); }
    };

    const saveEmailTemplate = async () => {
        if (!emailTemplate.trim()) {
            setActionMsg('Template text cannot be empty.');
            return;
        }
        try {
            setSavingEmailTemplate(true);
            await axios.put(
                `${getViteApiBase()}/notifications/admin/email/template`,
                { templateText: emailTemplate.trim() },
                { headers }
            );
            setActionMsg('Placement email template saved.');
            await fetchEmailAutomation();
        } catch (e: any) {
            setActionMsg(e.response?.data?.message || 'Failed to save email template');
        } finally {
            setSavingEmailTemplate(false);
        }
    };

    const toggleLinkedInSettings = async (enabled: boolean) => {
        try {
            await axios.patch(`${getViteApiBase()}/announcements/linkedin/settings`, { enabled }, { headers });
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
            const res = await axios.post(`${getViteApiBase()}/announcements/job/${jobId}/publish`, body, { headers });
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
            STUDENT: 'bg-slate-100 text-slate-800 border-slate-200/90',
            SPOC: 'bg-violet-50 text-violet-800 border-violet-200/80',
            COORDINATOR: 'bg-indigo-50 text-indigo-900 border-indigo-200/80',
        };
        return map[role] || 'bg-slate-50 text-slate-600 border-slate-200';
    };

    const roleAvatarRing = (role: string) => {
        if (role === 'STUDENT') return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80';
        if (role === 'SPOC') return 'bg-violet-50 text-violet-800 ring-1 ring-violet-200/70';
        return 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200/70';
    };

    const filteredUsers = users.filter((u) => {
        if (!userSearch) return true;
        const q = userSearch.toLowerCase();
        const display = accountDisplayName(u).toLowerCase();
        const legacyName = u.student ? `${u.student.firstName} ${u.student.lastName}`.toLowerCase() : '';
        return display.includes(q) || legacyName.includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
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
        <div className="min-h-full bg-slate-100/80" data-testid="admin-dashboard">
            <div className="max-w-[1680px] mx-auto flex flex-col lg:flex-row min-h-full">
                <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-200/80 bg-white/95 backdrop-blur-sm py-6 px-4 shadow-[1px_0_0_0_rgba(15,23,42,0.04)] lg:min-h-screen">
                    <div className="px-1 mb-8">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm ring-1 ring-slate-900/5 mb-4">
                            <Shield className="w-[18px] h-[18px]" aria-hidden />
                        </div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Admin console</p>
                        <h1 className="text-lg font-display font-semibold text-slate-900 leading-snug mt-1">Coordinator</h1>
                        <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">
                            Accounts, SPOC access, and outbound messaging.
                        </p>
                    </div>
                    <nav className="flex flex-col gap-0.5 flex-1" aria-label="Admin sections">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={clsx(
                                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-semibold transition-colors',
                                    activeTab === tab.key
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-100/90'
                                )}
                            >
                                <tab.icon className={clsx('w-4 h-4 shrink-0', activeTab === tab.key ? 'text-white' : 'text-slate-500')} />
                                <span className="flex-1 truncate">{tab.label}</span>
                                {tab.key === 'users' && (
                                    <span
                                        className={clsx(
                                            'text-[11px] px-2 py-0.5 rounded-md font-semibold tabular-nums',
                                            activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-slate-200/90 text-slate-700'
                                        )}
                                    >
                                        {total}
                                    </span>
                                )}
                                {tab.key === 'spocs' && pendingSpocs.length > 0 && (
                                    <span className="min-w-[1.25rem] h-5 text-[10px] font-semibold bg-rose-600 text-white rounded-full flex items-center justify-center shadow-sm">
                                        {pendingSpocs.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>
                    <Link
                        to="/dashboard"
                        className="mt-auto pt-4 mx-1 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 opacity-70" />
                        Back to app
                    </Link>
                </aside>

                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="lg:hidden border-b border-slate-200 bg-white">
                        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-medium text-slate-500">Administration</p>
                                <h1 className="text-xl font-display font-semibold text-slate-900 tracking-tight">Coordinator console</h1>
                            </div>
                            <Link
                                to="/dashboard"
                                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-700 shrink-0"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" /> Exit
                            </Link>
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto px-2 pb-3">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveTab(tab.key)}
                                    className={clsx(
                                        'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap shrink-0 transition-colors',
                                        activeTab === tab.key
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    )}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                    {tab.key === 'users' && (
                                        <span
                                            className={clsx(
                                                'text-[10px] px-1 rounded font-bold',
                                                activeTab === tab.key ? 'bg-white/20' : 'bg-white/90 text-slate-600'
                                            )}
                                        >
                                            {total}
                                        </span>
                                    )}
                                    {tab.key === 'spocs' && pendingSpocs.length > 0 && (
                                        <span className="min-w-[1rem] h-4 text-[9px] font-semibold bg-rose-600 text-white rounded-full flex items-center justify-center">
                                            {pendingSpocs.length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <main className="p-4 sm:p-6 lg:p-8 flex-1 lg:bg-[linear-gradient(180deg,rgba(248,250,252,0.5)_0%,transparent_28%)]">
                        <div className="hidden lg:flex items-center justify-between gap-6 mb-8">
                            <div className="min-w-0 pr-4">
                                <p className="text-xs font-medium text-slate-500 mb-1">You are viewing</p>
                                <h2 className="text-2xl font-display font-semibold tracking-tight text-slate-900">
                                    {TABS.find((t) => t.key === activeTab)?.label ?? 'Admin'}
                                </h2>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-600 max-w-md rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm shrink-0">
                                <Settings2 className="w-4 h-4 shrink-0 text-slate-400" aria-hidden />
                                <span className="text-left leading-relaxed">
                                    Privileged session — sensitive actions are recorded for audit.
                                </span>
                            </div>
                        </div>

                        {actionMsg && (
                            <div className="mb-6 flex items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50/95 border border-emerald-200/80 text-emerald-900 text-sm font-semibold shadow-sm">
                                <span className="flex items-center gap-2 min-w-0">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{actionMsg}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setActionMsg('')}
                                    className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg hover:bg-emerald-100/80 shrink-0"
                                    aria-label="Dismiss"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        )}

            {/* ═══════════════ USERS TAB ═══════════════ */}
            {activeTab === 'users' && (
                <div className="space-y-4">
                    <div
                        className="rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.03] overflow-hidden"
                        data-testid="users-table"
                    >
                        <div className="flex flex-col gap-5 border-b border-slate-100 bg-slate-50/50 px-4 py-5 sm:px-6">
                            <div className="space-y-2 min-w-0">
                                <h3 className="text-base font-semibold text-slate-900 tracking-tight">Account directory</h3>
                                <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 tabular-nums shadow-sm">
                                        {userSearch ? (
                                            <>
                                                <span className="text-slate-500 font-medium mr-1">Match</span>
                                                {filteredUsers.length}
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-slate-500 font-medium mr-1">Shown</span>
                                                {filteredUsers.length}
                                            </>
                                        )}
                                    </span>
                                    {roleFilter ? (
                                        <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-900 uppercase tracking-wide">
                                            {roleFilter}
                                        </span>
                                    ) : null}
                                    {total !== filteredUsers.length && !userSearch ? (
                                        <span className="inline-flex items-center rounded-md border border-slate-200/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 tabular-nums">
                                            {total} total in directory
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                                <div
                                    className="inline-flex flex-wrap rounded-lg border border-slate-200/90 bg-white p-0.5 shadow-sm w-fit max-w-full"
                                    role="group"
                                    aria-label="Filter by role"
                                >
                                    {['', 'STUDENT', 'SPOC', 'COORDINATOR'].map((role) => (
                                        <button
                                            key={role || 'all'}
                                            type="button"
                                            onClick={() => handleRoleFilter(role)}
                                            className={clsx(
                                                'px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap',
                                                roleFilter === role
                                                    ? 'bg-slate-900 text-white shadow-sm'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                            )}
                                        >
                                            {role || 'All'}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative w-full lg:w-80 lg:max-w-md lg:shrink-0">
                                    <Search
                                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                        aria-hidden
                                    />
                                    <input
                                        type="search"
                                        placeholder="Search name or email…"
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80 focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-[760px] w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-white">
                                        <th className="px-4 sm:px-5 py-3 text-xs font-semibold text-slate-500 w-[38%]">User</th>
                                        <th className="px-4 sm:px-5 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">Role</th>
                                        <th className="px-4 sm:px-5 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">Status</th>
                                        <th className="px-4 sm:px-5 py-3 text-xs font-semibold text-slate-500 min-w-[11rem] w-[14%]">
                                            Profile lock
                                        </th>
                                        <th className="px-4 sm:px-5 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap w-px">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredUsers.map((u) => {
                                        const display = accountDisplayName(u);
                                        const initials = initialsFromDisplayName(display);
                                        const RoleIcon =
                                            u.role === 'STUDENT' ? UserCircle : u.role === 'SPOC' ? ShieldCheck : Shield;
                                        return (
                                            <tr
                                                key={u.id}
                                                className={clsx(
                                                    'transition-colors hover:bg-slate-50/80',
                                                    u.isDisabled && 'opacity-[0.72]'
                                                )}
                                            >
                                                <td className="px-4 sm:px-5 py-3.5">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div
                                                            className={clsx(
                                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tracking-wide',
                                                                roleAvatarRing(u.role)
                                                            )}
                                                            aria-hidden
                                                        >
                                                            {initials}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <p className="text-sm font-semibold text-slate-900 truncate">
                                                                    {display}
                                                                </p>
                                                                <RoleIcon
                                                                    className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block"
                                                                    aria-hidden
                                                                />
                                                            </div>
                                                            <p className="text-xs text-slate-500 truncate mt-0.5">{u.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-5 py-3.5 align-top">
                                                    <span
                                                        className={clsx(
                                                            'inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-md border',
                                                            roleBadge(u.role)
                                                        )}
                                                    >
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-5 py-3.5 align-top">
                                                    <span
                                                        className={clsx(
                                                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                                            u.isDisabled
                                                                ? 'border-rose-200 bg-rose-50 text-rose-800'
                                                                : 'border-emerald-200/90 bg-emerald-50/90 text-emerald-800'
                                                        )}
                                                    >
                                                        {u.isDisabled ? (
                                                            <>
                                                                <XCircle className="w-3 h-3" aria-hidden />
                                                                Disabled
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CheckCircle2 className="w-3 h-3" aria-hidden />
                                                                Active
                                                            </>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-5 py-3.5 align-top text-sm">
                                                    {u.role === 'STUDENT' ? (
                                                        u.student?.isLocked ? (
                                                            <div className="max-w-[13rem] space-y-2 rounded-lg border border-rose-100 bg-rose-50/50 p-2.5">
                                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                                                                    <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                                                    Locked
                                                                </span>
                                                                {u.student.placementType ? (
                                                                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-600 bg-white/90 border border-slate-200/80 rounded px-2 py-1 leading-snug break-words">
                                                                        {u.student.placementType.replace(/_/g, ' ')}
                                                                    </span>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUnlock(u.id)}
                                                                    className="inline-flex w-full items-center justify-center gap-1 text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-200/90 px-2 py-1.5 rounded-md hover:bg-amber-100/90 transition-colors"
                                                                >
                                                                    <Unlock className="w-3 h-3 shrink-0" aria-hidden />
                                                                    Unlock
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                                                <Unlock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                                                                Unlocked
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 sm:px-5 py-3.5 text-right align-top whitespace-nowrap">
                                                    <div className="inline-flex flex-wrap justify-end items-center gap-2">
                                                        {u.isDisabled ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEnable(u.id)}
                                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/90 px-3 py-1.5 rounded-lg hover:bg-emerald-100/80 transition-colors"
                                                            >
                                                                <UserCheck className="w-3.5 h-3.5" aria-hidden />
                                                                Enable
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDisable(u.id)}
                                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200/90 px-3 py-1.5 rounded-lg hover:bg-rose-100/80 transition-colors"
                                                            >
                                                                <UserX className="w-3.5 h-3.5" aria-hidden />
                                                                Disable
                                                            </button>
                                                        )}

                                                        {u.id === user?.id ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 border border-slate-200 rounded-lg px-2.5 py-1.5">
                                                                Current session
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteUser(u)}
                                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-900 bg-white border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredUsers.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-14 text-center">
                                                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden />
                                                <p className="text-sm font-semibold text-slate-600">No accounts match</p>
                                                <p className="text-xs text-slate-500 mt-1">Try another role filter or search term.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ SPOC TAB ═══════════════ */}
            {activeTab === 'spocs' && (
                <div className="space-y-5">
                    <p className="text-xs font-medium text-slate-500">SPOC access and onboarding</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="spoc-management">
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-amber-600 shrink-0" /> Pending approvals
                                {pendingSpocs.length > 0 && (
                                    <span className="ml-auto min-w-[1.5rem] h-6 px-1.5 text-[11px] font-semibold bg-rose-600 text-white rounded-full flex items-center justify-center shadow-sm">{pendingSpocs.length}</span>
                                )}
                            </h3>
                        </div>
                        <div className="p-5 space-y-3" data-testid="pending-approvals">
                            {pendingSpocs.length === 0 ? (
                                <div className="text-center py-6">
                                    <CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400 font-bold">No pending SPOC accounts.</p>
                                </div>
                            ) : pendingSpocs.map((spoc) => (
                                <div
                                    key={spoc.id}
                                    className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-white p-4 shadow-sm ring-1 ring-amber-100/60"
                                >
                                    <div className="space-y-4">
                                        <div className="flex min-w-0 flex-1 gap-3">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100">
                                                <ShieldCheck className="h-5 w-5 text-amber-700" aria-hidden />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800/80">
                                                    Pending request
                                                </p>
                                                <p className="text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">
                                                    {spoc.email}
                                                </p>
                                                <p className="text-xs font-medium text-slate-600">
                                                    Registered{' '}
                                                    {new Date(spoc.createdAt).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                            <button
                                                type="button"
                                                onClick={() => handleApproveSpoc(spoc.id)}
                                                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:flex-none sm:min-w-[8rem]"
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRejectPendingSpoc(spoc.id, spoc.email)}
                                                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-800 transition-colors hover:bg-rose-100/90 sm:flex-none sm:min-w-[8rem]"
                                            >
                                                <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" /> Active SPOCs and permissions
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
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">{spoc.email}</p>
                                            <p className="mt-0.5 break-words text-xs text-slate-600">
                                                Verified by <span className="font-medium">{spoc.verifiedBy?.email || 'Admin'}</span>
                                            </p>
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
                </div>
            )}

            {/* ═══════════════ EMAIL AUTOMATION TAB ═══════════════ */}
            {activeTab === 'email' && (
                <div className="space-y-6" data-testid="email-automation-tab">
                    <p className="text-xs font-medium text-slate-500">Placement email automation</p>
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center', emailEnabled ? 'bg-blue-50' : 'bg-gray-100')}>
                                <Mail className={clsx('w-6 h-6', emailEnabled ? 'text-blue-600' : 'text-gray-400')} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Placement Email Automation</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Same flow as SPOC email publish, with coordinator-level enable/disable and template control.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={clsx('text-xs font-bold', emailEnabled ? 'text-emerald-600' : 'text-red-600')}>
                                {emailEnabled ? 'Enabled' : 'Disabled (Mocked)'}
                            </span>
                            <button onClick={() => toggleEmailSettings(!emailEnabled)}
                                className={clsx('p-1 rounded-full transition-colors', emailEnabled ? 'text-blue-600' : 'text-gray-400')}>
                                {emailEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6" data-testid="email-template-card">
                        <div className="mb-4">
                            <h3 className="text-sm font-display font-bold text-slate-900">Placement result email template</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                Placeholders: <code>{'{student_name}'}</code>, <code>{'{company_name}'}</code>, <code>{'{role}'}</code>, <code>{'{ctc}'}</code>, <code>{'{status}'}</code>, <code>{'{placement_year}'}</code>.
                            </p>
                        </div>
                        <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-sm font-bold text-gray-900">Default template used by email webhook</p>
                                <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-bold',
                                    emailTemplateSource === 'DB' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-600 bg-gray-100 border-gray-200')}>
                                    {emailTemplateSource}
                                </span>
                            </div>
                            <textarea
                                value={emailTemplate}
                                onChange={(e) => setEmailTemplate(e.target.value)}
                                rows={4}
                                className="w-full rounded-lg border border-gray-200 bg-white text-sm px-3 py-2.5 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:outline-none"
                            />
                            <div className="flex justify-end mt-3">
                                <button
                                    onClick={saveEmailTemplate}
                                    disabled={savingEmailTemplate}
                                    className={clsx(
                                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                                        savingEmailTemplate
                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                            : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                                    )}
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    {savingEmailTemplate ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" data-testid="email-logs">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-sm font-display font-bold text-slate-900">Recent placement email logs</h3>
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
                                    {emailLogs.length === 0 ? (
                                        <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">No email logs found.</td></tr>
                                    ) : emailLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap font-medium">
                                                {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-5 py-3">
                                                <p className="text-sm font-semibold text-slate-900">{logUserDisplayName(log.user)}</p>
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
                    <p className="text-xs font-medium text-slate-500">LinkedIn announcements</p>
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-sm font-display font-bold text-slate-900">Publish history</h3>
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
                    </main>
                </div>
            </div>
        </div>
    );
}
