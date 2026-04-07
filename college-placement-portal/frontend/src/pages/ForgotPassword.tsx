import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Mail, Lock, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthLayout from '../components/ui/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import OtpInput from '../components/ui/OtpInput';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [step, setStep] = useState(1);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const navigate = useNavigate();

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/forgot-password`, { email });
            setMessage(res.data.message);
            setStep(2);
        } catch (err: any) {
            setError('Failed to request OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setResetLoading(true);
        try {
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/reset-password`, {
                email,
                otp,
                newPassword
            });
            setMessage('Password reset successfully! Redirecting to login...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Password reset failed.');
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <AuthLayout
            title={step === 1 ? 'Reset your password' : 'Set new password'}
            subtitle={
                step === 1
                    ? 'Enter your email and we\'ll send you a reset code'
                    : `Enter the code sent to ${email} and your new password`
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
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm"
                    >
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        {message}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {step === 1 ? (
                    <motion.form
                        key="email-form"
                        initial={{ opacity: 0, x: 0 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleRequestOtp}
                        className="space-y-5"
                    >
                        {/* Icon */}
                        <div className="flex justify-center mb-2">
                            <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                                <KeyRound className="w-8 h-8 text-primary-600" />
                            </div>
                        </div>

                        <Input
                            label="Email address"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            icon={<Mail className="w-4 h-4" />}
                            required
                        />

                        <Button
                            type="submit"
                            loading={loading}
                            icon={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
                        >
                            Send reset code
                        </Button>
                    </motion.form>
                ) : (
                    <motion.form
                        key="reset-form"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleResetPassword}
                        className="space-y-5"
                    >
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 text-center">
                                Verification code
                            </label>
                            <OtpInput
                                value={otp}
                                onChange={setOtp}
                                error={!!error}
                            />
                        </div>

                        <Input
                            label="New password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min. 6 characters"
                            icon={<Lock className="w-4 h-4" />}
                            required
                            minLength={6}
                        />

                        <Button
                            type="submit"
                            loading={resetLoading}
                            variant="success"
                            icon={!resetLoading ? <CheckCircle2 className="w-4 h-4" /> : undefined}
                        >
                            Reset password
                        </Button>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Back to login */}
            <div className="mt-8 text-center">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 font-medium transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to sign in
                </Link>
            </div>
        </AuthLayout>
    );
}
