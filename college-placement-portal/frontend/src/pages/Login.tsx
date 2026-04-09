import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthLayout from '../components/ui/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { getViteApiOrigin } from '../utils/apiBase';

const DEMO_PASSWORD = 'Pass@123';

export default function Login() {
    const [email, setEmail] = useState('spoc@example.com');
    const [password, setPassword] = useState(DEMO_PASSWORD);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [spocGoogleLoading, setSpocGoogleLoading] = useState(false);
    const [googleOtp, setGoogleOtp] = useState('');
    const [pendingSpocEmail, setPendingSpocEmail] = useState('');
    const [googleOtpLoading, setGoogleOtpLoading] = useState(false);
    const [info, setInfo] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await axios.post(`${getViteApiOrigin()}/api/auth/login`, {
                email,
                password
            });
            if (res.data.success) {
                login(res.data.token, res.data.user);
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async (asSpoc = false) => {
        setError('');
        setInfo('');
        if (asSpoc) setSpocGoogleLoading(true);
        else setGoogleLoading(true);
        try {
            const payload: Record<string, string> = { idToken: 'mock:student@example.com' };
            if (asSpoc) payload.googleRole = 'SPOC';
            const res = await axios.post(`${getViteApiOrigin()}/api/auth/google`, {
                ...payload
            });
            if (res.data.success) {
                if (res.data.requiresOtp && res.data.flow === 'GOOGLE_SPOC_OTP') {
                    setPendingSpocEmail(res.data.email || 'student@example.com');
                    setInfo(res.data.message || 'OTP sent. Verify to create SPOC account.');
                    return;
                }
                if (res.data.token) {
                    login(res.data.token, res.data.user);
                    navigate('/dashboard');
                }
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Google Login failed.');
        } finally {
            if (asSpoc) setSpocGoogleLoading(false);
            else setGoogleLoading(false);
        }
    };

    const handleVerifySpocOtp = async () => {
        if (!pendingSpocEmail) {
            setError('No pending SPOC verification found. Start Google sign-in again.');
            return;
        }
        if (googleOtp.trim().length !== 6) {
            setError('Enter a valid 6-character OTP.');
            return;
        }
        setError('');
        setInfo('');
        setGoogleOtpLoading(true);
        try {
            const res = await axios.post(`${getViteApiOrigin()}/api/auth/google/verify-spoc-otp`, {
                email: pendingSpocEmail,
                otp: googleOtp.trim().toUpperCase(),
            });
            if (res.data.success && res.data.token) {
                login(res.data.token, res.data.user);
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to verify OTP.');
        } finally {
            setGoogleOtpLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Sign in to your account to continue"
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
            <AnimatePresence>
                {info && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm"
                    >
                        {info}
                    </motion.div>
                )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setEmail('spoc@example.com');
                            setPassword(DEMO_PASSWORD);
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    >
                        Demo: SPOC
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setEmail('coord@example.com');
                            setPassword(DEMO_PASSWORD);
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    >
                        Demo: Coordinator
                    </button>
                </div>
                <Input
                    label="Email address"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    icon={<Mail className="w-4 h-4" />}
                    required
                />

                <div>
                    <Input
                        label="Password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        icon={<Lock className="w-4 h-4" />}
                        required
                    />
                    <div className="flex justify-end mt-1.5">
                        <Link
                            to="/forgot-password"
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                        >
                            Forgot password?
                        </Link>
                    </div>
                </div>

                <Button
                    type="submit"
                    loading={loading}
                    icon={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
                >
                    Sign in
                </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-3 text-gray-400 font-medium">
                        or continue with
                    </span>
                </div>
            </div>

            {/* Google login */}
            <Button
                type="button"
                variant="google"
                loading={googleLoading}
                onClick={() => handleGoogleLogin(false)}
                icon={
                    !googleLoading ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.31z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                    ) : undefined
                }
            >
                Sign in with Google
            </Button>
            <Button
                type="button"
                variant="outline"
                loading={spocGoogleLoading}
                onClick={() => handleGoogleLogin(true)}
            >
                Sign in with Google as SPOC (OTP)
            </Button>

            {pendingSpocEmail && (
                <div className="space-y-3 mt-4 p-4 rounded-lg border border-blue-100 bg-blue-50/50">
                    <p className="text-xs text-blue-700 font-medium">
                        Verify SPOC OTP sent to <span className="font-semibold">{pendingSpocEmail}</span>
                    </p>
                    <Input
                        label="6-character alphanumeric OTP"
                        type="text"
                        value={googleOtp}
                        onChange={e => setGoogleOtp(e.target.value.toUpperCase())}
                        placeholder="e.g. A7K2P9"
                        maxLength={6}
                    />
                    <Button type="button" onClick={handleVerifySpocOtp} loading={googleOtpLoading}>
                        Verify OTP and Create SPOC Account
                    </Button>
                </div>
            )}

            {/* Register link */}
            <p className="text-center text-sm text-gray-500 mt-8">
                Don't have an account?{' '}
                <Link
                    to="/register"
                    className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                >
                    Create account
                </Link>
            </p>
        </AuthLayout>
    );
}
