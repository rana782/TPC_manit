import { useMemo } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export type TimelineStage = {
    id?: string;
    name: string;
    scheduledDate?: string | Date | null;
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
                        className="flex items-start gap-3 rounded-xl p-3 hover:bg-gray-50 transition-colors"
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
                            <p
                                data-testid="job-stage-name"
                                className={clsx('text-sm font-bold truncate', state === 'pending' ? 'text-gray-600' : 'text-gray-900')}
                            >
                                {stage.name}
                            </p>
                            <p data-testid="job-stage-status-line" className="text-xs text-gray-500 mt-1">
                                {timestamp} - {statusLabel}
                            </p>
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

