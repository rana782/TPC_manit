import { clsx } from 'clsx';

interface ContentContainerProps {
    children: React.ReactNode;
    className?: string;
}

export default function ContentContainer({ children, className }: ContentContainerProps) {
    return (
        <div
            className={clsx(
                'flex-1 overflow-y-auto p-6 lg:p-8',
                className
            )}
        >
            {children}
        </div>
    );
}
