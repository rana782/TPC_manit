import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    User, GraduationCap, Link2, FileUp, Check, ChevronLeft,
    ArrowRight, AlertCircle, CheckCircle2, Lock, Trash2, Plus,
    Briefcase, Award, Upload, MapPin, X, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_BASE = API.replace(/\/$/, ''); // no trailing slash for asset URLs (photo, documents)

const BRANCH_OPTIONS = ['', 'CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'];
const COURSE_OPTIONS = ['', 'BTech', 'MTech', 'MCA', 'Dual Degree'];

const STEPS = [
    { label: 'Personal', icon: User },
    { label: 'Academic', icon: GraduationCap },
    { label: 'Links & Experience', icon: Link2 },
    { label: 'Documents', icon: FileUp },
];

const inputBaseClass = 'w-full border rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-all focus:ring focus:ring-blue-500 focus:outline-none';

function FormField({ label, name, type = 'text', value, onChange, onBlur, placeholder, error }: {
    label: string; name: string; type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void; placeholder?: string; error?: string;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor={`profile-${name}`}>{label}</label>
            <input
                id={`profile-${name}`}
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                placeholder={placeholder}
                className={clsx(inputBaseClass, 'border-gray-300 bg-white hover:border-gray-400', error && 'border-red-400')}
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>
    );
}

function SelectField({ label, name, value, onChange, onBlur, options, error }: {
    label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; onBlur?: (e: React.FocusEvent<HTMLSelectElement>) => void; options: string[]; error?: string;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor={`profile-${name}`}>{label}</label>
            <select
                id={`profile-${name}`}
                name={name}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                className={clsx(inputBaseClass, 'border-gray-300 bg-white hover:border-gray-400', error && 'border-red-400')}
            >
                {options.map((opt) => (
                    <option key={opt || '_empty'} value={opt}>{opt || '-- Select --'}</option>
                ))}
            </select>
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>
    );
}

const PINCODE_REGEX = /^[0-9]{6}$/;
const currentYear = new Date().getFullYear();

