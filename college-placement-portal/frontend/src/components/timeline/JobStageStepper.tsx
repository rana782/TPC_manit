import { useMemo } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { getViteApiOrigin } from '../../utils/apiBase';

export type TimelineStage = {
    id?: string;
    name: string;
    scheduledDate?: string | Date | null;
    notes?: string | null;
    status?: string;
    attachmentPath?: string | null;
    shortlistDocPath?: string | null;
    shortlistDocTitle?: string | null;
    stageCandidateCount?: number;
};

type Props = {
    stages: TimelineStage[];
    currentStageIndex: number;
    applicationStatus?: string;
};

function formatStageDate(d: TimelineStage['scheduledDate']): string {
    if (!d) return 'TBD';
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime())
        ? 'TBD'
        : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getOutcomeNote(applicationStatus?: string): string | null {
    const s = applicationStatus?.toUpperCase() || '';
    if (s.includes('REJECT')) return 'Outcome: Rejected';
    if (s.includes('PLACED') || s.includes('ACCEPT') || s.includes('OFFER') || s.includes('SELECTED')) {
        return 'Outcome: Placed/Selected';
    }
    return null;
}

function stageDocHref(filePath: string | null | undefined): string | null {
    if (!filePath) return null;
    const origin = getViteApiOrigin().replace(/\/$/, '');
    const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return origin ? `${origin}${normalized}` : normalized;
}

export default function JobStageStepper({ stages, currentStageIndex, applicationStatus }: Props) {
    const sortedStages = useMemo(() => {
        // Assume backend returns `job.stages` already in correct SPOC order.
        // We do not re-sort when some dates are missing to avoid changing stage order.
        return [...(stages || [])];
    }, [stages]);

    const safeCurrentIndex = Math.max(0, Math.min(currentStageIndex ?? 0, Math.max(0, sortedStages.length - 1)));
    const outcomeNote = getOutcomeNote(applicationStatus);
    const lastIndex = Math.max(0, sortedStages.length - 1);

    if (!sortedStages.length) {
        return (
            <div className="p-5 rounded-xl border border-gray-200 bg-white">
                <p className="text-sm font-semibold text-gray-600">Timeline not available</p>
            </div>
        );
    }

    return (
        <div className="space-y-2" data-testid="job-stage-stepper">
            {sortedStages.map((stage, idx) => {
                const state = idx < safeCurrentIndex ? 'completed' : idx === safeCurrentIndex ? 'current' : 'pending';
                const statusLabel = state === 'completed' ? 'Completed' : state === 'current' ? 'Current' : 'Pending';
                const timestamp = formatStageDate(stage.scheduledDate);

                const isLast = idx === lastIndex;
                const showOutcome = isLast && outcomeNote;

                return (
                    <div
                        key={stage.id || `${stage.name}-${idx}`}
                        className="flex items-start gap-3 rounded-xl border border-slate-100 p-3.5 transition-colors hover:border-slate-200 hover:bg-slate-50/60"
                        aria-label={`${stage.name}, ${statusLabel}`}
                        tabIndex={0}
                        data-testid="job-stage-step"
                    >
                        <div className="relative flex-shrink-0 pt-1">
                            {idx !== lastIndex && (
                                <div className="absolute left-1/2 -translate-x-1/2 top-4 bottom-[-18px] w-px bg-gray-200" />
                            )}

                            <div
                                className={clsx(
                                    'w-8 h-8 rounded-full flex items-center justify-center border',
                                    state === 'completed' && 'bg-emerald-500 border-emerald-600 text-white',
                                    state === 'current' && 'border-transparent text-white',
                                    state === 'pending' && 'bg-white border-slate-200 text-slate-400'
                                )}
                                style={
                                    state === 'current'
                                        ? { backgroundImage: 'linear-gradient(to right, #0f172a, #0ea5a4)' }
                                        : undefined
                                }
                            >
                                {state === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                ) : state === 'current' ? (
                                    <ChevronRight className="w-4 h-4" />
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full bg-slate-300" style={{ backgroundColor: '#cbd5f5' }} />
                                )}
                            </div>
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p
                                    data-testid="job-stage-name"
                                    className={clsx('text-sm font-bold truncate', state === 'pending' ? 'text-gray-600' : 'text-gray-900')}
                                >
                                    {stage.name}
                                </p>
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                    {Number(stage.stageCandidateCount || 0)} candidates
                                </span>
                            </div>
                            <p data-testid="job-stage-status-line" className="mt-1 text-xs text-gray-500">
                                {timestamp} - {statusLabel}
                            </p>
                            {stage.notes ? (
                                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{stage.notes}</p>
                            ) : null}
                            {(() => {
                                const shortlistHref = stageDocHref(stage.shortlistDocPath);
                                const attachmentHref = stageDocHref(stage.attachmentPath);
                                if (!shortlistHref && !attachmentHref) return null;
                                return (
                                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                        {shortlistHref && (
                                            <a
                                                href={shortlistHref}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-800 hover:bg-primary-100"
                                            >
                                                {stage.shortlistDocTitle?.trim() || 'Shortlist PDF'}
                                            </a>
                                        )}
                                        {attachmentHref && (
                                            <a
                                                href={attachmentHref}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                Stage attachment
                                            </a>
                                        )}
                                    </div>
                                );
                            })()}
                            {showOutcome && (
                                <p className="text-xs font-semibold text-gray-700 mt-1">{outcomeNote}</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

