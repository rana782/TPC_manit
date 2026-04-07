import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { parseLookupRating, parseLookupReviews } from '../utils/parseCompanyLookup';
import { getViteApiBase } from '../utils/apiBase';
import {
    ArrowLeft, Calendar, Users, Plus, Search, ArrowUpDown,
    CheckCircle2, Clock, AlertCircle, X, Award, Sparkles, Shield,
    ChevronRight, ChevronDown, ChevronUp, User, FileText, Lock, Unlock, GraduationCap, UserMinus, Upload
} from 'lucide-react';

interface JobApplication {
    id: string;
    student: {
        id: string;
        firstName: string;
        lastName: string;
        scholarNo: string;
        branch?: string | null;
        isLocked?: boolean;
        lockedReason?: string | null;
    };
    status: string;
    atsScore: number;
    semanticScore?: number;
    skillScore?: number;
    atsExplanation?: string;
    skillsMatched?: string[] | string;
    skillsMissing?: string[] | string;
    suggestions?: string[] | string;
    currentStageIndex?: number;
    currentStageId?: string | null;
    currentStageName?: string | null;
    currentStageOrder?: number | null;
    applicationData: any;
    extraAnswers: any;
}

interface JobStage {
    id: string;
    name: string;
    scheduledDate: string;
    status: string;
    shortlistDocPath?: string | null;
}

/** From API — job-specific timeline; column titles must use `name` only (no default pipeline labels). */
interface TimelineStage {
    id: string;
    name: string;
    order: number;
    scheduledDate?: string;
    status?: string;
    shortlistDocPath?: string | null;
}

interface Job {
    id: string;
    role: string;
    companyName: string;
    status: string;
    applicationDeadline?: string;
    applications: JobApplication[];
    stages: JobStage[];
    /** Ordered stages with explicit order — preferred for applicant columns */
    timelineStages?: TimelineStage[];
    groupedApplicants?: Record<string, JobApplication[]>;
    ctc?: string;
}

function parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v));
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
        return [];
    }
}