function validateScholar(value: string): string | undefined {
    if (!value) return undefined;
    if (!/^\d{10}$/.test(value)) return 'Scholar number must contain exactly 10 digits';
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

export default function Profile() {
    const { token } = useAuth();
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
        axios.get(`${API}/api/student/profile`, { headers })
            .then(r => {
                const d = r.data.data;
                setProfile(d);
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
            .catch(() => setError('Failed to load profile.'));
    }, [token]);

    // Reset broken-image fallbacks after data changes
    useEffect(() => { setPhotoBroken(false); }, [profile?.photoPath]);
    useEffect(() => { setDocImageBroken({}); }, [profile?.documents]);
    useEffect(() => { setDocPreviewBroken(false); }, [docPreview?.url]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Scholar number: allow free editing (seed/demo values may be non-numeric like SCH-...). Validate 10 digits on blur/save.
        if (name === 'scholarNo' && value.length > 32) return;
        if (name === 'pincode' && value !== '' && !/^\d*$/.test(value)) return;
        if (name === 'pincode' && value.length > 6) return;
        setForm(f => ({ ...f, [name]: value }));
    };

    const runStep0Validation = (): boolean => {
        const err: Record<string, string> = {};
        if (!form.branch) err.branch = 'Please select a valid branch';
        if (!form.course) err.course = 'Please select a valid course';
        const scholarErr = validateScholar(form.scholarNo);
        if (scholarErr) err.scholarNo = scholarErr;
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
        setFieldErrors((prev) => ({ ...prev, ...err }));
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
            await axios.put(`${API}/api/student/profile`, payload, { headers });
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

    const handleAddInternship = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateInternshipForm()) return;
        setInternFormErrors({});
        try {
            const res = await axios.post(`${API}/api/student/internships`, internForm, { headers });
            setProfile((p: any) => ({ ...p, internships: [...(p.internships || []), res.data.data] }));
            setInternForm({ company: '', role: '', startDate: '', endDate: '', description: '' });
            setMessage('Internship added!'); setTimeout(() => setMessage(''), 3000);
        } catch (err: any) { setError(err.response?.data?.message || 'Failed to add internship.'); }
    };

    const handleDeleteInternship = async (id: string) => {
        try {
            await axios.delete(`${API}/api/student/internships/${id}`, { headers });
            setProfile((p: any) => ({ ...p, internships: p.internships.filter((i: any) => i.id !== id) }));
        } catch { setError('Failed to delete.'); }
    };

    const handleAddCert = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${API}/api/student/certifications`, certForm, { headers });
            setProfile((p: any) => ({ ...p, certifications: [...(p.certifications || []), res.data.data] }));
            setCertForm({ title: '', organization: '', issueDate: '' });
            setMessage('Certification added!'); setTimeout(() => setMessage(''), 3000);
        } catch (err: any) { setError(err.response?.data?.message || 'Failed.'); }
    };

    const handleDeleteCert = async (id: string) => {
        try {
            await axios.delete(`${API}/api/student/certifications/${id}`, { headers });
            setProfile((p: any) => ({ ...p, certifications: p.certifications.filter((c: any) => c.id !== id) }));
        } catch { setError('Failed to delete.'); }
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

    if (!profile) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <>
            <PageHeader
                title="Profile Builder"
                subtitle="Complete your profile to unlock all placement features"
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile' }]}
            />

            {/* Locked banner */}
            {profile?.isLocked && (
                <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-50 border border-red-200">
                    <Lock className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-red-800">Profile Locked</p>
                        <p className="text-xs text-red-600">{profile.lockedReason || 'Your profile has been locked by the placement coordinator.'}</p>
                    </div>
                </div>
            )}

            {/* Progress bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900">Profile Completion</span>
                    <span className={clsx('text-sm font-bold', progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-red-500')}>
                        {progress}%
                    </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.6 }}
                        className={clsx('h-2 rounded-full', progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                    />
                </div>
            </div>

            {/* Toast messages */}
            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{message}
                    </motion.div>
                )}
                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stepper */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <div className="flex items-center justify-between">
                    {STEPS.map((s, i) => (
                        <React.Fragment key={i}>
                            <button onClick={() => setStep(i)} className="flex flex-col items-center gap-1.5 group">
                                <div className={clsx(
                                    'w-10 h-10 rounded-full flex items-center justify-center transition-all text-sm font-semibold',
                                    i === step ? 'bg-primary-600 text-white shadow-md shadow-primary-200' :
                                    stepComplete(i) ? 'bg-emerald-100 text-emerald-600' :
                                    'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                                )}>
                                    {stepComplete(i) && i !== step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                                </div>
                                <span className={clsx(
                                    'text-xs font-medium hidden sm:block',
                                    i === step ? 'text-primary-700' : stepComplete(i) ? 'text-emerald-600' : 'text-gray-400'
                                )}>{s.label}</span>
                            </button>
                            {i < STEPS.length - 1 && (
                                <div className={clsx('flex-1 h-0.5 mx-2', stepComplete(i) ? 'bg-emerald-300' : 'bg-gray-200')} />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Step content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white rounded-xl border border-gray-200 p-6"
                >
                    {/* Step 0: Personal */}
                    {step === 0 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <User className="w-5 h-5 text-primary-600" /> Personal Information
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField label="First Name" name="firstName" value={form.firstName} onChange={handleChange} placeholder="John" error={fieldErrors.firstName} />
                                <FormField label="Last Name" name="lastName" value={form.lastName} onChange={handleChange} placeholder="Doe" error={fieldErrors.lastName} />
                                <SelectField label="Branch" name="branch" value={form.branch} onChange={handleChange} options={BRANCH_OPTIONS} error={fieldErrors.branch} />
                                <SelectField label="Course" name="course" value={form.course} onChange={handleChange} options={COURSE_OPTIONS} error={fieldErrors.course} />
                                <FormField label="Scholar Number" name="scholarNo" value={form.scholarNo} onChange={handleChange} placeholder="10 digits" error={fieldErrors.scholarNo}
                                    onBlur={(e) => setFieldErrors((prev) => ({ ...prev, scholarNo: validateScholar((e.target as HTMLInputElement).value) ?? '' }))} />
                                <FormField label="Phone" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="9876543210" error={fieldErrors.phone} />
                                <FormField label="Date of Birth" name="dob" type="date" value={form.dob} onChange={handleChange} error={fieldErrors.dob} />
                            </div>

                            {/* Address subsection */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                                    <MapPin className="w-4 h-4 text-gray-400" /> Address
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField label="Address" name="address" value={form.address} onChange={handleChange} error={fieldErrors.address} />
                                    <FormField label="City" name="city" value={form.city} onChange={handleChange} error={fieldErrors.city} />
                                    <FormField label="State" name="state" value={form.state} onChange={handleChange} error={fieldErrors.state} />
                                    <FormField label="Pincode" name="pincode" value={form.pincode} onChange={handleChange} placeholder="6 digits" error={fieldErrors.pincode}
                                        onBlur={(e) => setFieldErrors((prev) => ({ ...prev, pincode: validatePincode((e.target as HTMLInputElement).value) ?? '' }))} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 1: Academic */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-primary-600" /> Academic Details
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField label="10th Percentage" name="tenthPct" type="number" value={form.tenthPct} onChange={handleChange} placeholder="85.5" error={fieldErrors.tenthPct} />
                                <FormField label="10th Year" name="tenthYear" type="number" value={form.tenthYear} onChange={handleChange} placeholder="2018" error={fieldErrors.tenthYear} />
                                <FormField label="12th Percentage" name="twelfthPct" type="number" value={form.twelfthPct} onChange={handleChange} placeholder="90.0" error={fieldErrors.twelfthPct} />
                                <FormField label="12th Year" name="twelfthYear" type="number" value={form.twelfthYear} onChange={handleChange} placeholder="2020" error={fieldErrors.twelfthYear} />
                                <FormField label="Current Semester" name="semester" type="number" value={form.semester} onChange={handleChange} placeholder="7" error={fieldErrors.semester} />
                                <FormField label="CGPA (out of 10)" name="cgpa" type="number" value={form.cgpa} onChange={handleChange} placeholder="8.5" error={fieldErrors.cgpa} />
                                <FormField label="SGPA (current)" name="sgpa" type="number" value={form.sgpa} onChange={handleChange} placeholder="9.0" error={fieldErrors.sgpa} />
                                <FormField label="Active Backlogs" name="backlogs" type="number" value={form.backlogs} onChange={handleChange} placeholder="0" error={fieldErrors.backlogs} />
                            </div>
                        </div>
                    )}

                    {/* Step 2: Links & Experience */}
                    {step === 2 && (
                        <div className="space-y-8">
                            {/* Social Links */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                    <Link2 className="w-5 h-5 text-primary-600" /> Social & Coding Profiles
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField label="LinkedIn URL" name="linkedin" type="url" value={form.linkedin} onChange={handleChange} placeholder="https://linkedin.com/in/..." />
                                    <FormField label="Naukri URL" name="naukri" type="url" value={form.naukri} onChange={handleChange} />
                                    <FormField label="LeetCode URL" name="leetcode" type="url" value={form.leetcode} onChange={handleChange} />
                                    <FormField label="CodeChef URL" name="codechef" type="url" value={form.codechef} onChange={handleChange} />
                                    <FormField label="Codeforces URL" name="codeforces" type="url" value={form.codeforces} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Internships */}
                            <div className="border-t border-gray-100 pt-6">
                                <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                    <Briefcase className="w-4 h-4 text-amber-600" /> Internships
                                </h4>
                                {(profile.internships || []).map((i: any) => (
                                    <div key={i.id} className="flex items-start justify-between p-4 rounded-lg border border-gray-200 mb-3 hover:border-gray-300 transition-colors">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{i.role} <span className="font-normal text-gray-500">at {i.company}</span></p>
                                            <p className="text-xs text-gray-400 mt-0.5">{i.startDate?.slice(0, 7)} – {i.endDate?.slice(0, 7) || 'Present'}</p>
                                            {i.description && <p className="text-xs text-gray-500 mt-1">{i.description}</p>}
                                        </div>
                                        <button onClick={() => handleDeleteInternship(i.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <form onSubmit={handleAddInternship} className="p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/50">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <input required placeholder="Company" className={clsx('w-full border rounded-md px-3 py-2 text-sm focus:ring focus:ring-blue-500 focus:outline-none', 'border-gray-300')}
                                                value={internForm.company} onChange={e => setInternForm(f => ({ ...f, company: e.target.value }))} />
                                        </div>
                                        <div>
                                            <input required placeholder="Role" className={clsx('w-full border rounded-md px-3 py-2 text-sm focus:ring focus:ring-blue-500 focus:outline-none', 'border-gray-300')}
                                                value={internForm.role} onChange={e => setInternForm(f => ({ ...f, role: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Internship Start Date</label>
                                            <input type="date" required className={clsx('w-full border rounded-md px-3 py-2 text-sm focus:ring focus:ring-blue-500 focus:outline-none', 'border-gray-300')}
                                                value={internForm.startDate} onChange={e => setInternForm(f => ({ ...f, startDate: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Internship End Date</label>
                                            <input type="date" className={clsx('w-full border rounded-md px-3 py-2 text-sm focus:ring focus:ring-blue-500 focus:outline-none', 'border-gray-300', internFormErrors.endDate && 'border-red-400')}
                                                value={internForm.endDate} onChange={e => setInternForm(f => ({ ...f, endDate: e.target.value }))} />
                                            {internFormErrors.endDate && <p className="text-red-500 text-sm mt-1">{internFormErrors.endDate}</p>}
                                        </div>
                                    </div>
                                    <textarea placeholder="Description (optional)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 h-16 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
                                        value={internForm.description} onChange={e => setInternForm(f => ({ ...f, description: e.target.value }))} />
                                    <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors">
                                        <Plus className="w-3.5 h-3.5" /> Add Internship
                                    </button>
                                </form>
                            </div>

                            {/* Certifications */}
                            <div className="border-t border-gray-100 pt-6">
                                <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                    <Award className="w-4 h-4 text-violet-600" /> Certifications
                                </h4>
                                {(profile.certifications || []).map((c: any) => (
                                    <div key={c.id} className="flex items-center justify-between p-4 rounded-lg border border-gray-200 mb-3 hover:border-gray-300 transition-colors">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                                            <p className="text-xs text-gray-500">{c.organization} &middot; {c.issueDate?.slice(0, 10)}</p>
                                        </div>
                                        <button onClick={() => handleDeleteCert(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <form onSubmit={handleAddCert} className="p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/50">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                                        <input required placeholder="Title" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
                                            value={certForm.title} onChange={e => setCertForm(f => ({ ...f, title: e.target.value }))} />
                                        <input required placeholder="Organization" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
                                            value={certForm.organization} onChange={e => setCertForm(f => ({ ...f, organization: e.target.value }))} />
                                        <input type="date" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
                                            value={certForm.issueDate} onChange={e => setCertForm(f => ({ ...f, issueDate: e.target.value }))} />
                                    </div>
                                    <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors">
                                        <Plus className="w-3.5 h-3.5" /> Add Certification
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Documents */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <FileUp className="w-5 h-5 text-primary-600" /> Documents & Photo
                            </h3>

                            {/* Profile photo */}
                            <div className="flex items-center gap-5 p-4 rounded-lg border border-gray-200 bg-gray-50/50">
                                <div className="relative w-32 h-32 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                                    {profile.photoPath && !photoBroken ? (
                                        <img
                                            src={`${API_BASE}${profile.photoPath}`}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                            onError={() => setPhotoBroken(true)}
                                        />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                                            <User className="w-12 h-12 text-gray-400" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-900 mb-1">Profile Photo</p>
                                    <p className="text-xs text-gray-500 mb-2">JPG, PNG or WebP. Max 2MB.</p>
                                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-sm font-medium text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                        <Upload className="w-3.5 h-3.5" /> Upload Photo
                                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const fd = new FormData(); fd.append('photo', file);
                                            try {
                                                const res = await axios.post(`${API}/api/student/photo`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
                                                setProfile((p: any) => ({ ...p, photoPath: res.data.data.photoPath }));
                                                setMessage('Photo updated!'); setTimeout(() => setMessage(''), 3000);
                                            } catch { setError('Photo upload failed.'); }
                                        }} />
                                    </label>
                                </div>
                            </div>

                            {/* Legal documents */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">Legal Documents</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {['COLLEGE_ID', 'AADHAAR', 'PAN', 'OTHER'].map(type => {
                                        const uploaded = profile.documents?.find((d: any) => d.type === type);
                                        const isPdf = uploaded?.fileName?.toLowerCase().endsWith('.pdf');
                                        return (
                                            <div key={type} className={clsx(
                                                'p-4 rounded-lg border transition-colors',
                                                uploaded ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-white'
                                            )}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{type.replace('_', ' ')}</span>
                                                    {uploaded && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                                </div>
                                                {uploaded ? (
                                                    <>
                                                        {(() => {
                                                            const docUrl = `${API_BASE}${uploaded.fileUrl}`;
                                                            return (
                                                                <>
                                                        <p className="text-sm font-medium text-emerald-700 mb-2">Uploaded</p>
                                                        <div className="mt-2 border border-gray-200 rounded-md overflow-hidden bg-gray-50">
                                                            <p className="text-xs font-medium text-gray-500 px-2 py-1 border-b border-gray-200">Preview</p>
                                                            <div className="min-h-[120px] flex items-center justify-center p-2">
                                                                {isPdf ? (
                                                                    <iframe src={docUrl} title={`Preview ${type}`} className="w-full h-32 rounded border-0" />
                                                                ) : (
                                                                    docImageBroken[type] ? (
                                                                        <div className="w-full h-32 flex items-center justify-center bg-white">
                                                                            <div className="flex flex-col items-center">
                                                                                <FileText className="w-6 h-6 text-gray-300 mb-1" />
                                                                                <p className="text-xs font-semibold text-gray-500">Preview unavailable</p>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <img
                                                                            src={docUrl}
                                                                            alt={`Preview ${type}`}
                                                                            className="max-w-full max-h-32 object-contain"
                                                                            onError={() => setDocImageBroken((prev) => ({ ...prev, [type]: true }))}
                                                                        />
                                                                    )
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <button type="button" onClick={() => setDocPreview({ url: docUrl, label: type.replace('_', ' '), isPdf })} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                                                                    <FileText className="w-3.5 h-3.5" /> Preview
                                                                </button>
                                                                <a href={docUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open in new tab</a>
                                                            </div>
                                                        </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </>
                                                ) : (
                                                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-semibold rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                                                        <Upload className="w-3 h-3" /> Upload
                                                        <input type="file" id={`upload-${type}`} className="hidden" onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            const fd = new FormData(); fd.append('document', file); fd.append('type', type);
                                                            try {
                                                                const res = await axios.post(`${API}/api/student/document`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
                                                                setProfile((p: any) => ({ ...p, documents: [...(p.documents || []), res.data.data] }));
                                                                setMessage(`${type.replace('_', ' ')} uploaded!`); setTimeout(() => setMessage(''), 3000);
                                                            } catch { setError('Upload failed.'); }
                                                        }} />
                                                    </label>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-6">
                <button
                    onClick={goPrev}
                    disabled={step === 0}
                    className={clsx(
                        'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all',
                        step === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
                    )}
                >
                    <ChevronLeft className="w-4 h-4" /> Previous
                </button>

                {step < 3 ? (
                    <Button onClick={goNext} loading={saving} icon={!saving ? <ArrowRight className="w-4 h-4" /> : undefined} fullWidth={false}>
                        Save & Next
                    </Button>
                ) : (
                    <Button onClick={handleSave} loading={saving} variant="success" icon={!saving ? <Check className="w-4 h-4" /> : undefined} fullWidth={false}>
                        Finish
                    </Button>
                )}
            </div>

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
                            className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                                <span className="text-sm font-semibold text-gray-900">{docPreview.label}</span>
                                <button type="button" onClick={() => setDocPreview(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                    <X className="w-5 h-5" />
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
