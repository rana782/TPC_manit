import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthLayout from '../components/ui/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { getViteApiBase } from '../utils/apiBase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await axios.post(`${getViteApiBase()}/auth/login`, {
                email,
                password
            });
            if (res.data.success) {
                login(res.data.token, res.data.user);
                navigate('/dashboard');
            }
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ||
                (err?.code === 'ERR_NETWORK'
                    ? 'Cannot reach the API. Is the backend running on port 5001?'
                    : null) ||
                err?.message ||
                'Login failed. Please try again.';
            setError(String(msg));
        } finally {
            setLoading(false);
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
            <form onSubmit={handleSubmit} className="space-y-5">
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
