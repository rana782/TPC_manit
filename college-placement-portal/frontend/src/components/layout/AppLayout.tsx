import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function AppLayout() {
    const { user, loading } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-9 w-9 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
                    <p className="text-sm font-medium text-slate-500">Loading...</p>
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
            <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
                <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <p className="font-display text-xl font-semibold text-slate-900">Approval pending</p>
                    <p className="mt-2 text-sm text-slate-600">
                        Your SPOC account is awaiting verification from the placement coordinator.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex overflow-hidden bg-slate-50 text-slate-900">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((c) => !c)}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
            />

            <div
                className={clsx(
                    'flex flex-1 flex-col min-h-0 min-w-0 transition-[margin] duration-200 ease-out',
                    sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
                )}
            >
                <Navbar
                    onMenuClick={() => setMobileOpen(true)}
                    sidebarCollapsed={sidebarCollapsed}
                    onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
                />

                <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
