import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function AppLayout() {
    const { user, loading } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-bg">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const isSpocApprovalPending =
        user.role === 'SPOC' &&
        user.isVerified === true &&
        !user.verifiedAt &&
        !user.permJobCreate &&
        !user.permLockProfile &&
        !user.permExportCsv;

    if (isSpocApprovalPending) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <p className="text-xl font-semibold text-gray-700">Approval pending from the coordinator.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-bg flex">
            {/* Sidebar */}
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
            />

            {/* Main area */}
            <motion.div
                initial={false}
                animate={{
                    marginLeft: typeof window !== 'undefined' && window.innerWidth >= 1024
                        ? sidebarCollapsed ? 72 : 260
                        : 0
                }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="flex-1 flex flex-col min-h-screen lg:ml-[260px]"
            >
                {/* Navbar */}
                <Navbar
                    onMenuClick={() => setMobileOpen(true)}
                    sidebarCollapsed={sidebarCollapsed}
                    onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                />

                {/* Page content */}
                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <Outlet />
                </main>
            </motion.div>
        </div>
    );
}
