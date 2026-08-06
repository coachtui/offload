import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Deep Lagoon surface card: white surface, hairline border, soft shadow. */
export default function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('bg-surface border border-line rounded-lg shadow-level1 p-6', className)}>
      {children}
    </div>
  );
}
