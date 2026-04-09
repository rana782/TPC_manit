import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthLayout from '../components/ui/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import OtpInput from '../components/ui/OtpInput';

export default function Register() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [role, setRole] = useState<'STUDENT' | 'SPOC'>('STUDENT');
    const [otp, setOtp] = useState('');
    const [showOtpForm, setShowOtpForm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (password !== confirmPassword) {
                setError('Password and confirm password do not match.');
                setLoading(false);
                return;
            }
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/register`, {
                name,
                email,
                password,
                confirmPassword,
                role
            });
            setShowOtpForm(true);
            setSuccess('OTP sent to your email. Please check your inbox.');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setVerifyLoading(true);
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/verify-email`, {
                email,
                otp
            });
            if (res.data.success) {
                login(res.data.token, res.data.user);
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Verification failed. Please try again.');
        } finally {
            setVerifyLoading(false);
        }
    };

    return (
        <AuthLayout
            title={showOtpForm ? 'Verify your email' : 'Create an account'}
            subtitle={
                showOtpForm
                    ? `Enter the 6-character OTP sent to ${email}`
                    : 'Start your placement journey today'
            }
        >
            {/* Error banner */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
                    >
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Success banner */}
            <AnimatePresence>
                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm"
                    >
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        {success}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {!showOtpForm ? (
                    <motion.form
                        key="register-form"
                        initial={{ opacity: 0, x: 0 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleRegister}
                        className="space-y-5"
                    >
                        <Input
                            label="Full name"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="John Doe"
                            icon={<User className="w-4 h-4" />}
                            required
                        />

                        <Input
                            label="Email address"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@university.edu"
                            icon={<Mail className="w-4 h-4" />}
                            required
                        />

                        <Input
                            label="Password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Min. 6 characters"
                            icon={<Lock className="w-4 h-4" />}
                            required
                            minLength={6}
                        />
                        <Input
                            label="Confirm password"
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter your password"
                            icon={<Lock className="w-4 h-4" />}
                            required
                            minLength={6}
                        />
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-gray-700">
                                Role
                            </label>
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value as 'STUDENT' | 'SPOC')}
                                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all duration-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none hover:border-gray-400"
                            >
                                <option value="STUDENT">Student</option>
                                <option value="SPOC">SPOC</option>
                            </select>
                        </div>

                        <Button
                            type="submit"
                            loading={loading}
                            icon={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
                        >
                            Create account
                        </Button>
                    </motion.form>
                ) : (
                    <motion.form
                        key="otp-form"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleVerify}
                        className="space-y-6"
                    >
                        {/* OTP icon */}
                        <div className="flex justify-center">
                            <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                                <ShieldCheck className="w-8 h-8 text-primary-600" />
                            </div>
                        </div>

                        <OtpInput
                            value={otp}
                            onChange={setOtp}
                            error={!!error}
                        />

                        <Button
                            type="submit"
                            loading={verifyLoading}
                            variant="success"
                            icon={!verifyLoading ? <CheckCircle2 className="w-4 h-4" /> : undefined}
                        >
                            Verify & Continue
                        </Button>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Login link */}
            <p className="text-center text-sm text-gray-500 mt-8">
                Already have an account?{' '}
                <Link
                    to="/login"
                    className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                >
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
}
