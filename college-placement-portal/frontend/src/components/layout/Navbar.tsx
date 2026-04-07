import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Menu, Bell, ChevronDown, LogOut, UserCircle, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
            axios.get(`${API}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => {
                    if (res.data?.success && Array.isArray(res.data.notifications)) {
                        setNotifications(res.data.notifications);
                    }
                })
                .catch(() => {});
        }
    }, [notifOpen, token]);

    const handleLogout = () => {
        setDropdownOpen(false);
        logout();
        navigate('/login');
    };

    const initials = user?.email?.charAt(0).toUpperCase() || 'U';
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
            {/* Left side */}
            <div className="flex items-center gap-3">
                {/* Mobile hamburger */}
                <button
                    onClick={onMenuClick}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 lg:hidden"
                >
                    <Menu className="w-5 h-5" />
                </button>

                {/* Desktop sidebar expand (only when collapsed) */}
                {sidebarCollapsed && (
                    <button
                        onClick={onSidebarToggle}
                        className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
                {/* Notification bell */}
                <div ref={notifRef} className="relative">
                    <button
                        data-testid="notification-bell"
                        onClick={() => setNotifOpen(!notifOpen)}
                        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 min-w-[8px] h-2 px-1 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                    <AnimatePresence>
                        {notifOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50"
                            >
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <p className="text-sm font-semibold text-gray-900">Notifications</p>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-gray-500">No notifications</div>
                                    ) : (
                                        notifications.map((n) => (
                                            <div
                                                key={n.id}
                                                className={clsx(
                                                    'px-4 py-3 text-sm border-b border-gray-50 last:border-0',
                                                    !n.isRead && 'bg-primary-50/30'
                                                )}
                                            >
                                                <p className="text-gray-700 leading-relaxed">{n.message}</p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Profile dropdown */}
                <div ref={dropdownRef} className="relative">
                    <button
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                            <span className="text-sm font-semibold text-white">{initials}</span>
                        </div>
                        <div className="hidden md:block text-left">
                            <p className="text-sm font-medium text-gray-900 leading-tight truncate max-w-[120px]">
                                {user?.email}
                            </p>
                            <p className="text-xs text-gray-500">{user?.role}</p>
                        </div>
                        <ChevronDown className={clsx(
                            'w-4 h-4 text-gray-400 hidden md:block transition-transform',
                            dropdownOpen && 'rotate-180'
                        )} />
                    </button>

                    <AnimatePresence>
                        {dropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50"
                            >
                                <div className="px-4 py-2.5 border-b border-gray-100">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.email}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{user?.role}</p>
                                </div>
                                <button
                                    onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <UserCircle className="w-4 h-4 text-gray-400" />
                                    View Profile
                                </button>
                                <div className="border-t border-gray-100 mt-1 pt-1">
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
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
