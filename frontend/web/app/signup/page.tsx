'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRegister } from '@/lib/api';
import { setAuthToken } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRegister({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      setAuthToken(data.accessToken);
      // New users go to onboarding; localStorage flag not set yet
      router.push('/app/onboarding');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
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
          Create your account
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">Free to get started</p>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <input
            type="text"
            placeholder="Name (optional)"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3.5 text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 transition-shadow"
          />
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="w-full px-4 py-3.5 text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 transition-shadow"
          />
          <input
            type="password"
            placeholder="Confirm password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        {/* Legal acknowledgment */}
        <p className="text-xs text-center text-gray-400 mt-4 leading-relaxed">
          By creating an account, you agree to the{' '}
          <Link href="/terms" className="underline hover:text-gray-600 transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-gray-600 transition-colors">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-gray-900 hover:underline">
            Sign in
          </Link>
        </p>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 mt-10">
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
