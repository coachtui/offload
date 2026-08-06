import Link from 'next/link';
import { LogoGlyph } from '@/components/ui/icons';

export default function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 bg-bg border-b border-line">
      {/* Compact enough to hold up at 360px without a hamburger */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg sm:text-xl font-bold text-ink tracking-tight hover:opacity-80 transition-opacity"
        >
          <span className="flex items-center justify-center w-7 h-7 bg-accent text-white rounded-sm">
            <LogoGlyph className="w-4 h-4" />
          </span>
          Offload
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className="px-3 sm:px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors rounded-sm"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="px-3 sm:px-4 py-2 text-sm font-semibold text-bg bg-ink rounded-sm hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
