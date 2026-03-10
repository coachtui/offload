import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 px-6 py-12 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-gray-900 tracking-tight">Offload</p>
          <p className="text-xs text-gray-400 mt-0.5">Built by AIGA LLC</p>
        </div>

        <nav className="flex items-center gap-6" aria-label="Footer navigation">
          <Link
            href="/privacy"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Terms
          </Link>
          <a
            href="mailto:support@useoffload.app"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
