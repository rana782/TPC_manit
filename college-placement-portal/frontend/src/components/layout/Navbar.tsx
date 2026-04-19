import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Menu, Bell, ChevronDown, LogOut, UserCircle, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { getViteApiOrigin } from '../../utils/apiBase';

interface Notification {
    id: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}

interface NavbarProps {
    onMenuClick: () => void;
    sidebarCollapsed: boolean;
    onSidebarToggle: () => void;
}

export default function Navbar({ onMenuClick, sidebarCollapsed, onSidebarToggle }: NavbarProps) {
    const { user, logout, token } = useAuth();
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);

    const apiOrigin = useMemo(() => getViteApiOrigin(), []);
    const notificationsUrl = useMemo(
        () => (apiOrigin ? `${apiOrigin}/api/notifications` : '/api/notifications'),
        [apiOrigin]
    );

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (notifOpen && token) {
            axios
                .get(notificationsUrl, { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => {
                    if (res.data?.success && Array.isArray(res.data.notifications)) {
                        setNotifications(res.data.notifications);
                        axios
                            .patch(
                                apiOrigin ? `${apiOrigin}/api/notifications/read-all` : '/api/notifications/read-all',
                                {},
                                { headers: { Authorization: `Bearer ${token}` } }
                            )
                            .catch(() => {});
                    }
                })
                .catch(() => {});
        }
    }, [notifOpen, token, notificationsUrl]);

    const handleLogout = () => {
        setDropdownOpen(false);
        logout();
        navigate('/login');
    };

    const initials = (user?.name?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase();
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return (
        <header className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/90 bg-white px-4 shadow-sm sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                    type="button"
                    onClick={onMenuClick}
                    className="-ml-1 rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
                    aria-label="Open menu"
                >
                    <Menu className="h-5 w-5" />
                </button>

                {sidebarCollapsed && (
                    <button
                        type="button"
                        onClick={onSidebarToggle}
                        className="hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:flex"
                        aria-label="Expand sidebar"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                )}

                <div className="hidden min-w-0 md:block">
                    <p className="font-display truncate text-lg font-bold tracking-tight text-slate-900 lg:text-xl">
                        TPC Portal
                    </p>
                    <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                        MANIT Bhopal
                    </p>
                </div>
                <span className="font-display text-base font-bold tracking-tight text-slate-900 md:hidden">TPC</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
                <div ref={notifRef} className="relative">
                    <button
                        type="button"
                        data-testid="notification-bell"
                        onClick={() => setNotifOpen(!notifOpen)}
                        className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                        aria-expanded={notifOpen}
                        aria-haspopup="true"
                    >
                        <Bell className="h-5 w-5" />
                        {unreadCount > 0 && (
                            <span className="absolute right-1.5 top-1.5 flex h-2 min-w-2 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                    <AnimatePresence>
                        {notifOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-slate-200/90 bg-white py-1.5 shadow-lg sm:w-80"
                            >
                                <div className="border-b border-slate-100 px-4 py-3">
                                    <div className="flex justify-between">
                                        <p className="text-sm font-semibold text-slate-900">Notifications</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                                            }}
                                            className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
                                        >
                                            Mark all read
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                                            No notifications
                                        </div>
                                    ) : (
                                        notifications.map((n) => (
                                            <div
                                                key={n.id}
                                                className={clsx(
                                                    'border-b border-slate-50 px-4 py-3 text-sm last:border-0',
                                                    !n.isRead && 'bg-primary-50/40'
                                                )}
                                            >
                                                <p className="leading-relaxed text-slate-700">{n.message}</p>
                                                <p className="mt-1 text-xs text-slate-400">
                                                    {new Date(n.createdAt).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div ref={dropdownRef} className="relative border-l border-slate-100 pl-2 sm:pl-4">
                    <button
                        type="button"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-2 rounded-full p-1 pl-1.5 pr-2 transition-colors hover:bg-slate-100 sm:pr-3"
                        aria-expanded={dropdownOpen}
                        aria-haspopup="true"
                    >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
                            {initials}
                        </div>
                        <div className="hidden text-left md:block">
                            <p className="max-w-[140px] truncate text-sm font-medium leading-tight text-slate-900">
                                {user?.name || user?.email?.split('@')[0] || user?.email}
                            </p>
                            <p className="text-xs font-medium text-slate-500">{user?.role}</p>
                        </div>
                        <ChevronDown
                            className={clsx(
                                'hidden h-4 w-4 flex-shrink-0 text-slate-400 transition-transform sm:block',
                                dropdownOpen && 'rotate-180'
                            )}
                        />
                    </button>

                    <AnimatePresence>
                        {dropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200/90 bg-white py-1.5 shadow-lg"
                            >
                                <div className="border-b border-slate-100 px-4 py-2.5">
                                    <p className="truncate text-sm font-semibold text-slate-900">{user?.email}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">{user?.role}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDropdownOpen(false);
                                        navigate('/profile');
                                    }}
                                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    <UserCircle className="h-4 w-4 text-slate-400" />
                                    View profile
                                </button>
                                <div className="mt-1 border-t border-slate-100 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        Sign out
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
}
