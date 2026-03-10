'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiLogin } from '@/lib/api';
import { setAuthToken } from '@/lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') ?? '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(email.trim(), password);
      setAuthToken(data.accessToken);
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <Link href="/" className="block text-center mb-10 group">
          <span className="text-2xl font-bold text-gray-900 tracking-tight group-hover:opacity-70 transition-opacity">
            Offload
          </span>
        </Link>

        <h1 className="text-xl font-semibold text-gray-900 text-center mb-1">
          Sign in
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">Welcome back</p>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="w-full px-4 py-3.5 text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 transition-shadow"
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="w-full px-4 py-3.5 text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 transition-shadow"
          />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 text-base font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          No account?{' '}
          <Link href="/signup" className="font-semibold text-gray-900 hover:underline">
            Sign up
          </Link>
        </p>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 mt-12">
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Privacy
          </Link>
          <span className="text-gray-200">·</span>
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Terms
          </Link>
          <span className="text-gray-200">·</span>
          <a
            href="mailto:support@useoffload.app"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
