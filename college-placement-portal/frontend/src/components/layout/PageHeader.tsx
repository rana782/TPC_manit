import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

export interface Breadcrumb {
    label: string;
    href?: string;
}

export interface LayoutContainerProps {
    children: React.ReactNode;
    className?: string;
    bleed?: boolean;
    'data-testid'?: string;
}

/** Max-width content column (Stitch-aligned). Set bleed for full-width tables. */
export function LayoutContainer({ children, className, bleed, 'data-testid': dataTestId }: LayoutContainerProps) {
    return (
        <div data-testid={dataTestId} className={clsx('w-full', !bleed && 'mx-auto max-w-7xl', className)}>
            {children}
        </div>
    );
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    breadcrumbs?: Breadcrumb[];
    actions?: React.ReactNode;
    /** Wrap in max-w-7xl for alignment with Stitch-style content columns */
    contained?: boolean;
    className?: string;
}

export default function PageHeader({
    title,
    subtitle,
    breadcrumbs,
    actions,
    contained = false,
    className,
}: PageHeaderProps) {
    const inner = (
        <div className={clsx('mb-8', className)}>
            {breadcrumbs && breadcrumbs.length > 0 && (
                <nav
                    className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"
                    aria-label="Breadcrumb"
                >
                    {breadcrumbs.map((crumb, i) => (
                        <span key={i} className="flex items-center gap-2">
                            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />}
                            {crumb.href ? (
                                <Link
                                    to={crumb.href}
                                    className="text-slate-400 transition-colors hover:text-primary-700"
                                >
                                    {crumb.label}
                                </Link>
                            ) : (
                                <span className="text-slate-800">{crumb.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p>
                    )}
                </div>
                {actions && (
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
                )}
            </div>
        </div>
    );

    if (contained) {
        return <LayoutContainer>{inner}</LayoutContainer>;
    }

    return inner;
}
