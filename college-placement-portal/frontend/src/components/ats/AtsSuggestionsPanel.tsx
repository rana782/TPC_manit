import { clsx } from 'clsx';
import { AlertCircle } from 'lucide-react';
import {
    inferIssueSeverity,
    isStructuredAtsSuggestion,
    parseAtsSuggestion,
    severityStyles,
    type IssueSeverity,
} from '../../utils/atsDisplay';

export interface AtsSuggestionsPanelProps {
    suggestions: string[];
    idPrefix: string;
    maxItems?: number;
    /** Slightly tighter typography for nested cards (e.g. application list). */
    compact?: boolean;
}

export default function AtsSuggestionsPanel({
    suggestions,
    idPrefix,
    maxItems = 8,
    compact = false,
}: AtsSuggestionsPanelProps) {
    const list = (suggestions || []).slice(0, maxItems);
    if (list.length === 0) return null;

    return (
        <div
            className={clsx(
                'rounded-xl border border-amber-100 bg-white',
                compact ? 'p-2.5' : 'p-3'
            )}
        >
            <div
                className={clsx(
                    'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2',
                    compact && 'mb-1.5'
                )}
            >
                <p
                    className={clsx(
                        'font-bold text-amber-900 flex items-center gap-1.5',
                        compact ? 'text-[11px]' : 'text-xs'
                    )}
                >
                    <AlertCircle className={clsx('shrink-0', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
                    Suggestions
                </p>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className={clsx('px-1.5 py-0.5 rounded font-semibold', severityStyles.high.badge)}>
                        High
                    </span>
                    <span className={clsx('px-1.5 py-0.5 rounded font-semibold', severityStyles.medium.badge)}>
                        Medium
                    </span>
                    <span className={clsx('px-1.5 py-0.5 rounded font-semibold', severityStyles.low.badge)}>Low</span>
                </div>
            </div>
            <ul className={clsx('space-y-3', compact && 'space-y-2')}>
                {list.map((raw, i) => {
                    const parsed = parseAtsSuggestion(raw);
                    const structured = isStructuredAtsSuggestion(raw);
                    const issueText = parsed?.issue ?? raw;
                    const sev: IssueSeverity = inferIssueSeverity(issueText);
                    const st = severityStyles[sev];
                    return (
                        <li
                            key={`${idPrefix}-${i}`}
                            className={clsx(
                                'rounded-r-lg border-l-4 pl-3 pr-2 py-2.5 shadow-sm',
                                compact && 'py-2 pl-2.5',
                                st.border,
                                st.bg
                            )}
                        >
                            {structured && parsed ? (
                                <>
                                    <p className={clsx('mb-1.5', st.issueLabel, compact ? 'text-[11px]' : 'text-xs')}>
                                        <span className="font-bold uppercase tracking-wide text-[10px] opacity-90">
                                            Issue ·{' '}
                                        </span>
                                        <span className="font-normal text-gray-900 leading-relaxed">{issueText}</span>
                                    </p>
                                    {parsed.correction && (
                                        <div
                                            className={clsx(
                                                'text-gray-800 mb-1.5',
                                                compact ? 'text-[11px]' : 'text-xs'
                                            )}
                                        >
                                            <span className="font-bold text-[10px] uppercase tracking-wide text-gray-600">
                                                Correction ·{' '}
                                            </span>
                                            <span className="leading-relaxed">{parsed.correction}</span>
                                        </div>
                                    )}
                                    {parsed.example && (
                                        <div
                                            className={clsx(
                                                'border-t border-black/5 pt-2 mt-1',
                                                compact ? 'text-[11px]' : 'text-xs'
                                            )}
                                        >
                                            <span className="font-bold text-[10px] uppercase tracking-wide text-violet-800">
                                                Example ·{' '}
                                            </span>
                                            <span className="text-gray-700 leading-relaxed not-italic block mt-0.5 pl-0 border-l-2 border-violet-200 pl-2">
                                                {parsed.example}
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p
                                    className={clsx(
                                        'text-gray-900 leading-relaxed',
                                        compact ? 'text-[11px]' : 'text-xs'
                                    )}
                                >
                                    {raw}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