function getOrderedTimelineStages(job: Job): TimelineStage[] {
    if (job.timelineStages && job.timelineStages.length > 0) {
        return [...job.timelineStages].sort((a, b) => a.order - b.order);
    }
    const stages = [...(job.stages || [])].sort(
        (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    );
    return stages.map((s, i) => ({
        id: s.id,
        name: s.name,
        order: i + 1,
        scheduledDate: s.scheduledDate,
        status: s.status
    }));
}

/** Which column (0-based) this applicant belongs to — `-1` = not assigned to any timeline stage. */
function columnIndexForApplicant(app: JobApplication, ordered: TimelineStage[]): number {
    const n = ordered.length;
    if (n === 0) return 0;
    if (app.currentStageIndex != null && app.currentStageIndex < 0) return -1;
    if (app.currentStageId && ordered.some((s) => s.id === app.currentStageId)) {
        return ordered.findIndex((s) => s.id === app.currentStageId);
    }
    const idx = app.currentStageIndex ?? 0;
    if (idx < 0) return -1;
    return Math.max(0, Math.min(idx, n - 1));
}

export default function JobDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);
    const [companyProfile, setCompanyProfile] = useState<{
        logoUrl: string | null;
        rating: number | null;
        reviews: number | null;
        highlyRatedFor: string[];
        criticallyRatedFor: string[];
    }>({ logoUrl: null, rating: null, reviews: null, highlyRatedFor: [], criticallyRatedFor: [] });

    useEffect(() => {
        if (user?.role === 'STUDENT') navigate('/job-board', { replace: true });
    }, [user?.role, navigate]);

    if (user?.role === 'STUDENT') return null;

    const [stageName, setStageName] = useState('');
    const [stageDate, setStageDate] = useState('');
    const [stageDateError, setStageDateError] = useState('');
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [searchApplicant, setSearchApplicant] = useState('');
    const [sortField, setSortField] = useState<string>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [bulkActionError, setBulkActionError] = useState('');
    const [bulkActionMsg, setBulkActionMsg] = useState('');
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    const [lockModalOpen, setLockModalOpen] = useState(false);
    const [lockStudentId, setLockStudentId] = useState('');
    const [lockAction, setLockAction] = useState<'lock' | 'unlock'>('lock');
    const [lockActionMsg, setLockActionMsg] = useState('');
    const [lockActionError, setLockActionError] = useState('');
    const [lockData, setLockData] = useState({
        reason: '',
        profileLocked: true
    });

    /** Expanded timeline stage panels (default: all collapsed — stage name only until opened). */
    const [expandedStageIds, setExpandedStageIds] = useState<Record<string, boolean>>({});
    const [rowActionLoading, setRowActionLoading] = useState<string | null>(null);
    const [stageUploadLoading, setStageUploadLoading] = useState<string | null>(null);
    const [shortlistMapLoading, setShortlistMapLoading] = useState<string | null>(null);
    const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

    const apiBase = getViteApiBase();
    const token = localStorage.getItem('token');

    const fetchJob = async () => {
        try {
            const res = await axios.get(`${apiBase}/jobs/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setJob(res.data.job);

            const companyName = res.data?.job?.companyName;
            if (companyName) {
                try {
                    const logoRes = await axios.get(`${apiBase}/companies/lookup`, {
                        params: { name: companyName },
                        headers: { Authorization: `Bearer ${token}` },
                        timeout: 4000
                    });
                    setCompanyProfile({
                        logoUrl: typeof logoRes.data?.logoUrl === 'string' ? logoRes.data.logoUrl : null,
                        rating: parseLookupRating(logoRes.data?.rating),
                        reviews: parseLookupReviews(logoRes.data?.reviews),
                        highlyRatedFor: Array.isArray(logoRes.data?.highlyRatedFor) ? logoRes.data.highlyRatedFor.map(String) : [],
                        criticallyRatedFor: Array.isArray(logoRes.data?.criticallyRatedFor) ? logoRes.data.criticallyRatedFor.map(String) : []
                    });
                } catch {
                    setCompanyProfile({ logoUrl: null, rating: null, reviews: null, highlyRatedFor: [], criticallyRatedFor: [] });
                }
            } else {
                setCompanyProfile({ logoUrl: null, rating: null, reviews: null, highlyRatedFor: [], criticallyRatedFor: [] });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJob();
    }, [id]);

    const addStage = async (e: React.FormEvent) => {
        e.preventDefault();
        setStageDateError('');
        if (!job) return;
        const deadline = job.applicationDeadline ? new Date(job.applicationDeadline) : null;
        const newStageDate = new Date(stageDate);
        if (deadline) {
            deadline.setHours(0, 0, 0, 0);
            newStageDate.setHours(0, 0, 0, 0);
            if (newStageDate <= deadline) {
                setStageDateError('Timeline stages must occur sequentially and after application deadline');
                return;
            }
        }
        const existingStages = (job.stages || []).slice().sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
        if (existingStages.length > 0) {
            const lastDate = new Date(existingStages[existingStages.length - 1].scheduledDate);
            lastDate.setHours(0, 0, 0, 0);
            newStageDate.setHours(0, 0, 0, 0);
            if (newStageDate <= lastDate) {
                setStageDateError('Timeline stages must occur sequentially and after application deadline');
                return;
            }
        }
        try {
            await axios.patch(`${apiBase}/jobs/${id}/stage`, {
                name: stageName,
                scheduledDate: stageDate
            }, { headers: { Authorization: `Bearer ${token}` } });
            setStageName('');
            setStageDate('');
            setStageDateError('');
            fetchJob();
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Failed to add stage';
            setStageDateError(msg.includes('Timeline') ? msg : 'Failed to add stage');
        }
    };

    const moveToNextStage = async (nextStageIndex: number) => {
        if (bulkActionLoading) return;
        setBulkActionError('');
        setBulkActionMsg('');

        try {
            setBulkActionLoading(true);
            await axios.patch(`${apiBase}/jobs/${id}/advance-stage`, {
                selectedIds: selectedStudents,
                nextStageIndex
            }, { headers: { Authorization: `Bearer ${token}` } });
            setBulkActionMsg('Selected students moved to next stage.');
            fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Failed to move students to next stage');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const toggleStagePanel = (stageId: string) => {
        setExpandedStageIds((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
    };

    const moveOneStudent = async (studentId: string, direction: 'next' | 'prev') => {
        if (!job || !id || bulkActionLoading || rowActionLoading) return;
        const app = job.applications?.find((a) => a.student.id === studentId);
        if (!app) return;
        const tl = getOrderedTimelineStages(job);
        const idx = columnIndexForApplicant(app, tl);
        setRowActionLoading(studentId);
        setBulkActionError('');
        try {
            if (direction === 'next') {
                await axios.patch(
                    `${apiBase}/jobs/${id}/advance-stage`,
                    { selectedIds: [studentId], nextStageIndex: idx + 1 },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            } else {
                await axios.patch(
                    `${apiBase}/jobs/${id}/regress-stage`,
                    { selectedIds: [studentId], prevStageIndex: idx - 1 },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }
            await fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Stage update failed');
        } finally {
            setRowActionLoading(null);
        }
    };

    const unplaceOneStudent = async (studentId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!token || rowActionLoading || bulkActionLoading) return;
        if (
            !window.confirm(
                'Mark this student as unplaced? This clears placement records, unlocks their profile, and reverts placed applications to reviewing.'
            )
        )
            return;
        setRowActionLoading(studentId);
        setBulkActionError('');
        try {
            await axios.put(`${apiBase}/profile-lock/${studentId}/unplace`, {}, { headers: { Authorization: `Bearer ${token}` } });
            await fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Failed to unplace student');
        } finally {
            setRowActionLoading(null);
        }
    };

    const dropOneStudent = async (studentId: string) => {
        if (!id || rowActionLoading) return;
        if (!window.confirm('Remove this student from the timeline stages? They will remain in the applicants list.')) return;
        setRowActionLoading(studentId);
        setBulkActionError('');
        try {
            await axios.patch(
                `${apiBase}/jobs/${id}/drop-applicants`,
                { studentIds: [studentId] },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Failed to drop applicant');
        } finally {
            setRowActionLoading(null);
        }
    };

    const uploadStageShortlistDoc = async (stageId: string, file: File | null) => {
        if (!id || !file || !token) return;
        setBulkActionError('');
        setStageUploadLoading(stageId);
        try {
            const form = new FormData();
            form.append('shortlistDoc', file);
            await axios.patch(`${apiBase}/jobs/${id}/stages/${stageId}/shortlist-doc`, form, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            await fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Failed to upload shortlist document');
        } finally {
            setStageUploadLoading(null);
        }
    };

    const uploadStageShortlistAndMap = async (stageId: string, file: File | null) => {
        if (!id || !file || !token) return;
        setBulkActionError('');
        setShortlistMapLoading(stageId);
        try {
            const form = new FormData();
            form.append('shortlistFile', file);
            const res = await axios.post(`${apiBase}/jobs/${id}/stages/${stageId}/upload-shortlist`, form, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            setBulkActionMsg(
                `Shortlist processed. ${res.data?.movedCount || 0} student(s) mapped to selected stage.`
            );
            setSelectedStageId(stageId);
            await fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Failed to process shortlist file');
        } finally {
            setShortlistMapLoading(null);
        }
    };

    const declareResults = async () => {
        if (!window.confirm(`Declare placed for ${selectedStudents.length} selected student(s)?`)) return;
        if (bulkActionLoading) return;
        setBulkActionError('');
        setBulkActionMsg('');

        try {
            setBulkActionLoading(true);
            await axios.post(`${apiBase}/jobs/${id}/results`, {
                placedStudentIds: selectedStudents
            }, { headers: { Authorization: `Bearer ${token}` } });
            setBulkActionMsg('Selected students declared as placed.');
            fetchJob();
        } catch (err: any) {
            setBulkActionError(err.response?.data?.message || 'Failed to declare placed');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const toggleStudent = (studentId: string) => {
        setSelectedStudents(prev =>
            prev.includes(studentId) ? prev.filter(sid => sid !== studentId) : [...prev, studentId]
        );
    };

    const selectAll = () => {
        if (!job) return;
        const appsToSelect = selectedStageId
            ? job.applications.filter((a) => a.currentStageId === selectedStageId)
            : job.applications;
        const allIds = appsToSelect.map((a) => a.student.id);
        setSelectedStudents(prev => prev.length === allIds.length ? [] : allIds);
    };

    const openLockModal = (studentId: string, isLocked: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        setLockStudentId(studentId);
        setLockAction(isLocked ? 'unlock' : 'lock');
        setLockActionMsg('');
        setLockActionError('');
        setLockData({
            reason: '',
            profileLocked: true
        });
        setLockModalOpen(true);
    };

    const submitLock = async (e: React.FormEvent) => {
        e.preventDefault();
        setLockActionMsg('');
        setLockActionError('');
        try {
            if (lockAction === 'lock') {
                await axios.post(`${apiBase}/profile-lock/${lockStudentId}/lock`, {
                    profileLocked: true,
                    reason: lockData.reason || undefined
                }, { headers: { Authorization: `Bearer ${token}` } });
                setLockActionMsg('Student profile locked successfully.');
            } else {
                await axios.post(`${apiBase}/profile-lock/${lockStudentId}/unlock`, {
                    reason: lockData.reason || undefined
                }, { headers: { Authorization: `Bearer ${token}` } });
                setLockActionMsg('Student profile unlocked successfully.');
            }
            setLockModalOpen(false);
            fetchJob();
        } catch (err: any) {
            setLockActionError(err.response?.data?.message || `Failed to ${lockAction} profile`);
        }
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    // ATS score color helper
    const atsColor = (score: number) => {
        if (score >= 70) return { text: 'text-emerald-700', bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', border: 'border-emerald-200', label: 'Strong' };
        if (score >= 40) return { text: 'text-amber-700', bg: 'bg-amber-500', bgLight: 'bg-amber-50', border: 'border-amber-200', label: 'Good' };
        return { text: 'text-red-700', bg: 'bg-red-500', bgLight: 'bg-red-50', border: 'border-red-200', label: 'Weak' };
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            REJECTED: 'bg-red-50 text-red-700 border-red-200',
            PENDING: 'bg-gray-50 text-gray-600 border-gray-200',
            APPLIED: 'bg-blue-50 text-blue-700 border-blue-200',
            PLACED: 'bg-violet-50 text-violet-800 border-violet-200',
        };
        return map[status] || 'bg-gray-50 text-gray-600 border-gray-200';
    };

    const isPlacedStatus = (status: string) => String(status || '').toUpperCase() === 'PLACED';

    if (loading) return (
        <div className="p-8 flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
        </div>
    );
    if (!job) return (
        <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-bold">Job not found</p>
        </div>
    );

    // Filtered + sorted applicants
    const sortedApps = [...(job.applications || [])]
        .filter(app => {
            if (!searchApplicant) return true;
            const q = searchApplicant.toLowerCase();
            const name = `${app.student.firstName} ${app.student.lastName}`.toLowerCase();
            const branch = (app.student.branch || '').toLowerCase();
            return name.includes(q) || app.student.scholarNo?.toLowerCase().includes(q) || branch.includes(q);
        })
        .sort((a, b) => {
            let cmp = 0;
            if (sortField === 'name') cmp = `${a.student.firstName}`.localeCompare(`${b.student.firstName}`);
            return sortDir === 'asc' ? cmp : -cmp;
        });
    const filteredApps = selectedStageId
        ? sortedApps.filter((app) => app.currentStageId === selectedStageId)
        : sortedApps;

    const orderedTimeline = getOrderedTimelineStages(job);
    const selectedStageObj = selectedStageId ? orderedTimeline.find((s) => s.id === selectedStageId) : null;
    const hasPipelineStages = orderedTimeline.length > 0;
    const sortedStagesForSidebar = [...(job.stages || [])].sort(
        (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    );

    const selectedApps = (job.applications || []).filter((app) => selectedStudents.includes(app.student.id));
    const selectedStageSet = new Set(selectedApps.map((app) => columnIndexForApplicant(app, orderedTimeline)));
    const hasMixedStageSelection = selectedStudents.length > 0 && selectedStageSet.size > 1;
    const selectedStageIndex = selectedApps.length > 0 ? columnIndexForApplicant(selectedApps[0], orderedTimeline) : -1;
    const totalStages = orderedTimeline.length;
    const finalStageIndex = totalStages > 0 ? totalStages - 1 : -1;
    const canMoveToNextStage =
        hasPipelineStages &&
        selectedStudents.length > 0 &&
        !hasMixedStageSelection &&
        selectedStageIndex >= -1 &&
        selectedStageIndex < finalStageIndex;
    const anySelectedAlreadyPlaced = selectedApps.some((a) => isPlacedStatus(a.status));
    const canDeclarePlaced =
        hasPipelineStages &&
        selectedStudents.length > 0 &&
        !hasMixedStageSelection &&
        selectedStageIndex === finalStageIndex &&
        finalStageIndex >= 0 &&
        !anySelectedAlreadyPlaced;
    const nextStageName = canMoveToNextStage ? orderedTimeline[selectedStageIndex + 1]?.name : '';

    /** Stages that have at least one applicant assigned (others are hidden). */
    const timelineStagesWithStudents = orderedTimeline
        .map((stage, colIdx) => ({ stage, colIdx }))
        .filter(({ colIdx }) =>
            sortedApps.some((a) => columnIndexForApplicant(a, orderedTimeline) === colIdx)
        );

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-full" data-testid="job-details-page">
            {/* Back + Header */}
            <button onClick={() => navigate('/jobs-management')} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-primary-600 mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Jobs
            </button>

            <div className="flex flex-col lg:flex-row lg:items-start gap-6 mb-8">
                {/* Job Info Header */}
                <div className="flex-1">
                    <div className="flex items-start gap-4 mb-3">
                        <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0 self-start">
                            <img
                                src={companyProfile.logoUrl || '/default-logo.png'}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-logo.png'; }}
                                alt={`${job?.companyName || 'Company'} logo`}
                                className="w-9 h-9 object-contain"
                            />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{job.companyName}</h1>
                            <p className="text-base text-gray-500 font-medium">{job.role}</p>
                            <div className="mt-2 text-sm text-gray-600">
                                {typeof companyProfile.rating === 'number' ? (
                                    <span className="font-semibold">⭐ {companyProfile.rating.toFixed(1)} / 5</span>
                                ) : (
                                    <span className="text-gray-400">Rating not available</span>
                                )}
                                <span className="mx-2 text-gray-300">|</span>
                                {typeof companyProfile.reviews === 'number' ? (
                                    <span>{companyProfile.reviews.toLocaleString()} reviews</span>
                                ) : (
                                    <span className="text-gray-400">Reviews not available</span>
                                )}
                            </div>
                            {(companyProfile.highlyRatedFor.length > 0 || companyProfile.criticallyRatedFor.length > 0) && (
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="font-bold text-emerald-700">Highly Rated:</p>
                                        <ul className="list-disc list-inside text-gray-600">
                                            {companyProfile.highlyRatedFor.slice(0, 5).map((t) => (
                                                <li key={`h-${t}`}>{t}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <p className="font-bold text-red-600">Critically Rated:</p>
                                        <ul className="list-disc list-inside text-gray-600">
                                            {companyProfile.criticallyRatedFor.slice(0, 5).map((t) => (
                                                <li key={`c-${t}`}>{t}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusBadge(job.status)}`}>{job.status}</span>
                        {job.ctc && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">₹ {job.ctc} LPA</span>}
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                            <Users className="w-3 h-3" /> {job.applications?.length || 0} applicants
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* === LEFT: Applicants (2/3 width) === */}
                <div className="xl:col-span-2 space-y-6">

                    {/* Applicant Section Header */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm" data-testid="applicant-section">
                        <div className="p-5 border-b border-gray-100">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <Users className="w-5 h-5 text-gray-400" /> Applicants
                                        <span className="text-sm font-medium text-gray-400 ml-1">({filteredApps.length})</span>
                                    </h2>
                                    {selectedStageObj && (
                                        <div className="mt-2 flex items-center gap-3">
                                            <span className="text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 px-2 py-1 rounded-lg">
                                                Stage: {selectedStageObj.name}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedStageId(null)}
                                                className="text-xs font-bold text-gray-600 hover:text-gray-900 underline"
                                            >
                                                Back to all applicants
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Search applicants..."
                                            value={searchApplicant}
                                            onChange={e => setSearchApplicant(e.target.value)}
                                            className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-48 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Bulk actions bar */}
                            {selectedStudents.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                    className="mt-4 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-bold text-primary-700">{selectedStudents.length} student(s) selected</span>
                                        {canMoveToNextStage && (
                                            <button
                                                onClick={() => moveToNextStage(selectedStageIndex + 1)}
                                                disabled={bulkActionLoading}
                                                className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all transform active:scale-95"
                                            >
                                                <ChevronRight className="w-4 h-4" /> Move to Next Stage ({nextStageName})
                                            </button>
                                        )}
                                        {canDeclarePlaced && (
                                            <button
                                                onClick={declareResults}
                                                disabled={bulkActionLoading}
                                                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all transform active:scale-95"
                                            >
                                                <Award className="w-4 h-4" /> Declare Placed
                                            </button>
                                        )}
                                    </div>
                                    {hasMixedStageSelection && (
                                        <p className="text-xs font-semibold text-amber-700">Selected students are in mixed stages. Select students from the same stage to continue.</p>
                                    )}
                                    {!hasMixedStageSelection && selectedStudents.length > 0 && !canMoveToNextStage && !canDeclarePlaced && (
                                        <p className="text-xs font-semibold text-gray-600">No valid progression action available for this selection.</p>
                                    )}
                                    {bulkActionError && <p className="text-xs font-semibold text-red-700">{bulkActionError}</p>}
                                    {bulkActionMsg && <p className="text-xs font-semibold text-emerald-700">{bulkActionMsg}</p>}
                                </motion.div>
                            )}
                        </div>

                        {/* All applicants table first; below — collapsible timeline stages (when job has stages) */}
                        {!hasPipelineStages && filteredApps.length === 0 ? (
                            <div className="p-10 text-center">
                                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 font-bold">No applicants yet</p>
                                <p className="text-xs text-gray-400 mt-1">Applicants will appear here once students apply.</p>
                            </div>
                        ) : (
                            <>
                            <div className="px-2 pt-2 pb-1">
                                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide px-2 mb-2">All applicants</p>
                                {filteredApps.length === 0 ? (
                                    <p className="text-sm text-gray-500 px-4 py-8 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                        {selectedStageObj
                                            ? `No shortlisted students found in ${selectedStageObj.name}.`
                                            : `No applicants yet${hasPipelineStages ? ' — expand a stage below when students apply.' : '.'}`}
                                    </p>
                                ) : (
                            <div className="overflow-x-auto" data-testid="applicant-table">
                                <table className="min-w-full divide-y divide-gray-50">
                                    <thead>
                                        <tr className="bg-gray-50/80">
                                            <th className="px-4 py-3 text-left w-12">
                                                <input type="checkbox" onChange={selectAll} checked={selectedStudents.length === filteredApps.length && filteredApps.length > 0}
                                                    className="h-4 w-4 text-primary-600 rounded border-gray-300" />
                                            </th>
                                            {[
                                                { key: 'name', label: 'Student' },
                                            ].map(col => (
                                                <th key={col.key} onClick={() => handleSort(col.key)}
                                                    className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none">
                                                    <span className="inline-flex items-center gap-1">
                                                        {col.label}
                                                        <ArrowUpDown className={clsx('w-3 h-3', sortField === col.key ? 'text-primary-600' : 'text-gray-300')} />
                                                    </span>
                                                </th>
                                            ))}
                                            {hasPipelineStages && (
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Timeline stage</th>
                                            )}
                                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredApps.map((app) => {
                                            return (
                                                <tr key={app.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => toggleStudent(app.student.id)} data-testid="applicant-row">
                                                    <td className="px-4 py-3.5">
                                                        <input type="checkbox" checked={selectedStudents.includes(app.student.id)} onChange={() => toggleStudent(app.student.id)} onClick={e => e.stopPropagation()}
                                                            className="h-4 w-4 text-primary-600 rounded border-gray-300" />
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                                                                <User className="w-4 h-4 text-primary-600" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-900">
                                                                    {app.student.firstName} {app.student.lastName}
                                                                    {app.student.branch?.trim() ? (
                                                                        <span className="font-semibold text-gray-600"> · {app.student.branch.trim()}</span>
                                                                    ) : null}
                                                                </p>
                                                                <p className="text-xs text-gray-500">{app.student.scholarNo}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {hasPipelineStages && (
                                                        <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">
                                                            {columnIndexForApplicant(app, orderedTimeline) < 0
                                                                ? 'Not assigned'
                                                                : (app.currentStageName || '—')}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3.5 text-right">
                                                        {isPlacedStatus(app.status) ? (
                                                            <div className="inline-flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    type="button"
                                                                    disabled={rowActionLoading === app.student.id}
                                                                    onClick={(e) => unplaceOneStudent(app.student.id, e)}
                                                                    className="inline-flex items-center gap-1 text-xs font-bold border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                                                                >
                                                                    <Unlock className="w-3 h-3" /> Unplace
                                                                </button>
                                                                <button onClick={(e) => openLockModal(app.student.id, !!app.student.isLocked, e)}
                                                                    className={clsx(
                                                                        "inline-flex items-center gap-1 text-xs font-bold border px-3 py-1.5 rounded-lg transition-colors",
                                                                        app.student.isLocked
                                                                            ? "text-emerald-700 hover:text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                                                                            : "text-red-600 hover:text-red-800 border-red-200 bg-red-50 hover:bg-red-100"
                                                                    )}>
                                                                    <Lock className="w-3 h-3" /> {app.student.isLocked ? 'Unlock Profile' : 'Lock Profile'}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                                )}
                            </div>

                            {hasPipelineStages && !selectedStageObj && (
                                <div className="border-t border-gray-100 px-2 pb-4 pt-4 mt-2" data-testid="applicants-kanban">
                                    <h3 className="text-sm font-bold text-gray-900 mb-1 px-2">By timeline stage</h3>
                                    <p className="text-xs text-gray-500 mb-3 px-2">
                                        Only stages with students are listed. Use ↑ / ↓ to move between stages. Drop removes the student from that timeline stage only — they remain in All applicants above (not rejected).
                                    </p>
                                    {timelineStagesWithStudents.length === 0 ? (
                                        <p className="text-sm text-gray-500 px-2 py-4 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                            No students are assigned to a timeline stage yet.
                                        </p>
                                    ) : (
                                    <div className="space-y-2">
                                        {timelineStagesWithStudents.map(({ stage, colIdx }) => {
                                            const inColumn = sortedApps.filter(
                                                (a) => columnIndexForApplicant(a, orderedTimeline) === colIdx
                                            );
                                            const open = !!expandedStageIds[stage.id];
                                            return (
                                                <div
                                                    key={stage.id}
                                                    className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
                                                    data-testid={`stage-column-${stage.id}`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleStagePanel(stage.id)}
                                                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                                                    >
                                                        <span className="font-bold text-gray-900" data-testid="timeline-stage-title">
                                                            {stage.name}
                                                        </span>
                                                        <span className="text-xs text-gray-500 tabular-nums">{inColumn.length} student{inColumn.length !== 1 ? 's' : ''}</span>
                                                        <ChevronDown className={clsx('w-5 h-5 text-gray-400 shrink-0 transition-transform', open && 'rotate-180')} />
                                                    </button>
                                                    {open && (
                                                        <div className="border-t border-gray-100 bg-gray-50/60 p-3 space-y-2">
                                                            {inColumn.map((app) => {
                                                                    const idx = columnIndexForApplicant(app, orderedTimeline);
                                                                    const busy = rowActionLoading === app.student.id;
                                                                    const placed = isPlacedStatus(app.status);
                                                                    return (
                                                                        <div
                                                                            key={app.id}
                                                                            className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
                                                                            data-testid="applicant-row"
                                                                        >
                                                                            <div className="flex items-center gap-0.5 border-r border-gray-100 pr-2 mr-1">
                                                                                <button
                                                                                    type="button"
                                                                                    title={idx <= 0 ? 'Unassign from timeline stages' : 'Move to previous stage'}
                                                                                    disabled={busy || placed || idx < 0}
                                                                                    onClick={() => moveOneStudent(app.student.id, 'prev')}
                                                                                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                                >
                                                                                    <ChevronUp className="w-5 h-5" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    title="Move to next stage"
                                                                                    disabled={busy || placed || idx >= finalStageIndex}
                                                                                    onClick={() => moveOneStudent(app.student.id, 'next')}
                                                                                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                                >
                                                                                    <ChevronDown className="w-5 h-5" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    title="Unassign from timeline stages"
                                                                                    disabled={busy || placed}
                                                                                    onClick={() => dropOneStudent(app.student.id)}
                                                                                    className="p-1.5 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                                >
                                                                                    <UserMinus className="w-5 h-5" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex-1 min-w-[140px]">
                                                                                <p className="text-sm font-bold text-gray-900">
                                                                                    {app.student.firstName} {app.student.lastName}
                                                                                </p>
                                                                                <p className="text-xs text-gray-500">{app.student.scholarNo}</p>
                                                                            </div>
                                                                            {placed && (
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={busy}
                                                                                        onClick={(e) => unplaceOneStudent(app.student.id, e)}
                                                                                        className="inline-flex items-center gap-1 text-xs font-bold border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1 rounded-lg hover:bg-amber-100 disabled:opacity-60"
                                                                                    >
                                                                                        <Unlock className="w-3 h-3" /> Unplace
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => openLockModal(app.student.id, !!app.student.isLocked, e)}
                                                                                        className={clsx(
                                                                                            'inline-flex items-center gap-1 text-xs font-bold border px-2 py-1 rounded-lg',
                                                                                            app.student.isLocked
                                                                                                ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                                                                                                : 'text-red-600 border-red-200 bg-red-50'
                                                                                        )}
                                                                                    >
                                                                                        <Lock className="w-3 h-3" /> {app.student.isLocked ? 'Unlock' : 'Lock'}
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    )}
                                </div>
                            )}

                            {!hasPipelineStages && filteredApps.length > 0 && (
                                <p className="text-xs text-amber-800 bg-amber-50/80 px-4 py-2 border-t border-amber-100 mx-2 mb-2 rounded-lg">
                                    Add timeline stages (right panel) to enable stage-by-stage pipeline tools below.
                                </p>
                            )}
                            </>
                        )}
                    </div>

                    {/* Candidate cards only when no timeline columns (ATS detail view) */}
                    {filteredApps.length > 0 && !hasPipelineStages && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Candidate Cards</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="candidate-cards">
                                {filteredApps.slice(0, 6).map((app, idx) => {
                                    const score = app.atsScore || 0;
                                    const ac = atsColor(score);
                                    const matchedSkills = parseJsonArray(app.skillsMatched);
                                    const missingSkills = parseJsonArray(app.skillsMissing);
                                    const suggestions = parseJsonArray(app.suggestions);
                                    return (
                                        <motion.div
                                            key={app.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: idx * 0.04 }}
                                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all"
                                            data-testid="candidate-card"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-50 to-primary-100 border-2 border-primary-200 flex items-center justify-center">
                                                        <GraduationCap className="w-5 h-5 text-primary-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-bold text-gray-900">{app.student.firstName} {app.student.lastName}</p>
                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                            <FileText className="w-3 h-3" /> {app.student.scholarNo}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${statusBadge(app.status)}`}>
                                                    {app.status}
                                                </span>
                                            </div>

                                            {/* ATS Score meter */}
                                            <div className={`rounded-xl p-4 ${ac.bgLight} border ${ac.border}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold text-gray-600 flex items-center gap-1">
                                                        <Sparkles className="w-3.5 h-3.5 text-gray-400" /> ATS Match
                                                    </span>
                                                    <span className={`text-lg font-black ${ac.text}`}>
                                                        {score > 0 ? score : 'N/A'}
                                                        {score > 0 && <span className="text-xs font-bold text-gray-400">/100</span>}
                                                    </span>
                                                </div>
                                                {score > 0 && (
                                                    <div className="w-full h-2.5 bg-white/80 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${ac.bg} transition-all duration-700`} style={{ width: `${score}%` }} />
                                                    </div>
                                                )}
                                                {score > 0 && (
                                                    <p className={`text-xs font-bold ${ac.text} mt-1.5`}>{ac.label} match</p>
                                                )}
                                                {app.atsExplanation && (
                                                    <p className="text-xs text-gray-600 mt-2">{app.atsExplanation}</p>
                                                )}
                                                {(matchedSkills.length > 0 || missingSkills.length > 0) && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {matchedSkills.slice(0, 5).map((skill, si) => (
                                                                <span key={`m-${si}`} className="px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 border border-emerald-100 text-emerald-700">{skill}</span>
                                                            ))}
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {missingSkills.slice(0, 5).map((skill, si) => (
                                                                <span key={`x-${si}`} className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 border border-red-100 text-red-700">{skill}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {suggestions.length > 0 && (
                                                    <div className="mt-3 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
                                                        <p className="text-[11px] font-bold text-indigo-700 mb-1">Suggestions</p>
                                                        <ul className="space-y-1">
                                                            {suggestions.slice(0, 3).map((tip, ti) => (
                                                                <li key={`s-${ti}`} className="text-[11px] text-indigo-900">- {tip}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                                                <button onClick={() => toggleStudent(app.student.id)}
                                                    className={clsx('text-xs font-bold px-3 py-1.5 rounded-lg transition-all',
                                                        selectedStudents.includes(app.student.id) ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                                                    {selectedStudents.includes(app.student.id) ? '✓ Selected' : 'Select'}
                                                </button>
                                                {isPlacedStatus(app.status) ? (
                                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={rowActionLoading === app.student.id}
                                                            onClick={(e) => unplaceOneStudent(app.student.id, e)}
                                                            className="text-xs font-bold border border-amber-200 bg-amber-50 text-amber-900 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 hover:bg-amber-100 disabled:opacity-60"
                                                        >
                                                            <Unlock className="w-3 h-3" /> Unplace
                                                        </button>
                                                        <button onClick={(e) => openLockModal(app.student.id, !!app.student.isLocked, e)}
                                                            className={clsx(
                                                                "text-xs font-bold border px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1",
                                                                app.student.isLocked
                                                                    ? "text-emerald-700 hover:text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                                                                    : "text-red-600 hover:text-red-800 border-red-200 bg-red-50 hover:bg-red-100"
                                                            )}>
                                                            <Lock className="w-3 h-3" /> {app.student.isLocked ? 'Unlock Profile' : 'Lock Profile'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* === RIGHT PANEL: Timeline + Results === */}
                <div className="space-y-6">

                    {/* Stage Timeline */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-5">
                            <Calendar className="w-5 h-5 text-gray-400" /> Job Timeline
                        </h2>

                        {sortedStagesForSidebar && sortedStagesForSidebar.length > 0 ? (
                            <div className="space-y-0 mb-6">
                                {sortedStagesForSidebar.map((stage, idx) => {
                                    const isCompleted = stage.status === 'COMPLETED';
                                    const isInProgress = stage.status === 'IN_PROGRESS';
                                    const isLast = idx === sortedStagesForSidebar.length - 1;
                                    return (
                                        <div key={stage.id} className="relative flex gap-3.5" data-testid="stage-item">
                                            {/* Vertical line */}
                                            {!isLast && (
                                                <div className={clsx('absolute left-[11px] top-7 w-0.5 bottom-0',
                                                    isCompleted ? 'bg-emerald-200' : 'bg-gray-200')} />
                                            )}
                                            {/* Dot */}
                                            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 mt-0.5',
                                                isCompleted ? 'bg-emerald-500 border-emerald-600 text-white' :
                                                isInProgress ? 'bg-primary-500 border-primary-600 text-white animate-pulse' :
                                                'bg-white border-gray-300'
                                            )}>
                                                {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                                                 isInProgress ? <Clock className="w-3.5 h-3.5" /> :
                                                 <div className="w-2 h-2 bg-gray-300 rounded-full" />}
                                            </div>
                                            {/* Content */}
                                            <button
                                                type="button"
                                                onClick={() => setSelectedStageId(stage.id)}
                                                className={clsx(
                                                    "pb-6 flex-1 min-w-0 text-left rounded-md px-1 -mx-1",
                                                    selectedStageId === stage.id && "bg-primary-50/70 border border-primary-100"
                                                )}
                                            >
                                                <p className={clsx('text-sm font-bold', isCompleted ? 'text-gray-900' : 'text-gray-600')}>{stage.name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {isCompleted ? 'Completed' : isInProgress ? 'In Progress' :
                                                    new Date(stage.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <label className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 cursor-pointer hover:bg-primary-100">
                                                        <Upload className="w-3 h-3" />
                                                        {stageUploadLoading === stage.id ? 'Uploading...' : 'Upload shortlist'}
                                                        <input
                                                            type="file"
                                                            accept="application/pdf,image/*"
                                                            className="hidden"
                                                            disabled={stageUploadLoading === stage.id}
                                                            onChange={(e) => {
                                                                const f = e.target.files?.[0] || null;
                                                                uploadStageShortlistDoc(stage.id, f);
                                                                e.currentTarget.value = '';
                                                            }}
                                                        />
                                                    </label>
                                                    <label className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100">
                                                        <Upload className="w-3 h-3" />
                                                        {shortlistMapLoading === stage.id ? 'Mapping...' : 'Upload shortlist CSV'}
                                                        <input
                                                            type="file"
                                                            accept=".csv,.txt,text/csv,text/plain"
                                                            className="hidden"
                                                            disabled={shortlistMapLoading === stage.id}
                                                            onChange={(e) => {
                                                                const f = e.target.files?.[0] || null;
                                                                uploadStageShortlistAndMap(stage.id, f);
                                                                e.currentTarget.value = '';
                                                            }}
                                                        />
                                                    </label>
                                                    {stage.shortlistDocPath && (
                                                        <a
                                                            href={stage.shortlistDocPath}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-[11px] font-bold text-primary-700 hover:underline"
                                                        >
                                                            View shortlist file
                                                        </a>
                                                    )}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 mb-5">No stages added yet.</p>
                        )}

                        {/* Add Stage Form */}
                        <form onSubmit={addStage} className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Add New Stage</p>
                            <div>
                                <input type="text" required value={stageName} onChange={e => setStageName(e.target.value)} placeholder="e.g. Technical Interview"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 focus:outline-none" />
                            </div>
                            <div>
                                <input type="date" required value={stageDate} onChange={e => { setStageDate(e.target.value); setStageDateError(''); }}
                                    className={clsx('w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500/10 focus:outline-none', stageDateError ? 'border-red-500' : 'border-gray-200 focus:border-primary-500')} />
                                {stageDateError && <p className="text-red-500 text-sm mt-1">{stageDateError}</p>}
                            </div>
                            <button type="submit" className="w-full inline-flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all transform active:scale-95">
                                <Plus className="w-4 h-4" /> Add Stage
                            </button>
                        </form>
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Quick Stats</h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Total Applicants', value: job.applications?.length || 0, icon: Users, color: 'text-primary-600' },
                                { label: 'Accepted', value: job.applications?.filter(a => a.status === 'ACCEPTED').length || 0, icon: CheckCircle2, color: 'text-emerald-600' },
                                { label: 'Avg ATS Score', value: job.applications?.length ? Math.round(job.applications.reduce((s, a) => s + (a.atsScore || 0), 0) / job.applications.length) : 0, icon: Sparkles, color: 'text-violet-600' },
                                { label: 'Stages', value: job.stages?.length || 0, icon: Calendar, color: 'text-amber-600' },
                            ].map(stat => (
                                <div key={stat.label} className="flex items-center justify-between py-2">
                                    <span className="text-sm text-gray-600 flex items-center gap-2">
                                        <stat.icon className={`w-4 h-4 ${stat.color}`} /> {stat.label}
                                    </span>
                                    <span className="text-sm font-bold text-gray-900">{stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* === LOCK MODAL === */}
            <AnimatePresence>
                {lockModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-red-600" /> {lockAction === 'lock' ? 'Lock Profile' : 'Unlock Profile'}
                                </h3>
                                <button onClick={() => setLockModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={submitLock} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Reason (Optional)</label>
                                    <textarea value={lockData.reason} onChange={e => setLockData({ ...lockData, reason: e.target.value })}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm h-20 focus:border-primary-500 focus:outline-none"
                                        placeholder={lockAction === 'lock' ? 'e.g. Policy violation / manual lock' : 'e.g. Manual unlock approved'}></textarea>
                                </div>

                                {lockActionError && (
                                    <p className="text-sm text-red-600 font-semibold">{lockActionError}</p>
                                )}
                                {lockActionMsg && (
                                    <p className="text-sm text-emerald-700 font-semibold">{lockActionMsg}</p>
                                )}

                                <div className="flex justify-end gap-3 pt-2">
                                    <button type="button" onClick={() => setLockModalOpen(false)} className="px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                                    <button type="submit" className={clsx(
                                        "px-5 py-2.5 text-white rounded-xl font-bold text-sm shadow-md transition-all transform active:scale-95",
                                        lockAction === 'lock' ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                                    )}>
                                        {lockAction === 'lock' ? 'Lock Profile' : 'Unlock Profile'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
