import { motion } from 'framer-motion';
import manitLogo from '../../assets/manit-logo.png';

interface AuthLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle: string;
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-600 px-4 py-8">
            {/* Background decorative elements */}
            <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-white/5" />
            <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-white/5" />
            <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-white/5" />

            {/* Auth card */}
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-[440px] bg-white rounded-xl shadow-lg p-8 sm:p-10"
            >
                {/* Logo + Brand */}
                <div className="flex flex-col items-center mb-6">
                    <img
                        src={manitLogo}
                        alt="MANIT Logo"
                        className="w-16 h-16 object-contain mb-3"
                    />
                    <span className="text-lg font-bold text-gray-900 tracking-tight">
                        TPC Portal
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5">
                        MANIT Bhopal
                    </span>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
                    {title}
                </h2>
                <p className="text-sm text-gray-500 text-center mb-7">
                    {subtitle}
                </p>

                {/* Form content */}
                {children}
            </motion.div>
        </div>
    );
}
