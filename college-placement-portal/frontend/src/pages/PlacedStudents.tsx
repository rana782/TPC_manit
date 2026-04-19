import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getViteApiBase } from '../utils/apiBase';
import { AlertCircle, CheckCircle2, Loader2, Unlock } from 'lucide-react';
import PageHeader, { LayoutContainer } from '../components/layout/PageHeader';
import ConfirmModal from '../components/ui/ConfirmModal';

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
  const [confirmUnplaceId, setConfirmUnplaceId] = useState<string | null>(null);
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

  if (loading) {
    return (
      <LayoutContainer className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-slate-100" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
      </LayoutContainer>
    );
  }

  return (
    <>
      <LayoutContainer className="space-y-6">
        <PageHeader
          title="Placed students"
          subtitle={`${rows.length} student${rows.length !== 1 ? 's' : ''} placed this cycle`}
          breadcrumbs={[{ label: 'Placed students' }]}
        />

        {/* Success/Error messages */}
        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {message}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Empty state */}
        {rows.length === 0 && !error ? (
          <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="font-semibold text-slate-800">No placed students yet</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Students will appear here once they have been marked as placed through the applicant pipeline.
            </p>
          </div>
        ) : (
          /* Table */
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">Student</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">Branch</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">Company</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 hidden md:table-cell">Role</th>
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 hidden lg:table-cell">Placed on</th>
                    <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.branch || '—'}</td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-900">{row.companyName}</span>
                      </td>
                      <td className="hidden px-5 py-4 text-slate-600 md:table-cell">{row.role || '—'}</td>
                      <td className="hidden px-5 py-4 text-slate-500 lg:table-cell">
                        {row.placedAt ? new Date(row.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          disabled={pendingId === row.id}
                          onClick={() => setConfirmUnplaceId(row.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {pendingId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                          Unplace
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </LayoutContainer>

      <ConfirmModal
        open={confirmUnplaceId !== null}
        title="Mark student as unplaced?"
        description="This will remove the placement record and unlock the student's profile. This action cannot be undone."
        confirmLabel="Yes, unplace"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (confirmUnplaceId) unplace(confirmUnplaceId);
          setConfirmUnplaceId(null);
        }}
        onCancel={() => setConfirmUnplaceId(null)}
      />
    </>
  );
}
