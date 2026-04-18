import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';

function DashboardOrRedirect() {
    const { user } = useAuth();
    if (user?.role === 'SPOC') return <Navigate to="/jobs-management" replace />;
    if (user?.role === 'COORDINATOR') return <Navigate to="/admin" replace />;
    return <Dashboard />;
}
import Resumes from './pages/Resumes';
import JobsManagement from './pages/JobsManagement';
import JobDetails from './pages/JobDetails';
import JobBoard from './pages/JobBoard';
import AdminDashboard from './pages/AdminDashboard';
import AnalyticsRedesignPage from './pages/AnalyticsRedesignPage';
import AlumniDirectoryPage from './pages/AlumniDirectoryPage';
import PlacedStudents from './pages/PlacedStudents';

/** SPOC-only: coordinators must not access job CRUD UI (sidebar + deep links). */
function JobsManagementRoute() {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (user?.role === 'COORDINATOR') return <Navigate to="/admin" replace />;
    if (user?.role !== 'SPOC') return <Navigate to="/dashboard" replace />;
    return <JobsManagement />;
}

function Home() {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role === 'SPOC') return <Navigate to="/jobs-management" replace />;
    if (user.role === 'COORDINATOR') return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
}

function App() {
    return (
        <AuthProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                    {/* Public auth routes */}
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />

                    {/* Protected routes wrapped in AppLayout */}
                    <Route element={<AppLayout />}>
                        <Route path="/dashboard" element={<DashboardOrRedirect />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/resumes" element={<Resumes />} />
                        <Route path="/jobs-management" element={<JobsManagementRoute />} />
                        <Route path="/jobs/:id/details" element={<JobDetails />} />
                        <Route path="/job-board" element={<JobBoard />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/analytics" element={<AnalyticsRedesignPage />} />
                        <Route path="/alumni" element={<AlumniDirectoryPage />} />
                        <Route path="/placed-students" element={<PlacedStudents />} />
                    </Route>
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
