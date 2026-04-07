import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    Briefcase, FileText, Users, TrendingUp, Bell, ChevronRight,
    CheckCircle2, Clock, XCircle, AlertCircle, ArrowRight, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader from '../components/layout/PageHeader';
import JobStageStepper from '../components/timeline/JobStageStepper';

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
        role: string;
        companyName: string;
        stages?: Array<{ id?: string; name: string; scheduledDate?: string | null }>;
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

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getStatusConfig(status: string) {
    const s = status?.toUpperCase() || '';
    if (s.includes('ACCEPT') || s.includes('OFFER') || s === 'SELECTED') return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Selected' };
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

export default function Dashboard() {
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

    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        Promise.allSettled([
            axios.get(`${API}/api/student/profile`, { headers }),
            axios.get(`${API}/api/applications`, { headers }),
            axios.get(`${API}/api/notifications`, { headers }),
            axios.get(`${API}/api/jobs`, { headers }),
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
    const jobsOfferedCount = dashboardStats?.jobsOffered ?? applications.filter(a => {
        const s = a.status?.toUpperCase() || '';
        return s.includes('ACCEPT') || s.includes('OFFER') || s === 'SELECTED';
    }).length;

    const stats = [
        { label: 'Available Jobs', value: `${jobs.length}`, icon: Briefcase, color: 'bg-emerald-50 text-emerald-600', gradient: 'from-emerald-500 to-emerald-700' },
        { label: 'Applied Jobs', value: `${appliedJobsCount}`, icon: FileText, color: 'bg-amber-50 text-amber-600', gradient: 'from-amber-500 to-amber-700' },
        { label: 'Jobs Offered', value: `${jobsOfferedCount}`, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600', gradient: 'from-emerald-500 to-emerald-700' },
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

    return (
        <>
            <PageHeader
                title={`${greeting()}, ${displayName}`}
                subtitle="Here's your placement overview"
                breadcrumbs={[{ label: 'Dashboard' }]}
            />

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Stats cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {stats.map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: i * 0.08 }}
                                className="relative bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all overflow-hidden group"
                            >
                                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-500">{stat.label}</span>
                                    <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                                        <stat.icon className="w-5 h-5" />
                                    </div>
                                </div>
                                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Profile completion bar */}
                    {profileCompletion < 100 && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 }}
                            className="bg-white rounded-xl border border-gray-200 p-5"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                                    <span className="text-sm font-semibold text-gray-900">Profile Completion</span>
                                </div>
                                <Link to="/profile" className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                    Update profile <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${profileCompletion}%` }}
                                    transition={{ duration: 0.8, delay: 0.5 }}
                                    className={clsx(
                                        'h-2.5 rounded-full',
                                        profileCompletion < 40 ? 'bg-red-500' : profileCompletion < 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                    )}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">{profileCompletion}% — profile info, resume, education, internships, documents</p>
                        </motion.div>
                    )}

                    {/* Main grid: Applications timeline + Right column */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Applications list (timeline opens only in drawer) */}
                        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                                <h3 className="text-base font-semibold text-gray-900">Recent Applications</h3>
                                {applications.length > 5 && (
                                    <Link to="/job-board" className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                        View all <ChevronRight className="w-3 h-3" />
                                    </Link>
                                )}
                            </div>
                            {recentApps.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                                        <FileText className="w-6 h-6 text-gray-300" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-500 mb-1">No applications yet</p>
                                    <p className="text-xs text-gray-400 mb-4">Start applying to jobs to track your progress</p>
                                    <Link to="/job-board" className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                        Browse jobs <ArrowRight className="w-3 h-3" />
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-3 px-6 py-5">
                                    {recentApps.map((app) => {
                                        const cfg = getStatusConfig(app.status);
                                        return (
                                            <button
                                                key={app.id}
                                                type="button"
                                                data-testid="application-card"
                                                onClick={() => openTimelineDrawer(app)}
                                                className="w-full text-left flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                                                aria-haspopup="dialog"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{app.job?.role || 'Role'}</p>
                                                    <p className="text-xs text-gray-500 truncate">{app.job?.companyName || 'Company'}</p>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Tap to view stage progress
                                                    </p>
                                                </div>
                                                <span className={clsx(
                                                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0',
                                                    cfg.bg, cfg.color
                                                )}>
                                                    {cfg.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Right column */}
                        <div className="space-y-6">
                            {/* Notifications panel */}
                            <div className="bg-white rounded-xl border border-gray-200">
                                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                    <div className="flex items-center gap-2">
                                        <Bell className="w-4 h-4 text-gray-500" />
                                        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                                    </div>
                                    {recentNotifs.filter(n => !n.isRead).length > 0 && (
                                        <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                                            {recentNotifs.filter(n => !n.isRead).length} new
                                        </span>
                                    )}
                                </div>
                                {recentNotifs.length === 0 ? (
                                    <div className="py-8 text-center">
                                        <Bell className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                                        <p className="text-xs text-gray-400">No notifications</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                                        {recentNotifs.map((n, i) => (
                                            <motion.div
                                                key={n.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: 0.2 + i * 0.05 }}
                                                className={clsx(
                                                    'px-5 py-3 text-sm',
                                                    !n.isRead && 'bg-primary-50/30'
                                                )}
                                            >
                                                <p className="text-xs text-gray-700 leading-relaxed">{n.message}</p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* (Offers Received card removed to avoid duplication) */}
                        </div>
                    </div>
                </div>
            )}

            {/* === Timeline Drawer (job-specific stages) === */}
            <AnimatePresence>
                {drawerOpen && selectedApplication && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-50"
                        onClick={closeTimelineDrawer}
                    >
                        <motion.div
                            initial={{ x: 30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 30, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-white shadow-2xl"
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

                            <div className="p-6 space-y-4 overflow-y-auto h-[calc(100%-76px)] custom-scrollbar">
                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                                    {(() => {
                                        const cfg = getStatusConfig(selectedApplication.status);
                                        return (
                                            <div className="flex items-center justify-between gap-3">
                                                <span className={clsx(
                                                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                                                    cfg.bg, cfg.color
                                                )}>
                                                    {cfg.label}
                                                </span>
                                                <span className="text-xs font-semibold text-gray-500">
                                                    Current stage #{selectedApplication.currentStageIndex ?? 0}
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
