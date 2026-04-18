import { clsx } from 'clsx';
import { LayoutContainer } from './PageHeader';

interface ContentContainerProps {
    children: React.ReactNode;
    className?: string;
    contained?: boolean;
}

/** Optional content wrapper — AppLayout main already applies page padding. */
export default function ContentContainer({ children, className, contained = true }: ContentContainerProps) {
    const body = <div className={clsx('w-full', className)}>{children}</div>;
    if (contained) {
        return <LayoutContainer>{body}</LayoutContainer>;
    }
    return body;
}
