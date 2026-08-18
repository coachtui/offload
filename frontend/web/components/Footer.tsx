import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-line px-6 py-12 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-ink tracking-tight">Offload</p>
          <p className="text-xs text-ink-faint mt-0.5">
            © {new Date().getFullYear()} AIGA LLC
          </p>
        </div>

        <nav className="flex items-center gap-6" aria-label="Footer navigation">
          <Link
            href="/privacy"
            className="text-sm text-ink-muted hover:text-ink transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-sm text-ink-muted hover:text-ink transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/support"
            className="text-sm text-ink-muted hover:text-ink transition-colors"
          >
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}
