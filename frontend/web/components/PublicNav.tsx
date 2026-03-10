import Link from 'next/link';

export default function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-xl font-bold text-gray-900 tracking-tight hover:opacity-80 transition-opacity"
        >
          Offload
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors rounded-lg"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 transition-colors rounded-lg"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
