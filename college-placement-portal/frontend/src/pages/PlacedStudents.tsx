import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Unlock } from 'lucide-react';

interface PlacedStudent {
  id: string;
  placementRecordId: string;
  name: string;
  branch: string;
  companyName: string;
  role: string;
  placedAt: string;
  isLocked: boolean;
  email: string;
}

export default function PlacedStudents() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<PlacedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchPlaced = async () => {
    try {
      const res = await axios.get(`${getViteApiBase()}/profile-lock/placed`, { headers });
      if (res.data?.success) setRows(res.data.students || []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load placed students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (!['SPOC', 'COORDINATOR'].includes(user?.role || '')) {
      setError('Access denied');
      setLoading(false);
      return;
    }
    fetchPlaced();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  const unplace = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to mark this student as unplaced?')) return;
    setPendingId(studentId);
    setMessage('');
    setError('');
    try {
      const res = await axios.put(`${getViteApiBase()}/profile-lock/${studentId}/unplace`, {}, { headers });
      if (res.data?.success) {
        setRows((prev) => prev.filter((r) => r.id !== studentId));
        setMessage('Student marked as unplaced successfully.');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to mark student as unplaced');
    } finally {
      setPendingId('');
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Placed Students</h1>
        <Link to={user?.role === 'COORDINATOR' ? '/admin' : '/analytics'} className="inline-flex items-center gap-1 text-sm font-bold text-primary-700">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      {message && <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}
      {error && <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Branch</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Company</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm font-bold text-gray-400">No placed students found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.placementRecordId}>
                <td className="px-4 py-3">
                  <p className="text-sm font-bold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.email}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.branch}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.companyName}</td>
                <td className="px-4 py-3">
                  <button
                    disabled={pendingId === r.id}
                    onClick={() => unplace(r.id)}
                    className="inline-flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-60"
                  >
                    {pendingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                    Mark as Unplaced
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

