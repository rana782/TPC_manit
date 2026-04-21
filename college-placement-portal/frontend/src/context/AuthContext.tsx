import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { getViteApiOrigin } from '../utils/apiBase';

interface User {
    id: string;
    email: string;
    name?: string;
    role: string;
    isVerified?: boolean;
    verifiedAt?: string | null;
    permJobCreate?: boolean;
    permLockProfile?: boolean;
    permExportCsv?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function deriveUserFromToken(rawToken: string | null): User | null {
    if (!rawToken) return null;
    try {
        const payloadPart = rawToken.split('.')[1];
        if (!payloadPart) return null;
        const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const decoded = JSON.parse(window.atob(padded));
        const id = String(decoded?.id || decoded?.userId || decoded?.sub || '').trim();
        const email = String(decoded?.email || '').trim();
        const role = String(decoded?.role || '').trim();
        if (!id || !email || !role) return null;
        return { id, email, role };
    } catch {
        return null;
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const cachedUserRaw = localStorage.getItem('auth_user');
    let cachedUser: User | null = null;
    if (cachedUserRaw) {
        try {
            cachedUser = JSON.parse(cachedUserRaw) as User;
        } catch {
            cachedUser = null;
        }
    }

    const storedToken = localStorage.getItem('token');
    const [user, setUser] = useState<User | null>(cachedUser || deriveUserFromToken(storedToken));
    const [token, setToken] = useState<string | null>(storedToken);
    const [loading, setLoading] = useState<boolean>(true);
    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const res = await axios.get(`${getViteApiOrigin()}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 15000,
                });
                const nextUser = (res.data?.user ?? null) as User | null;
                setUser(nextUser);
                if (nextUser) {
                    localStorage.setItem('auth_user', JSON.stringify(nextUser));
                }
            } catch (error) {
                console.error('Initial token verification failed:', error);
                const status = axios.isAxiosError(error) ? error.response?.status : undefined;
                // Logout only when token is definitely invalid/expired or user no longer exists.
                if (status === 401 || status === 403 || status === 404) {
                    logout();
                } else {
                    // Transient backend/network issue: keep existing local session.
                    const stale = localStorage.getItem('auth_user');
                    if (stale) {
                        try {
                            setUser(JSON.parse(stale) as User);
                        } catch {
                            // ignore corrupt cache
                        }
                    } else {
                        const tokenUser = deriveUserFromToken(token);
                        if (tokenUser) setUser(tokenUser);
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('auth_user', JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('auth_user');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
