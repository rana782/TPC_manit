import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { clsx } from 'clsx';

type Props = {
    positiveFeatures: string[];
    negativeFeatures: string[];
    /** Table rows need tighter spacing and smaller type */
    compact?: boolean;
    /** Truncate long theme text with ellipsis (card/table layouts) */
    lineClamp?: 2 | 3;
};

/**
 * One thumbs-up row with all positive aspects; one thumbs-down row with all negative aspects.
 */
export default function CompanySentimentSummary({
    positiveFeatures,
    negativeFeatures,
    compact,
    lineClamp,
}: Props) {
    if (positiveFeatures.length === 0 && negativeFeatures.length === 0) return null;

    const textPos = compact ? 'text-[10px]' : 'text-[11px]';
    const iconSm = compact ? 'w-3 h-3' : 'w-4 h-4';
    const iconBox = compact ? 'h-6 w-6 rounded-md' : 'h-7 w-7 rounded-lg';
    const pad = compact ? 'px-2 py-1.5' : 'px-3 py-2';
    const gap = compact ? 'gap-1.5' : 'gap-2.5';
    const stack = compact ? 'mt-1 space-y-1' : 'mt-2 space-y-2';

    const clampClass =
        lineClamp === 2 ? 'line-clamp-2' : lineClamp === 3 ? 'line-clamp-3' : '';

    return (
        <div className={clsx(stack, 'min-w-0 max-w-full')} aria-label="Company review themes">
            {positiveFeatures.length > 0 && (
                <div
                    className={clsx(
                        'flex min-w-0 max-w-full items-start rounded-xl border bg-gradient-to-br from-emerald-50/90 to-emerald-50/40 border-emerald-100/90 shadow-sm',
                        pad,
                        gap
                    )}
                >
                    <div
                        className={clsx(
                            'flex shrink-0 items-center justify-center bg-white/80 text-emerald-600 shadow-sm ring-1 ring-emerald-100/80',
                            iconBox
                        )}
                    >
                        <ThumbsUp className={clsx(iconSm)} strokeWidth={2.25} aria-hidden />
                    </div>
                    <p
                        className={clsx(
                            'min-w-0 flex-1 break-words leading-relaxed text-emerald-950/90',
                            textPos,
                            'font-medium',
                            clampClass
                        )}
                    >
                        {positiveFeatures.join(' · ')}
                    </p>
                </div>
            )}
            {negativeFeatures.length > 0 && (
                <div
                    className={clsx(
                        'flex min-w-0 max-w-full items-start rounded-xl border bg-gradient-to-br from-red-50/90 to-red-50/40 border-red-100/90 shadow-sm',
                        pad,
                        gap
                    )}
                >
                    <div
                        className={clsx(
                            'flex shrink-0 items-center justify-center bg-white/80 text-red-600 shadow-sm ring-1 ring-red-100/80',
                            iconBox
                        )}
                    >
                        <ThumbsDown className={clsx(iconSm)} strokeWidth={2.25} aria-hidden />
                    </div>
                    <p
                        className={clsx(
                            'min-w-0 flex-1 break-words leading-relaxed text-red-950/90',
                            textPos,
                            'font-medium',
                            clampClass
                        )}
                    >
                        {negativeFeatures.join(' · ')}
                    </p>
                </div>
            )}
        </div>
    );
}
