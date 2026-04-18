import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import {
    ChevronDown,
    ChevronUp,
    Upload,
    Lock,
    Unlock,
    UserMinus,
    FileText,
    ExternalLink,
    X,
    Trash2,
} from 'lucide-react';
import { getViteApiOrigin } from '../../utils/apiBase';

export interface PipelineStudent {
    id: string;
    firstName: string;
    lastName: string;
    scholarNo: string;
    branch?: string | null;
    isLocked?: boolean;
    linkedin?: string | null;
    photoPath?: string | null;
}

/** Fields used to resolve timeline column index (matches job application shape). */
export interface PipelineApplicantLike {
    id: string;
    status: string;
    atsScore: number;
    currentStageIndex?: number;
    currentStageId?: string | null;
}

export interface PipelineApplication extends PipelineApplicantLike {
    student: PipelineStudent;
}

export interface PipelineStage {
    id: string;
    name: string;
    scheduledDate: string;
    status?: string;
    shortlistDocPath?: string | null;
    shortlistDocTitle?: string | null;
    attachmentPath?: string | null;
    notes?: string | null;
}

function stageDocHref(path: string | null | undefined): string {
    if (!path) return '#';
    if (path.startsWith('http')) return path;
    const o = getViteApiOrigin();
    return o ? `${o}${path}` : path;
}

export interface PipelineColumn {
    stage: PipelineStage;
    colIdx: number;
    apps: PipelineApplication[];
}

export interface ApplicantPipelineProps {
    columns: PipelineColumn[];
    orderedTimeline: PipelineStage[];
    selectedStageId: string | null;
    onStageHeaderClick: (stageId: string) => void;
    selectedStudentIds: string[];
    onToggleStudent: (studentId: string) => void;
    rowActionLoading: string | null;
    isPlaced: (status: string) => boolean;
    finalStageIndex: number;
    columnIndexForApplicant: (app: PipelineApplicantLike, ordered: ReadonlyArray<{ id: string }>) => number;
    moveOneStudent: (studentId: string, direction: 'next' | 'prev') => void;
    dropOneStudent: (studentId: string) => void;
    unplaceOneStudent: (studentId: string, e?: React.MouseEvent) => void;
    openLockModal: (studentId: string, isLocked: boolean, e?: React.MouseEvent) => void;
    onUploadShortlistDoc?: (stageId: string, file: File, displayTitle?: string) => Promise<void>;
    onRemoveShortlistDoc?: (stageId: string) => Promise<void>;
    uploadingStageId?: string | null;
    shortlistError?: string;
    shortlistMessage?: string;
}

