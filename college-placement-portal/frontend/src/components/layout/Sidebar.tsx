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
    { to: '/jobs-management', icon: Settings, label: 'Manage Jobs', roles: ['SPOC', 'COORDINATOR'] },
    { to: '/admin', icon: ShieldCheck, label: 'Admin Panel', roles: ['COORDINATOR'] },
    { to: '/analytics', icon: BarChart3, label: 'Analytics', roles: ['SPOC', 'COORDINATOR'] },
    { to: '/alumni', icon: Users, label: 'Alumni', roles: ['STUDENT', 'SPOC', 'COORDINATOR'] },
];

function SidebarContent({ collapsed, onToggle, onMobileClose, isMobile }: {
    collapsed: boolean;
    onToggle: () => void;
    onMobileClose: () => void;
    isMobile: boolean;
}) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const filteredItems = navItems.filter(
        (item) => user && item.roles.includes(user.role)
    );

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200">
            {/* Logo header */}
            <div className={clsx(
                'flex items-center h-16 border-b border-gray-100 flex-shrink-0',
                collapsed ? 'justify-center px-2' : 'px-5'
            )}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <img
                        src={manitLogo}
                        alt="MANIT Logo"
                        className={clsx(
                            'object-contain flex-shrink-0',
                            collapsed ? 'w-9 h-9' : 'w-10 h-10'
                        )}
                    />
                    {!collapsed && (
                        <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="text-base font-bold text-gray-900 tracking-tight whitespace-nowrap overflow-hidden"
                        >
                            TPC Portal
                        </motion.span>
                    )}
                </div>

                {/* Close button for mobile */}
                {isMobile && (
                    <button
                        onClick={onMobileClose}
                        className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {/* Collapse toggle for desktop */}
                {!isMobile && !collapsed && (
                    <button
                        onClick={onToggle}
                        className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {filteredItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={isMobile ? onMobileClose : undefined}
                        className={({ isActive }) =>
                            clsx(
                                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                                collapsed && 'justify-center px-2',
                                isActive
                                    ? 'bg-primary-50 text-primary-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            )
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon
                                    className={clsx(
                                        'w-5 h-5 flex-shrink-0',
                                        isActive ? 'text-primary-600' : 'text-gray-400'
                                    )}
                                />
                                {!collapsed && (
                                    <span className="truncate">{item.label}</span>
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User / Logout */}
            <div className={clsx(
                'border-t border-gray-100 p-3 flex-shrink-0',
                collapsed && 'flex justify-center'
            )}>
                {!collapsed && user && (
                    <div className="px-3 py-2 mb-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
                        <p className="text-xs text-gray-500">{user.role}</p>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium w-full',
                        'text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200',
                        collapsed && 'justify-center px-2'
                    )}
                >
                    <LogOut className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span>Logout</span>}
                </button>
            </div>
        </div>
    );
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
    return (
        <>
            {/* Desktop sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: collapsed ? 72 : 260 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-white"
            >
                <SidebarContent
                    collapsed={collapsed}
                    onToggle={onToggle}
                    onMobileClose={onMobileClose}
                    isMobile={false}
                />
            </motion.aside>

            {/* Mobile overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                            onClick={onMobileClose}
                        />
                        <motion.aside
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="fixed inset-y-0 left-0 w-[260px] z-50 lg:hidden"
                        >
                            <SidebarContent
                                collapsed={false}
                                onToggle={onToggle}
                                onMobileClose={onMobileClose}
                                isMobile={true}
                            />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
