'use client';

import Link from 'next/link';
import Button, { buttonClasses } from '@/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">Error</p>
      <h1 className="text-3xl font-bold text-ink tracking-tight mb-3">Something went wrong</h1>
      <p className="text-ink-muted mb-8 max-w-sm">
        An unexpected error occurred. You can try again, or head back home.
      </p>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="md" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonClasses('tonal', 'md')}>
          Back to Offload
        </Link>
      </div>
    </div>
  );
}
