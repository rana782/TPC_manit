import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    Briefcase, FileText, Users, Bell, ChevronRight,
    CheckCircle2, Clock, XCircle, AlertCircle, ArrowRight, X, Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader, { LayoutContainer } from '../components/layout/PageHeader';
import JobStageStepper from '../components/timeline/JobStageStepper';
import { getViteApiBase } from '../utils/apiBase';

interface ProfileData {
    firstName?: string;
    lastName?: string;
    branch?: string;
    course?: string;
    phone?: string;
    cgpa?: number;
    tenthPct?: number;
    twelfthPct?: number;
    linkedin?: string;
    resumes?: any[];
    isLocked?: boolean;
}

interface Application {
    id: string;
    status: string;
    createdAt: string;
    currentStageIndex?: number;
    appliedAt?: string;
    job: {
        id?: string;
        role: string;
        companyName: string;
        jobType?: string;
        ctc?: string | null;
        cgpaMin?: number;
        applicationDeadline?: string;
        stages?: Array<{
            id?: string;
            name: string;
            scheduledDate?: string | null;
            notes?: string | null;
            status?: string;
            attachmentPath?: string | null;
            shortlistDocPath?: string | null;
            shortlistDocTitle?: string | null;
            stageCandidateCount?: number;
        }>;
    };
}

interface Notification {
    id: string;
    type: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}

interface JobItem {
    id: string;
    role: string;
    companyName: string;
    applicationDeadline: string;
}

function getStatusConfig(status: string) {
    const s = status?.toUpperCase() || '';
    if (s.includes('PLACED') || s.includes('ACCEPT') || s.includes('OFFER') || s === 'SELECTED') {
        return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Placed' };
    }
    if (s.includes('REJECT')) return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Rejected' };
    if (s.includes('INTERVIEW') || s.includes('SHORTLIST')) return { icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Interview' };
    if (s.includes('REVIEW') || s.includes('PENDING')) return { icon: Clock, color: 'text-primary-600', bg: 'bg-primary-50', label: 'Under Review' };
    return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', label: status || 'Applied' };
}

const PROFILE_COMPLETION_FIELDS = 12;
function calcProfileCompletion(p: ProfileData | null): number {
    if (!p) return 0;
    const fields = [
        p.firstName, p.lastName, p.branch, p.course, p.phone, p.cgpa,
        p.tenthPct, p.twelfthPct, p.linkedin,
    ];
    const hasResume = p.resumes && p.resumes.length > 0;
    const hasDocs = (p as any).documents && (p as any).documents.length > 0;
    const hasInternships = (p as any).internships && (p as any).internships.length > 0;
    const filled = fields.filter(Boolean).length + (hasResume ? 1 : 0) + (hasDocs ? 1 : 0) + (hasInternships ? 1 : 0);
    return Math.min(100, Math.round((filled / PROFILE_COMPLETION_FIELDS) * 100));
}

function formatActivityTimestamp(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(iso?: string | null) {
    if (!iso) return 'N/A';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DashboardSkeleton() {
    return (
        <LayoutContainer className="space-y-8">
            <div className="space-y-3">
                <div className="h-4 w-24 animate-pulse rounded-md bg-slate-200" />
                <div className="h-9 max-w-md animate-pulse rounded-lg bg-slate-200" />
                <div className="h-4 max-w-lg animate-pulse rounded-md bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                {[0, 1, 2, 3].map((k) => (
                    <div
                        key={k}
                        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
                        </div>
                        <div className="h-9 w-16 animate-pulse rounded-lg bg-slate-200" />
                    </div>
                ))}
            </div>
            <div className="h-28 animate-pulse rounded-2xl border border-slate-200/80 bg-white shadow-sm" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="h-72 animate-pulse rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:col-span-2" />
                <div className="h-72 animate-pulse rounded-2xl border border-slate-200/80 bg-white shadow-sm" />
            </div>
        </LayoutContainer>
    );
}