export default function ApplicantPipeline({
    columns,
    orderedTimeline,
    selectedStageId,
    onStageHeaderClick,
    selectedStudentIds,
    onToggleStudent,
    rowActionLoading,
    isPlaced,
    finalStageIndex,
    columnIndexForApplicant,
    moveOneStudent,
    dropOneStudent,
    unplaceOneStudent,
    openLockModal,
    onUploadShortlistDoc,
    onRemoveShortlistDoc,
    uploadingStageId,
    shortlistError,
    shortlistMessage,
}: ApplicantPipelineProps) {
    const totalInPipeline = columns.reduce((n, c) => n + c.apps.length, 0);

    const [pdfModalStageId, setPdfModalStageId] = useState<string | null>(null);
    const [pdfModalKey, setPdfModalKey] = useState(0);
    const [pdfTitle, setPdfTitle] = useState('');
    const [pdfFile, setPdfFile] = useState<File | null>(null);

    const pdfModalStageName =
        pdfModalStageId != null
            ? columns.find((c) => c.stage.id === pdfModalStageId)?.stage.name ?? 'Stage'
            : '';

    const closePdfModal = useCallback(() => {
        setPdfModalStageId(null);
        setPdfTitle('');
        setPdfFile(null);
    }, []);

    useEffect(() => {
        if (!pdfModalStageId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closePdfModal();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pdfModalStageId, closePdfModal]);

    const submitPdfModal = async () => {
        if (!pdfModalStageId || !pdfFile || !onUploadShortlistDoc) return;
        await onUploadShortlistDoc(pdfModalStageId, pdfFile, pdfTitle.trim() || undefined);
        closePdfModal();
    };

    const shortlistLinkLabel = (stage: PipelineStage) => {
        const t = stage.shortlistDocTitle?.trim();
        return t && t.length > 0 ? t : 'Shortlist PDF';
    };

    const pdfModal =
        pdfModalStageId &&
        createPortal(
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4"
                role="presentation"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) closePdfModal();
                }}
            >
                <div
                    className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pdf-upload-title"
                >
                    <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                            <h4 id="pdf-upload-title" className="text-sm font-bold text-slate-900">
                                Attach shortlist PDF
                            </h4>
                            <p className="mt-0.5 text-xs text-slate-500">{pdfModalStageName}</p>
                        </div>
                        <button
                            type="button"
                            onClick={closePdfModal}
                            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        Display name <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <input
                        type="text"
                        value={pdfTitle}
                        onChange={(e) => setPdfTitle(e.target.value)}
                        placeholder="e.g. Round 1 shortlist"
                        maxLength={200}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                    <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        PDF file
                    </label>
                    <input
                        key={pdfModalKey}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            setPdfFile(f);
                            if (f && !pdfTitle.trim()) {
                                const base = f.name.replace(/\.pdf$/i, '').trim();
                                if (base) setPdfTitle(base.slice(0, 200));
                            }
                        }}
                        className="mt-1 block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-primary-800"
                    />
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={closePdfModal}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={!pdfFile || uploadingStageId === pdfModalStageId}
                            onClick={() => void submitPdfModal()}
                            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {uploadingStageId === pdfModalStageId ? 'Uploading…' : 'Upload'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );

    return (
        <div
            className="border-t border-slate-200 bg-gradient-to-b from-slate-50/80 to-white px-3 pb-5 pt-4 sm:px-4"
            data-testid="applicants-kanban"
        >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h3 className="text-sm font-bold text-slate-900">Applicant pipeline</h3>
                    <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
                        Stage columns mirror your hiring pipeline. Click a header to filter the table above; use arrows to move
                        candidates. Optionally attach a shortlist PDF per stage with a custom display name.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {totalInPipeline} in pipeline
                    </span>
                    <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {columns.length} active stage{columns.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {(shortlistError || shortlistMessage) && (
                <div className="mb-3 space-y-1">
                    {shortlistError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                            {shortlistError}
                        </p>
                    )}
                    {shortlistMessage && (
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                            {shortlistMessage}
                        </p>
                    )}
                </div>
            )}

            {columns.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    No students are assigned to a timeline stage yet.
                </p>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-1 pt-1 [scrollbar-gutter:stable] snap-x snap-mandatory">
                    {columns.map(({ stage, colIdx, apps }) => {
                        const busy = uploadingStageId === stage.id;
                        const idxLabel = colIdx + 1;

                        return (
                            <div
                                key={stage.id}
                                data-testid={`stage-column-${stage.id}`}
                                className={clsx(
                                    'flex w-[min(100%,20rem)] shrink-0 snap-start flex-col rounded-xl border bg-white shadow-sm transition-shadow',
                                    selectedStageId === stage.id
                                        ? 'border-primary-300 ring-2 ring-primary-200/80'
                                        : 'border-slate-200 hover:border-slate-300'
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => onStageHeaderClick(stage.id)}
                                    className="flex w-full flex-col gap-1 border-b border-slate-100 bg-slate-50/90 px-3 py-3 text-left transition-colors hover:bg-slate-100/90"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-slate-200/80 px-1.5 text-[10px] font-bold text-slate-600">
                                            {idxLabel}
                                        </span>
                                    </div>
                                    <span
                                        className="text-sm font-bold leading-snug text-slate-900"
                                        data-testid="timeline-stage-title"
                                    >
                                        {stage.name}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                        <span className="font-semibold text-slate-700 tabular-nums">{apps.length}</span>
                                        <span>candidates</span>
                                        <span className="text-slate-300">·</span>
                                        <time dateTime={stage.scheduledDate}>
                                            {new Date(stage.scheduledDate).toLocaleDateString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                        </time>
                                    </div>
                                    {selectedStageId === stage.id && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                                            Filtering table
                                        </span>
                                    )}
                                </button>

                                <div className="space-y-2 border-b border-slate-100 bg-white px-2.5 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            disabled={busy || !onUploadShortlistDoc}
                                            onClick={() => {
                                                setPdfTitle('');
                                                setPdfFile(null);
                                                setPdfModalKey((k) => k + 1);
                                                setPdfModalStageId(stage.id);
                                            }}
                                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:border-primary-300 hover:bg-primary-50/50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Upload className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                                            Upload PDF
                                        </button>
                                    </div>
                                    {(stage.shortlistDocPath || stage.attachmentPath) && (
                                        <div className="flex flex-col gap-1.5">
                                            {stage.shortlistDocPath && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <a
                                                        href={stageDocHref(stage.shortlistDocPath)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold text-primary-700 hover:underline"
                                                    >
                                                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                                                        <span className="truncate">{shortlistLinkLabel(stage)}</span>
                                                    </a>
                                                    {onRemoveShortlistDoc && (
                                                        <button
                                                            type="button"
                                                            title="Remove PDF from this stage"
                                                            disabled={busy}
                                                            onClick={() => void onRemoveShortlistDoc(stage.id)}
                                                            className="inline-flex items-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <Trash2 className="h-3 w-3" aria-hidden />
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {stage.attachmentPath && (
                                                <a
                                                    href={stageDocHref(stage.attachmentPath)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-700 hover:underline"
                                                >
                                                    <FileText className="h-3 w-3" aria-hidden />
                                                    Attachment
                                                </a>
                                            )}
                                        </div>
                                    )}
                                    {busy && (
                                        <p className="text-[10px] font-medium text-slate-500">Working…</p>
                                    )}
                                </div>

                                <div className="flex max-h-[min(52vh,28rem)] flex-col gap-2 overflow-y-auto px-2 py-2">
                                    {apps.length === 0 ? (
                                        <p className="px-1 py-4 text-center text-[11px] text-slate-400">No candidates</p>
                                    ) : (
                                        apps.map((app) => {
                                            const idx = columnIndexForApplicant(app, orderedTimeline);
                                            const busyRow = rowActionLoading === app.student.id;
                                            const placed = isPlaced(app.status);
                                            const selected = selectedStudentIds.includes(app.student.id);

                                            return (
                                                <div
                                                    key={app.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onToggleStudent(app.student.id)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            onToggleStudent(app.student.id);
                                                        }
                                                    }}
                                                    data-testid="applicant-row"
                                                    className={clsx(
                                                        'rounded-lg border p-2.5 text-left shadow-sm transition-colors',
                                                        selected
                                                            ? 'border-primary-300 bg-primary-50/40'
                                                            : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/80'
                                                    )}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-semibold text-slate-900">
                                                                {app.student.firstName} {app.student.lastName}
                                                            </p>
                                                            <p className="truncate text-[11px] text-slate-500">
                                                                {app.student.scholarNo}
                                                                {app.student.branch?.trim() ? ` · ${app.student.branch.trim()}` : ''}
                                                            </p>
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() => onToggleStudent(app.student.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                                            aria-label={`Select ${app.student.firstName} ${app.student.lastName}`}
                                                        />
                                                    </div>

                                                    <div
                                                        className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            type="button"
                                                            title={idx <= 0 ? 'Unassign from timeline' : 'Previous stage'}
                                                            disabled={busyRow || placed || idx < 0}
                                                            onClick={() => moveOneStudent(app.student.id, 'prev')}
                                                            className="rounded-md p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                                                        >
                                                            <ChevronUp className="h-4 w-4" aria-hidden />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Next stage"
                                                            disabled={busyRow || placed || idx >= finalStageIndex}
                                                            onClick={() => moveOneStudent(app.student.id, 'next')}
                                                            className="rounded-md p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                                                        >
                                                            <ChevronDown className="h-4 w-4" aria-hidden />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Remove from timeline"
                                                            disabled={busyRow || placed}
                                                            onClick={() => dropOneStudent(app.student.id)}
                                                            className="rounded-md p-1 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                                        >
                                                            <UserMinus className="h-4 w-4" aria-hidden />
                                                        </button>
                                                        {placed && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={busyRow}
                                                                    onClick={(e) => unplaceOneStudent(app.student.id, e)}
                                                                    className="ml-auto inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                                                                >
                                                                    <Unlock className="h-3 w-3" aria-hidden />
                                                                    Unplace
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) =>
                                                                        openLockModal(app.student.id, !!app.student.isLocked, e)
                                                                    }
                                                                    className={clsx(
                                                                        'inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] font-bold',
                                                                        app.student.isLocked
                                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                                                            : 'border-red-200 bg-red-50 text-red-800'
                                                                    )}
                                                                >
                                                                    <Lock className="h-3 w-3" aria-hidden />
                                                                    {app.student.isLocked ? 'Unlock' : 'Lock'}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {pdfModal}
        </div>
    );
}
