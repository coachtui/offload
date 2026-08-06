'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiLogin } from '@/lib/api';
import { setAuthToken } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Footer from '@/components/Footer';
import { LogoGlyph } from '@/components/ui/icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

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
    <div className="min-h-screen bg-bg flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Brand mark — mirrors the mobile login */}
          <Link href="/" className="flex flex-col items-center text-center mb-10 group">
            <span className="flex items-center justify-center w-12 h-12 bg-accent text-white rounded-md shadow-level2 mb-4 group-hover:opacity-90 transition-opacity">
              <LogoGlyph className="w-7 h-7" />
            </span>
            <span className="text-2xl font-bold text-ink tracking-tight">Offload</span>
            <span className="text-sm text-ink-muted mt-1">
              Say it once. It&apos;s handled.
            </span>
          </Link>

          <h1 className="text-xl font-semibold text-ink text-center mb-1">Sign in</h1>
          <p className="text-sm text-ink-muted text-center mb-8">Welcome back</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            {error && (
              <div
                role="alert"
                className="text-sm text-danger bg-danger-tint border border-danger-line rounded-md px-4 py-3"
              >
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-ink-muted mt-6">
            No account?{' '}
            <Link href="/signup" className="font-semibold text-accent hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </main>

      <Footer />
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
