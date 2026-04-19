import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    User, GraduationCap, Link2, FileUp, Check, ChevronLeft,
    ArrowRight, AlertCircle, CheckCircle2, Lock, Trash2, Plus,
    Upload, MapPin, X, FileText, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader, { LayoutContainer } from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import { getViteApiBase, getViteApiOrigin } from '../utils/apiBase';

/** Public URL for uploaded assets (photo, documents). */
function assetPublicUrl(path: string): string {
    if (!path) return '';
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const origin = getViteApiOrigin().replace(/\/$/, '');
    return origin ? `${origin}${normalized}` : normalized;
}

const BRANCH_OPTIONS = ['', 'CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'];
const COURSE_OPTIONS = ['', 'BTech', 'MTech', 'MCA', 'Dual Degree'];

const STEPS = [
    { label: 'Personal', icon: User },
    { label: 'Academic', icon: GraduationCap },
    { label: 'Links & Experience', icon: Link2 },
    { label: 'Documents', icon: FileUp },
];

const inputBaseClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

function FormField({
    label,
    name,
    type = 'text',
    value,
    onChange,
    onBlur,
    placeholder,
    maxLength,
    error,
    hint,
}: {
    label: string;
    name: string;
    type?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
    placeholder?: string;
    maxLength?: number;
    error?: string;
    hint?: string;
}) {
    const errId = `profile-${name}-err`;
    const hintId = `profile-${name}-hint`;
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor={`profile-${name}`}>
                {label}
            </label>
            {hint && (
                <p id={hintId} className="text-xs text-slate-500">
                    {hint}
                </p>
            )}
            <input
                id={`profile-${name}`}
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                placeholder={placeholder}
                maxLength={maxLength}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? errId : hint ? hintId : undefined}
                className={clsx(inputBaseClass, error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20')}
            />
            {error && (
                <p id={errId} className="text-sm font-medium text-red-600" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

function SelectField({
    label,
    name,
    value,
    onChange,
    onBlur,
    options,
    error,
    hint,
}: {
    label: string;
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLSelectElement>) => void;
    options: string[];
    error?: string;
    hint?: string;
}) {
    const errId = `profile-${name}-err`;
    const hintId = `profile-${name}-hint`;
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor={`profile-${name}`}>
                {label}
            </label>
            {hint && (
                <p id={hintId} className="text-xs text-slate-500">
                    {hint}
                </p>
            )}
            <select
                id={`profile-${name}`}
                name={name}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? errId : hint ? hintId : undefined}
                className={clsx(inputBaseClass, error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20')}
            >
                {options.map((opt) => (
                    <option key={opt || '_empty'} value={opt}>
                        {opt || '-- Select --'}
                    </option>
                ))}
            </select>
            {error && (
                <p id={errId} className="text-sm font-medium text-red-600" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

function ProfileSection({
    id,
    title,
    description,
    children,
    className,
}: {
    id: string;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-heading`}
            className={clsx('rounded-xl border border-slate-200/90 bg-slate-50/40', className)}
        >
            <div className="border-b border-slate-200/80 bg-white/80 px-4 py-3 sm:px-5">
                <h3 id={`${id}-heading`} className="font-display text-sm font-semibold text-slate-900">
                    {title}
                </h3>
                {description && <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>}
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </section>
    );
}

function FileDropSurface({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={clsx(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white px-4 py-6 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/30',
                className,
            )}
        >
            {children}
        </div>
    );
}

function ProfilePageSkeleton() {
    return (
        <LayoutContainer className="space-y-8">
            <div className="space-y-2">
                <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                <div className="h-9 max-w-md animate-pulse rounded-lg bg-slate-200" />
                <div className="h-4 max-w-lg animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </LayoutContainer>
    );
}

const PINCODE_REGEX = /^[0-9]{6}$/;
const currentYear = new Date().getFullYear();

function validateScholar(value: string): string | undefined {
    if (!value) return undefined;
    if (!/^\d+$/.test(value)) return 'Scholar number must contain only digits';
    if (value.length > 10) return 'Scholar number cannot exceed 10 digits';
    if (value.length < 10) return 'Scholar number must contain exactly 10 digits';
    return undefined;
}

function validatePhone(value: string): string | undefined {
    if (!value) return undefined;
    if (!/^\d+$/.test(value)) return 'Phone number must contain only digits';
    if (value.length > 10) return 'Phone number cannot exceed 10 digits';
    if (value.length < 10) return 'Phone number must contain exactly 10 digits';
    return undefined;
}

function validatePincode(value: string): string | undefined {
    if (!value) return undefined;
    if (!PINCODE_REGEX.test(value)) return 'Pincode must be a 6 digit number';
    return undefined;
}

function validatePercentage(value: string): string | undefined {
    if (!value) return undefined;
    const n = parseFloat(value);
    if (Number.isNaN(n) || n < 0 || n > 100) return 'Percentage must be between 0 and 100';
    return undefined;
}

function validateBacklogs(value: string): string | undefined {
    if (!value) return undefined;
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 0 || n > 50) return 'Active backlogs must be between 0 and 50';
    return undefined;
}

function validateCgpa(value: string): string | undefined {
    if (!value) return undefined;
    const n = parseFloat(value);
    if (Number.isNaN(n) || n < 0 || n > 10) return 'CGPA must be between 0 and 10';
    return undefined;
}

function validateSgpa(value: string): string | undefined {
    if (!value) return undefined;
    const n = parseFloat(value);
    if (Number.isNaN(n) || n < 0 || n > 10) return 'SGPA must be between 0 and 10';
    return undefined;
}

function validateSemester(value: string): string | undefined {
    if (!value) return undefined;
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 1 || n > 10) return 'Current semester must be between 1 and 10';
    return undefined;
}

function validateYearGap(tenthYear: string, twelfthYear: string): { tenthYear?: string; twelfthYear?: string } {
    const t = tenthYear ? parseInt(tenthYear, 10) : null;
    const tw = twelfthYear ? parseInt(twelfthYear, 10) : null;
    if (t == null && tw == null) return {};
    if (t != null && t >= currentYear) return { tenthYear: 'Year cannot be in the future' };
    if (tw != null && tw >= currentYear) return { twelfthYear: 'Year cannot be in the future' };
    if (t != null && tw != null && tw - t < 2) return { twelfthYear: 'Gap between 10th and 12th must be at least 2 years' };
    return {};
}

export default function StudentProfile() {
    const { token, user } = useAuth();
    const [step, setStep] = useState(0);
    const [profile, setProfile] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [internFormErrors, setInternFormErrors] = useState<Record<string, string>>({});
    const [docPreview, setDocPreview] = useState<{ url: string; label: string; isPdf: boolean } | null>(null);
    const [photoBroken, setPhotoBroken] = useState(false);
    const [docImageBroken, setDocImageBroken] = useState<Record<string, boolean>>({});
    const [docPreviewBroken, setDocPreviewBroken] = useState(false);
    const [documentDeletingId, setDocumentDeletingId] = useState<string | null>(null);
    /** Initial GET /student/profile only — avoids infinite skeleton on 404/500. */
    const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
    const [spocAccess, setSpocAccess] = useState({
        permJobCreate: !!user?.permJobCreate,
        permLockProfile: !!user?.permLockProfile,
        permExportCsv: !!user?.permExportCsv
    });

    const [form, setForm] = useState({
        firstName: '', lastName: '', branch: '', course: '', scholarNo: '',
        phone: '', dob: '',
        tenthPct: '', tenthYear: '', twelfthPct: '', twelfthYear: '',
        semester: '', cgpa: '', sgpa: '', backlogs: '',
        linkedin: '', naukri: '', leetcode: '', codechef: '', codeforces: '',
        address: '', city: '', state: '', pincode: '',
    });

    const [internForm, setInternForm] = useState({ company: '', role: '', startDate: '', endDate: '', description: '' });
    const [certForm, setCertForm] = useState({ title: '', organization: '', issueDate: '' });

    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        if (user?.role === 'SPOC') return;
        setProfileLoadError(null);
        axios.get(`${getViteApiBase()}/student/profile`, { headers })
            .then(r => {
                const d = r.data.data;
                setProfile(d);
                setProfileLoadError(null);
                setForm({
                    firstName: d.firstName || '', lastName: d.lastName || '',
                    branch: d.branch || '', course: d.course || '',
                    scholarNo: d.scholarNo || '', phone: d.phone || '',
                    dob: d.dob ? d.dob.slice(0, 10) : '',
                    tenthPct: d.tenthPct ?? '', tenthYear: d.tenthYear ?? '',
                    twelfthPct: d.twelfthPct ?? '', twelfthYear: d.twelfthYear ?? '',
                    semester: d.semester ?? '', cgpa: d.cgpa ?? '', sgpa: d.sgpa ?? '', backlogs: d.backlogs ?? '',
                    linkedin: d.linkedin || '', naukri: d.naukri || '',
                    leetcode: d.leetcode || '', codechef: d.codechef || '', codeforces: d.codeforces || '',
                    address: d.address || '', city: d.city || '', state: d.state || '', pincode: d.pincode || '',
                });
            })
            .catch((err) => {
                const msg =
                    err?.response?.data?.message ||
                    err?.response?.data?.error ||
                    'Failed to load profile. Please try again.';
                setProfileLoadError(typeof msg === 'string' ? msg : 'Failed to load profile.');
            });
    }, [token, user?.role]);
    useEffect(() => {
        if (user?.role !== 'SPOC') return;
        axios.get(`${getViteApiBase()}/auth/me`, { headers })
            .then((r) => {
                const u = r.data?.user || {};
                setSpocAccess({
                    permJobCreate: !!u.permJobCreate,
                    permLockProfile: !!u.permLockProfile,
                    permExportCsv: !!u.permExportCsv
                });
            })
            .catch(() => {
                setSpocAccess({
                    permJobCreate: !!user?.permJobCreate,
                    permLockProfile: !!user?.permLockProfile,
                    permExportCsv: !!user?.permExportCsv
                });
            });
    }, [token, user?.role, user?.permJobCreate, user?.permLockProfile, user?.permExportCsv]);

    useEffect(() => {
        setPhotoBroken(false);
    }, [profile?.photoPath]);
    useEffect(() => {
        setDocImageBroken({});
    }, [profile?.documents]);
    useEffect(() => {
        setDocPreviewBroken(false);
    }, [docPreview?.url]);

    if (user?.role === 'SPOC') {
        return (
            <LayoutContainer className="space-y-8">
                <PageHeader
                    title="SPOC Profile"
                    subtitle="Your coordinator-managed access permissions"
                    breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile' }]}
                />
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary-600" />
                        <h3 className="font-display text-lg font-semibold text-slate-900">Assigned permissions</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[
                            { key: 'permJobCreate', label: 'Post Jobs' },
                            { key: 'permLockProfile', label: 'Lock Profiles' },
                            { key: 'permExportCsv', label: 'Export CSV' },
                        ].map((perm) => {
                            const enabled = (spocAccess as any)[perm.key];
                            return (
                                <div
                                    key={perm.key}
                                    className={clsx(
                                        'rounded-xl border p-4',
                                        enabled ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50/80',
                                    )}
                                >
                                    <p className="text-sm font-semibold text-slate-800">{perm.label}</p>
                                    <p
                                        className={clsx(
                                            'mt-1 text-xs font-semibold',
                                            enabled ? 'text-emerald-700' : 'text-slate-500',
                                        )}
                                    >
                                        {enabled ? 'Granted by coordinator' : 'Not granted'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </LayoutContainer>
        );
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setForm((f) => {
            const next = { ...f, [name]: value };
            setFieldErrors((prev) => {
                const nextErrors = { ...prev };

                if (name === 'scholarNo') {
                    const msg = validateScholar(next.scholarNo);
                    if (msg) nextErrors.scholarNo = msg;
                    else delete nextErrors.scholarNo;
                }
                if (name === 'phone') {
                    const msg = validatePhone(next.phone);
                    if (msg) nextErrors.phone = msg;
                    else delete nextErrors.phone;
                }
                if (name === 'pincode') {
                    const msg = validatePincode(next.pincode);
                    if (msg) nextErrors.pincode = msg;
                    else delete nextErrors.pincode;
                }
                if (name === 'tenthPct') {
                    const msg = validatePercentage(next.tenthPct);
                    if (msg) nextErrors.tenthPct = msg;
                    else delete nextErrors.tenthPct;
                }
                if (name === 'twelfthPct') {
                    const msg = validatePercentage(next.twelfthPct);
                    if (msg) nextErrors.twelfthPct = msg;
                    else delete nextErrors.twelfthPct;
                }
                if (name === 'backlogs') {
                    const msg = validateBacklogs(next.backlogs);
                    if (msg) nextErrors.backlogs = msg;
                    else delete nextErrors.backlogs;
                }
                if (name === 'cgpa') {
                    const msg = validateCgpa(next.cgpa);
                    if (msg) nextErrors.cgpa = msg;
                    else delete nextErrors.cgpa;
                }
                if (name === 'sgpa') {
                    const msg = validateSgpa(next.sgpa);
                    if (msg) nextErrors.sgpa = msg;
                    else delete nextErrors.sgpa;
                }
                if (name === 'semester') {
                    const msg = validateSemester(next.semester);
                    if (msg) nextErrors.semester = msg;
                    else delete nextErrors.semester;
                }
                if (name === 'tenthYear' || name === 'twelfthYear') {
                    const yearErr = validateYearGap(next.tenthYear, next.twelfthYear);
                    if (yearErr.tenthYear) nextErrors.tenthYear = yearErr.tenthYear;
                    else delete nextErrors.tenthYear;
                    if (yearErr.twelfthYear) nextErrors.twelfthYear = yearErr.twelfthYear;
                    else delete nextErrors.twelfthYear;
                }
                if (name === 'branch' && next.branch) delete nextErrors.branch;
                if (name === 'course' && next.course) delete nextErrors.course;

                return nextErrors;
            });
            return next;
        });
    };

    const runStep0Validation = (): boolean => {
        const err: Record<string, string> = {};
        if (!form.branch) err.branch = 'Please select a valid branch';
        if (!form.course) err.course = 'Please select a valid course';
        const scholarErr = validateScholar(form.scholarNo);
        if (scholarErr) err.scholarNo = scholarErr;
        const phoneErr = validatePhone(form.phone);
        if (phoneErr) err.phone = phoneErr;
        const pincodeErr = validatePincode(form.pincode);
        if (pincodeErr) err.pincode = pincodeErr;
        setFieldErrors(err);
        return Object.keys(err).length === 0;
    };

    const runStep1Validation = (): boolean => {
        const err: Record<string, string> = {};
        const tenthPctErr = validatePercentage(form.tenthPct);
        if (tenthPctErr) err.tenthPct = tenthPctErr;
        const twelfthPctErr = validatePercentage(form.twelfthPct);
        if (twelfthPctErr) err.twelfthPct = twelfthPctErr;
        const backlogsErr = validateBacklogs(form.backlogs);
        if (backlogsErr) err.backlogs = backlogsErr;
        const cgpaErr = validateCgpa(form.cgpa);
        if (cgpaErr) err.cgpa = cgpaErr;
        const sgpaErr = validateSgpa(form.sgpa);
        if (sgpaErr) err.sgpa = sgpaErr;
        const semesterErr = validateSemester(form.semester);
        if (semesterErr) err.semester = semesterErr;
        const yearErr = validateYearGap(form.tenthYear, form.twelfthYear);
        Object.assign(err, yearErr);
        setFieldErrors((prev) => {
            const next = { ...prev };
            [
                'tenthPct',
                'twelfthPct',
                'backlogs',
                'cgpa',
                'sgpa',
                'semester',
                'tenthYear',
                'twelfthYear',
            ].forEach((k) => delete next[k]);
            Object.assign(next, err);
            return next;
        });
        return Object.keys(err).length === 0;
    };

    const validateProfileForm = (): boolean => {
        setFieldErrors({});
        if (step === 0) return runStep0Validation();
        if (step === 1) return runStep1Validation();
        return true;
    };

    const handleSave = async (): Promise<boolean> => {
        if (!validateProfileForm()) return false;
        setSaving(true); setMessage(''); setError('');
        setFieldErrors({});
        try {
            const payload: any = { ...form };
            ['tenthPct', 'twelfthPct', 'cgpa', 'sgpa'].forEach(k => { if (payload[k] !== '') payload[k] = parseFloat(payload[k]); else delete payload[k]; });
            ['tenthYear', 'twelfthYear', 'semester', 'backlogs'].forEach(k => { if (payload[k] !== '') payload[k] = parseInt(payload[k]); else delete payload[k]; });
            if (!payload.dob) delete payload.dob;
            await axios.put(`${getViteApiBase()}/student/profile`, payload, { headers });
            setMessage('Profile saved successfully!');
            setTimeout(() => setMessage(''), 3000);
            return true;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Save failed.');
            return false;
        } finally { setSaving(false); }
    };

    const validateInternshipForm = (): boolean => {
        const err: Record<string, string> = {};
        if (internForm.startDate && internForm.endDate && new Date(internForm.endDate) <= new Date(internForm.startDate)) {
            err.endDate = 'Internship end date must be after start date';
        }
        setInternFormErrors(err);
        return Object.keys(err).length === 0;
    };

    useEffect(() => {
        if (!internForm.startDate || !internForm.endDate) {
            setInternFormErrors((prev) => {
                if (!prev.endDate) return prev;
                const next = { ...prev };
                delete next.endDate;
                return next;
            });
            return;
        }
        setInternFormErrors((prev) => {
            const next = { ...prev };
            if (new Date(internForm.endDate) <= new Date(internForm.startDate)) {
                next.endDate = 'Internship end date must be after start date';
            } else {
                delete next.endDate;
            }
            return next;
        });
    }, [internForm.startDate, internForm.endDate]);

    const handleAddInternship = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateInternshipForm()) return;
        setInternFormErrors({});
        try {
            const res = await axios.post(`${getViteApiBase()}/student/internships`, internForm, { headers });
            setProfile((p: any) => ({ ...p, internships: [...(p.internships || []), res.data.data] }));
            setInternForm({ company: '', role: '', startDate: '', endDate: '', description: '' });
            setMessage('Internship added!'); setTimeout(() => setMessage(''), 3000);
        } catch (err: any) { setError(err.response?.data?.message || 'Failed to add internship.'); }
    };

    const handleDeleteInternship = async (id: string) => {
        try {
            await axios.delete(`${getViteApiBase()}/student/internships/${id}`, { headers });
            setProfile((p: any) => ({ ...p, internships: p.internships.filter((i: any) => i.id !== id) }));
        } catch { setError('Failed to delete.'); }
    };

    const handleAddCert = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${getViteApiBase()}/student/certifications`, certForm, { headers });
            setProfile((p: any) => ({ ...p, certifications: [...(p.certifications || []), res.data.data] }));
            setCertForm({ title: '', organization: '', issueDate: '' });
            setMessage('Certification added!'); setTimeout(() => setMessage(''), 3000);
        } catch (err: any) { setError(err.response?.data?.message || 'Failed.'); }
    };

    const handleDeleteCert = async (id: string) => {
        try {
            await axios.delete(`${getViteApiBase()}/student/certifications/${id}`, { headers });
            setProfile((p: any) => ({ ...p, certifications: p.certifications.filter((c: any) => c.id !== id) }));
        } catch { setError('Failed to delete.'); }
    };

    const uploadStudentPhotoFile = async (file: File) => {
        const fd = new FormData();
        fd.append('photo', file);
        try {
            const res = await axios.post(`${getViteApiBase()}/student/photo`, fd, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            });
            setProfile((p: any) => ({ ...p, photoPath: res.data.data.photoPath }));
            setMessage('Photo updated!');
            setTimeout(() => setMessage(''), 3000);
        } catch {
            setError('Photo upload failed.');
        }
    };

    const uploadStudentDocumentFile = async (type: string, file: File) => {
        const fd = new FormData();
        fd.append('document', file);
        fd.append('type', type);
        try {
            const res = await axios.post(`${getViteApiBase()}/student/document`, fd, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            });
            setProfile((p: any) => ({ ...p, documents: [...(p.documents || []), res.data.data] }));
            setMessage(`${type.replace('_', ' ')} uploaded!`);
            setTimeout(() => setMessage(''), 3000);
        } catch {
            setError('Upload failed.');
        }
    };

    const handleDeleteStudentDocument = async (doc: { id: string; fileUrl: string }) => {
        setError('');
        setDocumentDeletingId(doc.id);
        const removedUrl = assetPublicUrl(doc.fileUrl);
        try {
            await axios.delete(`${getViteApiBase()}/student/document/${doc.id}`, { headers });
            setProfile((p: any) => ({
                ...p,
                documents: (p.documents || []).filter((d: any) => d.id !== doc.id),
            }));
            setDocPreview((prev) => (prev?.url === removedUrl ? null : prev));
            setMessage('Document removed.');
            setTimeout(() => setMessage(''), 3000);
        } catch {
            setError('Could not remove document.');
        } finally {
            setDocumentDeletingId(null);
        }
    };

    // Progress calculation
    const calcProgress = () => {
        const fields = [form.firstName, form.lastName, form.branch, form.course, form.phone,
            form.tenthPct, form.cgpa, form.linkedin];
        const filled = fields.filter(Boolean).length;
        const hasResume = profile?.resumes?.length > 0;
        const hasDocs = profile?.documents?.length > 0;
        return Math.round(((filled + (hasResume ? 1 : 0) + (hasDocs ? 1 : 0)) / 10) * 100);
    };

    const stepComplete = (s: number) => {
        if (s === 0) return !!(form.firstName && form.lastName && form.branch && form.phone);
        if (s === 1) return !!(form.tenthPct && form.twelfthPct && form.cgpa);
        if (s === 2) return !!(form.linkedin);
        if (s === 3) return !!(profile?.documents?.length > 0);
        return false;
    };

    const progress = calcProgress();

    const goNext = async () => {
        if (step <= 2) {
            const ok = await handleSave();
            if (!ok) return;
        }
        if (step < 3) setStep(step + 1);
    };
    const goPrev = () => { if (step > 0) setStep(step - 1); };

    if (!profile) {
        if (profileLoadError) {
            return (
                <LayoutContainer className="space-y-6">
                    <PageHeader
                        title="Profile"
                        subtitle="We could not load your placement profile."
                        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile' }]}
                    />
                    <div
                        role="alert"
                        data-testid="student-profile-load-error"
                        className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 shadow-sm"
                    >
                        <div className="flex items-start gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                            <div>
                                <p className="font-semibold">Unable to load profile</p>
                                <p className="mt-2 text-red-800">{profileLoadError}</p>
                                <Button
                                    type="button"
                                    className="mt-4"
                                    variant="secondary"
                                    onClick={() => {
                                        setProfileLoadError(null);
                                        setProfile(null);
                                        window.location.reload();
                                    }}
                                >
                                    Retry
                                </Button>
                            </div>
                        </div>
                    </div>
                </LayoutContainer>
            );
        }
        return <ProfilePageSkeleton />;
    }

    return (
        <>
            <LayoutContainer className="space-y-8" data-testid="student-profile-loaded">
                <PageHeader
                    title="Profile Builder"
                    subtitle="Structured sections match official placement records. Save as you complete each step."
                    breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile' }]}
                />

                {profile?.isLocked && (
                    <div
                        role="alert"
                        className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5"
                    >
                        <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" aria-hidden />
                        <div>
                            <p className="text-sm font-semibold text-red-900">Profile locked</p>
                            <p className="mt-1 text-sm leading-relaxed text-red-700">
                                {profile.lockedReason ||
                                    'Your profile has been locked by the placement coordinator.'}
                            </p>
                        </div>
                    </div>
                )}

                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-semibold text-slate-900">Profile completion</span>
                        <span
                            className={clsx(
                                'text-sm font-bold tabular-nums',
                                progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-red-600',
                            )}
                        >
                            {progress}%
                        </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.6 }}
                            className={clsx(
                                'h-2 rounded-full',
                                progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500',
                            )}
                        />
                    </div>
                </div>

                <AnimatePresence>
                    {message && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
                            role="status"
                        >
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden />
                            {message}
                        </motion.div>
                    )}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800"
                            role="alert"
                        >
                            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <nav
                    className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm sm:p-4"
                    aria-label="Profile sections"
                >
                    <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:pb-0">
                        {STEPS.map((s, i) => {
                            const Icon = s.icon;
                            const done = stepComplete(i);
                            return (
                                <button
                                    key={s.label}
                                    type="button"
                                    onClick={() => setStep(i)}
                                    aria-label={s.label}
                                    aria-current={step === i ? 'step' : undefined}
                                    className={clsx(
                                        'flex min-w-[8.5rem] flex-shrink-0 snap-start items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all sm:min-w-0',
                                        step === i
                                            ? 'border-primary-300 bg-primary-50 shadow-sm ring-1 ring-primary-200'
                                            : done
                                              ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'
                                              : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white',
                                    )}
                                >
                                    <div
                                        className={clsx(
                                            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                                            step === i
                                                ? 'bg-primary-600 text-white'
                                                : done
                                                  ? 'bg-emerald-100 text-emerald-700'
                                                  : 'bg-white text-slate-400 ring-1 ring-slate-200',
                                        )}
                                    >
                                        {done && i !== step ? (
                                            <Check className="h-4 w-4" aria-hidden />
                                        ) : (
                                            <Icon className="h-4 w-4" aria-hidden />
                                        )}
                                    </div>
                                    <span
                                        className={clsx(
                                            'text-xs font-semibold leading-tight',
                                            step === i
                                                ? 'text-primary-900'
                                                : done
                                                  ? 'text-emerald-800'
                                                  : 'text-slate-500',
                                        )}
                                    >
                                        {s.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </nav>

                {/* Step content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6"
                    >
                        {step === 0 && (
                            <div className="space-y-6">
                                <ProfileSection
                                    id="section-personal"
                                    title="Personal & enrollment"
                                    description="Use your official name and scholar details as registered with the institute."
                                >
                                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                                        <FormField
                                            label="First Name"
                                            name="firstName"
                                            value={form.firstName}
                                            onChange={handleChange}
                                            placeholder="John"
                                            error={fieldErrors.firstName}
                                        />
                                        <FormField
                                            label="Last Name"
                                            name="lastName"
                                            value={form.lastName}
                                            onChange={handleChange}
                                            placeholder="Doe"
                                            error={fieldErrors.lastName}
                                        />
                                        <SelectField
                                            label="Branch"
                                            name="branch"
                                            value={form.branch}
                                            onChange={handleChange}
                                            options={BRANCH_OPTIONS}
                                            error={fieldErrors.branch}
                                        />
                                        <SelectField
                                            label="Course"
                                            name="course"
                                            value={form.course}
                                            onChange={handleChange}
                                            options={COURSE_OPTIONS}
                                            error={fieldErrors.course}
                                        />
                                        <FormField
                                            label="Scholar Number"
                                            name="scholarNo"
                                            value={form.scholarNo}
                                            onChange={handleChange}
                                            placeholder="10 digits"
                                            maxLength={10}
                                            error={fieldErrors.scholarNo}
                                            hint="Exactly 10 digits when provided."
                                            onBlur={(e) =>
                                                setFieldErrors((prev) => ({
                                                    ...prev,
                                                    scholarNo:
                                                        validateScholar((e.target as HTMLInputElement).value) ?? '',
                                                }))
                                            }
                                        />
                                        <FormField
                                            label="Phone"
                                            name="phone"
                                            type="tel"
                                            value={form.phone}
                                            onChange={handleChange}
                                            placeholder="9876543210"
                                            maxLength={10}
                                            error={fieldErrors.phone}
                                        />
                                        <FormField
                                            label="Date of Birth"
                                            name="dob"
                                            type="date"
                                            value={form.dob}
                                            onChange={handleChange}
                                            error={fieldErrors.dob}
                                        />
                                    </div>
                                </ProfileSection>

                                <ProfileSection
                                    id="section-address"
                                    title="Correspondence address"
                                    description="Mailing address for placement-related communication and verification."
                                >
                                    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                                        Address as per government ID is preferred.
                                    </div>
                                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                                        <FormField
                                            label="Address"
                                            name="address"
                                            value={form.address}
                                            onChange={handleChange}
                                            error={fieldErrors.address}
                                        />
                                        <FormField
                                            label="City"
                                            name="city"
                                            value={form.city}
                                            onChange={handleChange}
                                            error={fieldErrors.city}
                                        />
                                        <FormField
                                            label="State"
                                            name="state"
                                            value={form.state}
                                            onChange={handleChange}
                                            error={fieldErrors.state}
                                        />
                                        <FormField
                                            label="Pincode"
                                            name="pincode"
                                            value={form.pincode}
                                            onChange={handleChange}
                                            placeholder="6 digits"
                                            error={fieldErrors.pincode}
                                            hint="Six-digit Indian postal code."
                                            onBlur={(e) =>
                                                setFieldErrors((prev) => ({
                                                    ...prev,
                                                    pincode:
                                                        validatePincode((e.target as HTMLInputElement).value) ?? '',
                                                }))
                                            }
                                        />
                                    </div>
                                </ProfileSection>
                            </div>
                        )}

                        {step === 1 && (
                            <ProfileSection
                                id="section-academic"
                                title="Academic record"
                                description="Secondary, higher secondary, and current programme metrics. Values are validated before save."
                            >
                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                                    <FormField
                                        label="10th Percentage"
                                        name="tenthPct"
                                        type="number"
                                        value={form.tenthPct}
                                        onChange={handleChange}
                                        placeholder="85.5"
                                        error={fieldErrors.tenthPct}
                                    />
                                    <FormField
                                        label="10th Year"
                                        name="tenthYear"
                                        type="number"
                                        value={form.tenthYear}
                                        onChange={handleChange}
                                        placeholder="2018"
                                        error={fieldErrors.tenthYear}
                                    />
                                    <FormField
                                        label="12th Percentage"
                                        name="twelfthPct"
                                        type="number"
                                        value={form.twelfthPct}
                                        onChange={handleChange}
                                        placeholder="90.0"
                                        error={fieldErrors.twelfthPct}
                                    />
                                    <FormField
                                        label="12th Year"
                                        name="twelfthYear"
                                        type="number"
                                        value={form.twelfthYear}
                                        onChange={handleChange}
                                        placeholder="2020"
                                        error={fieldErrors.twelfthYear}
                                    />
                                    <FormField
                                        label="Current Semester"
                                        name="semester"
                                        type="number"
                                        value={form.semester}
                                        onChange={handleChange}
                                        placeholder="7"
                                        error={fieldErrors.semester}
                                    />
                                    <FormField
                                        label="CGPA (out of 10)"
                                        name="cgpa"
                                        type="number"
                                        value={form.cgpa}
                                        onChange={handleChange}
                                        placeholder="8.5"
                                        error={fieldErrors.cgpa}
                                    />
                                    <FormField
                                        label="SGPA (current)"
                                        name="sgpa"
                                        type="number"
                                        value={form.sgpa}
                                        onChange={handleChange}
                                        placeholder="9.0"
                                        error={fieldErrors.sgpa}
                                    />
                                    <FormField
                                        label="Active Backlogs"
                                        name="backlogs"
                                        type="number"
                                        value={form.backlogs}
                                        onChange={handleChange}
                                        placeholder="0"
                                        error={fieldErrors.backlogs}
                                    />
                                </div>
                            </ProfileSection>
                        )}

                        {step === 2 && (
                            <div className="space-y-6">
                                <ProfileSection
                                    id="section-links"
                                    title="Professional links"
                                    description="Share verified profiles used by recruiters and the placement cell."
                                >
                                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                                        <FormField
                                            label="LinkedIn URL"
                                            name="linkedin"
                                            type="url"
                                            value={form.linkedin}
                                            onChange={handleChange}
                                            placeholder="https://linkedin.com/in/..."
                                        />
                                        <FormField
                                            label="Naukri URL"
                                            name="naukri"
                                            type="url"
                                            value={form.naukri}
                                            onChange={handleChange}
                                        />
                                        <FormField
                                            label="LeetCode URL"
                                            name="leetcode"
                                            type="url"
                                            value={form.leetcode}
                                            onChange={handleChange}
                                        />
                                        <FormField
                                            label="CodeChef URL"
                                            name="codechef"
                                            type="url"
                                            value={form.codechef}
                                            onChange={handleChange}
                                        />
                                        <FormField
                                            label="Codeforces URL"
                                            name="codeforces"
                                            type="url"
                                            value={form.codeforces}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </ProfileSection>

                                <ProfileSection
                                    id="section-internships"
                                    title="Internships"
                                    description="List internships in chronological order. End date must follow the start date."
                                >
                                    <div className="space-y-3">
                                        {(profile.internships || []).map((i: any) => (
                                            <div
                                                key={i.id}
                                                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        {i.role}{' '}
                                                        <span className="font-normal text-slate-600">at {i.company}</span>
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-slate-500">
                                                        {i.startDate?.slice(0, 7)} – {i.endDate?.slice(0, 7) || 'Present'}
                                                    </p>
                                                    {i.description && (
                                                        <p className="mt-1 text-xs text-slate-600">{i.description}</p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteInternship(i.id)}
                                                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                    aria-label="Remove internship"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <form
                                        onSubmit={handleAddInternship}
                                        className="mt-5 space-y-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 sm:p-5"
                                    >
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <span className="text-sm font-medium text-slate-700">Company</span>
                                                <input
                                                    required
                                                    placeholder="Company"
                                                    className={inputBaseClass}
                                                    value={internForm.company}
                                                    onChange={(e) =>
                                                        setInternForm((f) => ({ ...f, company: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <span className="text-sm font-medium text-slate-700">Role</span>
                                                <input
                                                    required
                                                    placeholder="Role"
                                                    className={inputBaseClass}
                                                    value={internForm.role}
                                                    onChange={(e) =>
                                                        setInternForm((f) => ({ ...f, role: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label
                                                    className="text-sm font-medium text-slate-700"
                                                    htmlFor="intern-start"
                                                >
                                                    Internship Start Date
                                                </label>
                                                <input
                                                    id="intern-start"
                                                    type="date"
                                                    required
                                                    className={inputBaseClass}
                                                    value={internForm.startDate}
                                                    onChange={(e) =>
                                                        setInternForm((f) => ({ ...f, startDate: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label
                                                    className="text-sm font-medium text-slate-700"
                                                    htmlFor="intern-end"
                                                >
                                                    Internship End Date
                                                </label>
                                                <input
                                                    id="intern-end"
                                                    type="date"
                                                    className={clsx(
                                                        inputBaseClass,
                                                        internFormErrors.endDate &&
                                                            'border-red-400 focus:border-red-500 focus:ring-red-500/20',
                                                    )}
                                                    value={internForm.endDate}
                                                    onChange={(e) =>
                                                        setInternForm((f) => ({ ...f, endDate: e.target.value }))
                                                    }
                                                    aria-invalid={internFormErrors.endDate ? 'true' : undefined}
                                                />
                                                {internFormErrors.endDate && (
                                                    <p className="text-sm font-medium text-red-600" role="alert">
                                                        {internFormErrors.endDate}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <textarea
                                            placeholder="Description (optional)"
                                            className={clsx(
                                                inputBaseClass,
                                                'mb-1 min-h-[4.5rem] resize-y',
                                            )}
                                            value={internForm.description}
                                            onChange={(e) =>
                                                setInternForm((f) => ({ ...f, description: e.target.value }))
                                            }
                                        />
                                        <button
                                            type="submit"
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                                        >
                                            <Plus className="h-3.5 w-3.5" aria-hidden /> Add Internship
                                        </button>
                                    </form>
                                </ProfileSection>

                                <ProfileSection
                                    id="section-certifications"
                                    title="Certifications"
                                    description="Professional or technical certifications supporting your candidature."
                                >
                                    <div className="space-y-3">
                                        {(profile.certifications || []).map((c: any) => (
                                            <div
                                                key={c.id}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                                                    <p className="text-xs text-slate-600">
                                                        {c.organization} · {c.issueDate?.slice(0, 10)}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteCert(c.id)}
                                                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                    aria-label="Remove certification"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <form
                                        onSubmit={handleAddCert}
                                        className="mt-5 space-y-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 sm:p-5"
                                    >
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                            <div className="space-y-1.5">
                                                <span className="text-sm font-medium text-slate-700">Title</span>
                                                <input
                                                    required
                                                    placeholder="Title"
                                                    className={inputBaseClass}
                                                    value={certForm.title}
                                                    onChange={(e) =>
                                                        setCertForm((f) => ({ ...f, title: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <span className="text-sm font-medium text-slate-700">
                                                    Organization
                                                </span>
                                                <input
                                                    required
                                                    placeholder="Organization"
                                                    className={inputBaseClass}
                                                    value={certForm.organization}
                                                    onChange={(e) =>
                                                        setCertForm((f) => ({ ...f, organization: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label
                                                    className="text-sm font-medium text-slate-700"
                                                    htmlFor="cert-issue"
                                                >
                                                    Issue date
                                                </label>
                                                <input
                                                    id="cert-issue"
                                                    type="date"
                                                    required
                                                    className={inputBaseClass}
                                                    value={certForm.issueDate}
                                                    onChange={(e) =>
                                                        setCertForm((f) => ({ ...f, issueDate: e.target.value }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                                        >
                                            <Plus className="h-3.5 w-3.5" aria-hidden /> Add Certification
                                        </button>
                                    </form>
                                </ProfileSection>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-6">
                                <ProfileSection
                                    id="section-photo"
                                    title="Profile photograph"
                                    description="Passport-style photograph for placement dossiers. JPG, PNG or WebP. Max 2MB."
                                >
                                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                                        <div className="relative mx-auto h-32 w-32 flex-shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-slate-100 sm:mx-0">
                                            {profile.photoPath && !photoBroken ? (
                                                <img
                                                    src={assetPublicUrl(profile.photoPath)}
                                                    alt="Profile"
                                                    className="h-full w-full object-cover"
                                                    onError={() => setPhotoBroken(true)}
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-200">
                                                    <User className="h-12 w-12 text-slate-400" aria-hidden />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
                                            <p className="text-sm font-semibold text-slate-900">Profile Photo</p>
                                            <label
                                                className="block cursor-pointer"
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const file = e.dataTransfer.files?.[0];
                                                    if (file && file.type.startsWith('image/')) void uploadStudentPhotoFile(file);
                                                }}
                                            >
                                                <FileDropSurface className="py-5">
                                                    <Upload
                                                        className="mx-auto mb-2 h-8 w-8 text-primary-600"
                                                        aria-hidden
                                                    />
                                                    <span className="text-sm font-semibold text-slate-800">
                                                        Click to upload or drag file here
                                                    </span>
                                                    <span className="mt-1 block text-xs text-slate-500">
                                                        Accepted: JPG, PNG, WebP · max 2MB
                                                    </span>
                                                </FileDropSurface>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="sr-only"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) void uploadStudentPhotoFile(file);
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </ProfileSection>

                                <ProfileSection
                                    id="section-legal-docs"
                                    title="Legal Documents"
                                    description="Upload clear scans or PDFs. Documents are used for eligibility and verification only."
                                >
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                                        {['COLLEGE_ID', 'AADHAAR', 'PAN', 'OTHER'].map((type) => {
                                            const uploaded = profile.documents?.find((d: any) => d.type === type);
                                            const isPdf = uploaded?.fileName?.toLowerCase().endsWith('.pdf');
                                            return (
                                                <div
                                                    key={type}
                                                    className={clsx(
                                                        'rounded-xl border p-4 transition-colors',
                                                        uploaded
                                                            ? 'border-emerald-200 bg-emerald-50/40'
                                                            : 'border-slate-200 bg-white',
                                                    )}
                                                >
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                                            {type.replace('_', ' ')}
                                                        </span>
                                                        {uploaded && (
                                                            <CheckCircle2
                                                                className="h-4 w-4 flex-shrink-0 text-emerald-600"
                                                                aria-hidden
                                                            />
                                                        )}
                                                    </div>
                                                    {uploaded ? (
                                                        <>
                                                            {(() => {
                                                                const docUrl = assetPublicUrl(uploaded.fileUrl);
                                                                return (
                                                                    <>
                                                                        <p className="mb-2 text-sm font-semibold text-emerald-800">
                                                                            Uploaded
                                                                        </p>
                                                                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                                                            <p className="border-b border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                                                                                Preview
                                                                            </p>
                                                                            <div className="flex min-h-[120px] items-center justify-center p-2">
                                                                                {isPdf ? (
                                                                                    <iframe
                                                                                        src={docUrl}
                                                                                        title={`Preview ${type}`}
                                                                                        className="h-32 w-full rounded border-0"
                                                                                    />
                                                                                ) : docImageBroken[type] ? (
                                                                                    <div className="flex h-32 w-full items-center justify-center bg-white">
                                                                                        <div className="flex flex-col items-center">
                                                                                            <FileText className="mb-1 h-6 w-6 text-slate-300" />
                                                                                            <p className="text-xs font-semibold text-slate-500">
                                                                                                Preview unavailable
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>
                                                                                ) : (
                                                                                    <img
                                                                                        src={docUrl}
                                                                                        alt={`Preview ${type}`}
                                                                                        className="max-h-32 max-w-full object-contain"
                                                                                        onError={() =>
                                                                                            setDocImageBroken(
                                                                                                (prev) => ({
                                                                                                    ...prev,
                                                                                                    [type]: true,
                                                                                                }),
                                                                                            )
                                                                                        }
                                                                                    />
                                                                                )}
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-2 py-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setDocPreview({
                                                                                            url: docUrl,
                                                                                            label: type.replace('_', ' '),
                                                                                            isPdf,
                                                                                        })
                                                                                    }
                                                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                                                                                >
                                                                                    <FileText className="h-3.5 w-3.5" />{' '}
                                                                                    Preview
                                                                                </button>
                                                                                <a
                                                                                    href={docUrl}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="text-xs font-medium text-primary-600 hover:underline"
                                                                                >
                                                                                    Open in new tab
                                                                                </a>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={documentDeletingId === uploaded.id}
                                                                                    onClick={() => void handleDeleteStudentDocument(uploaded)}
                                                                                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                                                >
                                                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                                                    {documentDeletingId === uploaded.id ? 'Removing…' : 'Remove'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </>
                                                    ) : (
                                                        <label
                                                            className="block cursor-pointer"
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const file = e.dataTransfer.files?.[0];
                                                                if (file) void uploadStudentDocumentFile(type, file);
                                                            }}
                                                        >
                                                            <FileDropSurface className="py-4">
                                                                <Upload
                                                                    className="mx-auto mb-1 h-6 w-6 text-primary-600"
                                                                    aria-hidden
                                                                />
                                                                <span className="text-xs font-semibold text-slate-800">
                                                                    Upload {type.replace('_', ' ')}
                                                                </span>
                                                                <span className="mt-0.5 block text-[11px] text-slate-500">
                                                                    PDF or image — drag and drop supported
                                                                </span>
                                                            </FileDropSurface>
                                                            <input
                                                                type="file"
                                                                id={`upload-${type}`}
                                                                className="sr-only"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) void uploadStudentDocumentFile(type, file);
                                                                }}
                                                            />
                                                        </label>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ProfileSection>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={goPrev}
                        disabled={step === 0}
                        className={clsx(
                            'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                            step === 0
                                ? 'cursor-not-allowed text-slate-300'
                                : 'text-slate-700 hover:bg-slate-100',
                        )}
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
                    </button>

                    {step < 3 ? (
                        <Button
                            onClick={goNext}
                            loading={saving}
                            icon={!saving ? <ArrowRight className="h-4 w-4" /> : undefined}
                            fullWidth={false}
                        >
                            Save & Next
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSave}
                            loading={saving}
                            variant="success"
                            icon={!saving ? <Check className="h-4 w-4" /> : undefined}
                            fullWidth={false}
                        >
                            Finish
                        </Button>
                    )}
                </div>
            </LayoutContainer>

            {/* Document preview modal */}
            <AnimatePresence>
                {docPreview && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
                        onClick={() => setDocPreview(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                <span className="text-sm font-semibold text-slate-900">{docPreview.label}</span>
                                <button
                                    type="button"
                                    onClick={() => setDocPreview(null)}
                                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                                    aria-label="Close preview"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto p-4">
                                {docPreview.isPdf ? (
                                    <iframe src={docPreview.url} title={docPreview.label} className="w-full h-[70vh] rounded border border-gray-200" />
                                ) : (
                                        docPreviewBroken ? (
                                            <div className="w-full h-[70vh] flex flex-col items-center justify-center bg-gray-50 rounded border border-gray-200">
                                                <FileText className="w-10 h-10 text-gray-300 mb-3" />
                                                <p className="text-sm font-semibold text-gray-500">Preview unavailable</p>
                                            </div>
                                        ) : (
                                            <img
                                                src={docPreview.url}
                                                alt={docPreview.label}
                                                className="max-w-full max-h-[70vh] object-contain mx-auto"
                                                onError={() => setDocPreviewBroken(true)}
                                            />
                                        )
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
