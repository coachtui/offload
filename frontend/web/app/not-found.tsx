import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">404</p>
      <h1 className="text-3xl font-bold text-ink tracking-tight mb-3">Page not found</h1>
      <p className="text-ink-muted mb-8 max-w-sm">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link href="/" className={buttonClasses('primary', 'md')}>
        Back to Offload
      </Link>
    </div>
  );
}
