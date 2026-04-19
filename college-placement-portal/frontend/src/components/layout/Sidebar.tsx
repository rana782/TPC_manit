import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
    LayoutDashboard,
    UserCircle,
    FileText,
    Briefcase,
    Settings,
    ShieldCheck,
    BarChart3,
    Users,
    LogOut,
    ChevronLeft,
    ChevronRight,
    X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import manitLogo from '../../assets/manit-logo.png';

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    mobileOpen: boolean;
    onMobileClose: () => void;
}

interface NavItem {
    to: string;
    icon: React.ElementType;
    label: string;
    roles: string[];
}

const navItems: NavItem[] = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['STUDENT'] },
    { to: '/profile', icon: UserCircle, label: 'Profile', roles: ['STUDENT'] },
    { to: '/resumes', icon: FileText, label: 'Resumes', roles: ['STUDENT'] },
    { to: '/job-board', icon: Briefcase, label: 'Job Board', roles: ['STUDENT'] },
    { to: '/jobs-management', icon: Settings, label: 'Manage Jobs', roles: ['SPOC'] },
    { to: '/admin', icon: ShieldCheck, label: 'Admin Panel', roles: ['COORDINATOR'] },
    { to: '/analytics', icon: BarChart3, label: 'Analytics', roles: ['SPOC', 'COORDINATOR'] },
    { to: '/alumni', icon: Users, label: 'Alumni', roles: ['STUDENT', 'SPOC', 'COORDINATOR'] },
];

function SidebarContent({
    collapsed,
    onToggle,
    onMobileClose,
    isMobile,
}: {
    collapsed: boolean;
    onToggle: () => void;
    onMobileClose: () => void;
    isMobile: boolean;
}) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const filteredItems = navItems.filter((item) => user && item.roles.includes(user.role));

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex h-full flex-col bg-slate-50 border-r border-slate-200/90">
            {/* Brand */}
            <div
                className={clsx(
                    'flex flex-shrink-0 items-center border-b border-slate-200/80',
                    isMobile ? 'h-[4.5rem] px-5' : collapsed ? 'h-16 justify-center px-2' : 'min-h-[5.5rem] px-6 py-5'
                )}
            >
                <div className={clsx('flex min-w-0 items-center gap-3', collapsed && !isMobile && 'justify-center')}>
                    <img
                        src={manitLogo}
                        alt="MANIT"
                        className={clsx('object-contain flex-shrink-0', collapsed && !isMobile ? 'h-9 w-9' : 'h-10 w-10')}
                    />
                    {(!collapsed || isMobile) && (
                        <div className="min-w-0">
                            <p className="font-display text-lg font-bold leading-tight tracking-tight text-slate-900">
                                TPC Portal
                            </p>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Training &amp; Placement
                            </p>
                        </div>
                    )}
                </div>

                {isMobile && (
                    <button
                        type="button"
                        onClick={onMobileClose}
                        className="ml-auto rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-800"
                        aria-label="Close menu"
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}

                {!isMobile && !collapsed && (
                    <button
                        type="button"
                        onClick={onToggle}
                        className="ml-auto rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                )}
            </div>

            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Primary">
                {filteredItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={isMobile ? onMobileClose : undefined}
                        title={collapsed && !isMobile ? item.label : undefined}
                        className={({ isActive }) =>
                            clsx(
                                `flex items-center gap-3 ${isMobile ? 'border-l-4' : 'border-r-4'} py-2.5 text-sm transition-colors duration-150`,
                                collapsed && !isMobile ? 'justify-center px-2' : 'px-3',
                                isActive
                                    ? 'border-primary-800 bg-slate-200/60 font-semibold text-primary-950'
                                    : 'border-transparent font-medium text-slate-600 hover:border-slate-200 hover:bg-slate-200/50 hover:text-slate-900'
                            )
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon
                                    className={clsx(
                                        'h-5 w-5 flex-shrink-0',
                                        isActive ? 'text-primary-800' : 'text-slate-400'
                                    )}
                                    aria-hidden
                                />
                                {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            <div
                className={clsx(
                    'flex-shrink-0 border-t border-slate-200/80 p-3',
                    collapsed && !isMobile && 'flex flex-col items-center gap-2'
                )}
            >
                {!collapsed && user && (
                    <div className="mb-2 rounded-lg bg-white/60 px-3 py-2">
                        <p className="truncate text-xs font-semibold text-slate-900">{user.email}</p>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{user.role}</p>
                    </div>
                )}
                {!isMobile && collapsed && (
                    <button
                        type="button"
                        onClick={onToggle}
                        className="flex w-full items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-800"
                        aria-label="Expand sidebar"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleLogout}
                    className={clsx(
                        'flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700',
                        collapsed && !isMobile ? 'justify-center px-2' : 'px-3'
                    )}
                >
                    <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden />
                    {(!collapsed || isMobile) && <span>Sign out</span>}
                </button>
            </div>
        </div>
    );
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
    return (
        <>
            <motion.aside
                initial={false}
                animate={{ width: collapsed ? 72 : 256 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="fixed inset-y-0 left-0 z-30 hidden h-screen flex-col border-r border-slate-200/90 bg-slate-50 lg:flex"
            >
                <SidebarContent
                    collapsed={collapsed}
                    onToggle={onToggle}
                    onMobileClose={onMobileClose}
                    isMobile={false}
                />
            </motion.aside>

            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
                            onClick={onMobileClose}
                            aria-hidden
                        />
                        <motion.aside
                            initial={{ x: -288 }}
                            animate={{ x: 0 }}
                            exit={{ x: -288 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col shadow-2xl lg:hidden"
                        >
                            <SidebarContent
                                collapsed={false}
                                onToggle={onToggle}
                                onMobileClose={onMobileClose}
                                isMobile
                            />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