export default function StudentDashboard() {
    const { user, token } = useAuth();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [applications, setApplications] = useState<Application[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const [dashboardStats, setDashboardStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const drawerCloseRef = useRef<HTMLButtonElement | null>(null);

    const refreshDashboard = useCallback(async () => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const base = getViteApiBase();
        await Promise.allSettled([
            axios.get(`${base}/student/profile`, { headers }),
            axios.get(`${base}/applications`, { headers }),
            axios.get(`${base}/notifications`, { headers }),
            axios.get(`${base}/jobs`, { headers }),
        ]).then(([profileRes, appsRes, notifsRes, jobsRes]) => {
            if (profileRes.status === 'fulfilled') setProfile(profileRes.value.data?.data ?? profileRes.value.data?.student ?? profileRes.value.data);
            if (appsRes.status === 'fulfilled') {
                setApplications(appsRes.value.data.applications || []);
                setDashboardStats(appsRes.value.data.stats ?? null);
            }
            if (notifsRes.status === 'fulfilled') setNotifications(notifsRes.value.data.notifications || []);
            if (jobsRes.status === 'fulfilled') setJobs(jobsRes.value.data.jobs || []);
        }).finally(() => setLoading(false));
    }, [token]);

    useEffect(() => {
        if (!token) return;
        void refreshDashboard();
    }, [token, refreshDashboard]);

    useEffect(() => {
        if (!token) return;
        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') void refreshDashboard();
        }, 60000);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') void refreshDashboard();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [token]);

    useEffect(() => {
        if (!drawerOpen) return;
        const t = setTimeout(() => drawerCloseRef.current?.focus(), 0);
        return () => clearTimeout(t);
    }, [drawerOpen]);

    useEffect(() => {
        if (!drawerOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDrawerOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [drawerOpen]);

    if (!user) return null;

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const profileCompletion = calcProfileCompletion(profile);
    const displayName = profile?.firstName || user.email.split('@')[0];
    const appliedJobsCount = dashboardStats?.appliedJobs ?? applications.length;

    const stats = [
        {
            label: 'Available Jobs',
            value: `${jobs.length}`,
            icon: Briefcase,
            cardClass: 'border-slate-200/90 bg-white',
            iconWrap: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
            accent: 'bg-gradient-to-r from-emerald-500 to-teal-600',
        },
        {
            label: 'Applied Jobs',
            value: `${appliedJobsCount}`,
            icon: FileText,
            cardClass: 'border-slate-200/90 bg-white',
            iconWrap: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
            accent: 'bg-gradient-to-r from-amber-500 to-orange-500',
        },
        {
            label: 'Shortlisted',
            value: `${dashboardStats?.shortlisted ?? applications.filter(a => {
                const s = a.status?.toUpperCase() || '';
                return s.includes('SHORTLIST') || s.includes('INTERVIEW');
            }).length}`,
            icon: Users,
            cardClass: 'border-slate-200/90 bg-white',
            iconWrap: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
            accent: 'bg-gradient-to-r from-violet-500 to-purple-600',
        },
        {
            label: 'Placed',
            value: dashboardStats?.placed != null
                ? `${dashboardStats.placed}`
                : applications.some(a => {
                    const s = a.status?.toUpperCase() || '';
                    return s.includes('PLACED') || s.includes('ACCEPT') || s.includes('OFFER') || s === 'SELECTED';
                }) ? '✓' : '—',
            icon: CheckCircle2,
            cardClass: 'border-slate-200/90 bg-white',
            iconWrap: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
            accent: 'bg-gradient-to-r from-emerald-500 to-teal-600',
        },
    ];

    const recentApps = applications.slice(0, 5);
    const recentNotifs = notifications.slice(0, 5);

    const openTimelineDrawer = (app: Application) => {
        setSelectedApplication(app);
        setDrawerOpen(true);
    };

    const closeTimelineDrawer = () => {
        setDrawerOpen(false);
    };

    useEffect(() => {
        if (!selectedApplication) return;
        const latest = applications.find((a) => a.id === selectedApplication.id);
        if (latest && latest !== selectedApplication) setSelectedApplication(latest);
    }, [applications, selectedApplication]);

    const unreadCount = recentNotifs.filter((n) => !n.isRead).length;

    return (
        <>
            {loading ? (
                <DashboardSkeleton />
            ) : (
                <LayoutContainer className="space-y-8">
                    <PageHeader
                        title="Student overview"
                        subtitle={`${greeting()}, ${displayName}. Track openings and applications from one place.`}
                        breadcrumbs={[{ label: 'Dashboard' }]}
                    />

                    <section aria-label="Placement summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                        {stats.map((stat) => {
                            const Icon = stat.icon;
                            return (
                                <div
                                    key={stat.label}
                                    className={clsx(
                                        'relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md',
                                        stat.cardClass,
                                    )}
                                >
                                    <div
                                        className={clsx('absolute inset-x-0 top-0 h-1', stat.accent)}
                                        aria-hidden
                                    />
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 space-y-1">
                                            <p
                                                className={clsx(
                                                    'text-xs font-semibold uppercase tracking-[0.08em]',
                                                    'text-slate-500',
                                                )}
                                            >
                                                {stat.label}
                                            </p>
                                            <p
                                                className={clsx(
                                                    'font-display text-3xl font-bold tabular-nums tracking-tight',
                                                    'text-slate-900',
                                                )}
                                            >
                                                {stat.value}
                                            </p>
                                        </div>
                                        <div
                                            className={clsx(
                                                'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl',
                                                stat.iconWrap,
                                            )}
                                        >
                                            <Icon className="h-5 w-5" aria-hidden />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </section>

                    <section
                        aria-label="Profile completion"
                        className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6"
                    >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                                {profileCompletion >= 100 ? (
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                                        <CheckCircle2 className="h-5 w-5" aria-hidden />
                                    </div>
                                ) : (
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                                        <AlertCircle className="h-5 w-5" aria-hidden />
                                    </div>
                                )}
                                <div>
                                    <h2 className="font-display text-base font-semibold text-slate-900">
                                        Profile completion
                                    </h2>
                                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                        {profileCompletion >= 100
                                            ? 'Your profile is complete and ready for recruiters.'
                                            : 'Complete your profile, resume, and supporting details to unlock full placement access.'}
                                    </p>
                                </div>
                            </div>
                            {profileCompletion < 100 ? (
                                <Link
                                    to="/profile"
                                    className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 sm:self-center"
                                >
                                    Continue profile
                                    <ArrowRight className="h-4 w-4" aria-hidden />
                                </Link>
                            ) : (
                                <Link
                                    to="/profile"
                                    className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                                >
                                    View profile
                                </Link>
                            )}
                        </div>
                        <div className="mt-5">
                            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                                <span>{profileCompletion}% complete</span>
                                <span className="hidden sm:inline">Resume, academics, internships, documents</span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${profileCompletion}%` }}
                                    transition={{ duration: 0.6, ease: 'easeOut' }}
                                    className={clsx(
                                        'h-full rounded-full',
                                        profileCompletion < 40
                                            ? 'bg-red-500'
                                            : profileCompletion < 70
                                              ? 'bg-amber-500'
                                              : 'bg-emerald-500',
                                    )}
                                />
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
                        <section
                            className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
                            aria-label="Recent activity"
                        >
                            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                        <Activity className="h-4 w-4" aria-hidden />
                                    </div>
                                    <div>
                                        <h2 className="font-display text-base font-semibold text-slate-900">
                                            Recent activity
                                        </h2>
                                        <p className="text-xs text-slate-500">Applications and stage updates</p>
                                    </div>
                                </div>
                                {applications.length > 5 && (
                                    <Link
                                        to="/job-board"
                                        className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800"
                                    >
                                        View all
                                        <ChevronRight className="h-4 w-4" aria-hidden />
                                    </Link>
                                )}
                            </div>
                            {recentApps.length === 0 ? (
                                <div className="flex flex-col items-center px-6 py-14 text-center">
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                        <FileText className="h-7 w-7" aria-hidden />
                                    </div>
                                    <p className="font-medium text-slate-800">No activity yet</p>
                                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                                        When you apply to roles, they will appear here with status and timeline access.
                                    </p>
                                    <Link
                                        to="/job-board"
                                        className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                                    >
                                        Browse job board
                                        <ArrowRight className="h-4 w-4" aria-hidden />
                                    </Link>
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100 px-3 py-2 sm:px-4 sm:py-3">
                                    {recentApps.map((app) => {
                                        const cfg = getStatusConfig(app.status);
                                        const when = formatActivityTimestamp(app.appliedAt || app.createdAt);
                                        return (
                                            <li key={app.id} className="list-none">
                                                <button
                                                    type="button"
                                                    data-testid="application-card"
                                                    onClick={() => openTimelineDrawer(app)}
                                                    className="flex w-full items-start gap-4 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                                                    aria-haspopup="dialog"
                                                >
                                                    <div className="min-w-0 flex-1 space-y-1">
                                                        <p className="truncate font-semibold text-slate-900">
                                                            {app.job?.role || 'Role'}
                                                        </p>
                                                        <p className="truncate text-sm text-slate-600">
                                                            {app.job?.companyName || 'Company'}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {when ? `Applied ${when}` : 'Applied — date pending'}
                                                            <span className="text-slate-400"> • </span>
                                                            Open timeline
                                                        </p>
                                                    </div>
                                                    <span
                                                        className={clsx(
                                                            'inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                                                            cfg.bg,
                                                            cfg.color,
                                                        )}
                                                    >
                                                        {cfg.label}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        <section
                            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
                            aria-label="Notifications"
                        >
                            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                        <Bell className="h-4 w-4" aria-hidden />
                                    </div>
                                    <div>
                                        <h2 className="font-display text-base font-semibold text-slate-900">
                                            Notifications
                                        </h2>
                                        <p className="text-xs text-slate-500">Latest from TPC</p>
                                    </div>
                                </div>
                                {unreadCount > 0 && (
                                    <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-800">
                                        {unreadCount} new
                                    </span>
                                )}
                            </div>
                            {recentNotifs.length === 0 ? (
                                <div className="flex flex-col items-center px-6 py-12 text-center">
                                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                        <Bell className="h-6 w-6" aria-hidden />
                                    </div>
                                    <p className="font-medium text-slate-800">You're all caught up</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Alerts for deadlines, shortlists, and interviews will show here.
                                    </p>
                                </div>
                            ) : (
                                <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto custom-scrollbar">
                                    {recentNotifs.map((n) => (
                                        <li
                                            key={n.id}
                                            className={clsx(
                                                'list-none px-5 py-3.5 transition-colors',
                                                !n.isRead && 'bg-primary-50/40',
                                            )}
                                        >
                                            <p className="text-sm leading-relaxed text-slate-800">{n.message}</p>
                                            <p className="mt-1.5 text-xs font-medium text-slate-500">
                                                {new Date(n.createdAt).toLocaleDateString('en-IN', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                </LayoutContainer>
            )}

            {/* === Timeline Drawer (job-specific stages) === */}
            <AnimatePresence>
                {drawerOpen && selectedApplication && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
                        onClick={closeTimelineDrawer}
                    >
                        <motion.div
                            initial={{ x: 30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 30, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="absolute right-0 top-0 h-full w-full sm:w-[540px] bg-white shadow-2xl"
                            data-testid="timeline-drawer"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-label="Application stage timeline drawer"
                        >
                            <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-500 truncate">{selectedApplication.job?.companyName || 'Company'}</p>
                                    <p className="text-lg font-extrabold text-gray-900 truncate">{selectedApplication.job?.role || 'Role'}</p>
                                </div>
                                <button
                                    ref={drawerCloseRef}
                                    type="button"
                                    onClick={closeTimelineDrawer}
                                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                                    aria-label="Close timeline drawer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="h-[calc(100%-76px)] space-y-4 overflow-y-auto p-6 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Applied on</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-800">
                                            {formatShortDate(selectedApplication.appliedAt || selectedApplication.createdAt)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Apply by</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-800">
                                            {formatShortDate(selectedApplication.job?.applicationDeadline)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Compensation</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-800">
                                            {selectedApplication.job?.ctc || 'Not specified'}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Min. CGPA</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-800">
                                            {selectedApplication.job?.cgpaMin ?? 0}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    {(() => {
                                        const cfg = getStatusConfig(selectedApplication.status);
                                        const stageCount = selectedApplication.job?.stages?.length || 0;
                                        const currentStage = Math.max(1, (selectedApplication.currentStageIndex ?? 0) + 1);
                                        return (
                                            <div className="flex items-center justify-between gap-3">
                                                <span className={clsx(
                                                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                                    cfg.bg, cfg.color
                                                )}>
                                                    {cfg.label}
                                                </span>
                                                <span className="text-xs font-semibold text-gray-500">
                                                    Stage {Math.min(currentStage, Math.max(1, stageCount))} of {Math.max(1, stageCount)}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <JobStageStepper
                                    stages={selectedApplication.job?.stages || []}
                                    currentStageIndex={selectedApplication.currentStageIndex ?? 0}
                                    applicationStatus={selectedApplication.status}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
