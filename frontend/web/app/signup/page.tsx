'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRegister } from '@/lib/api';
import { setAuthToken } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Footer from '@/components/Footer';
import { MicIcon } from '@/components/ui/icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
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
    <div className="min-h-screen bg-bg flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Brand mark — mirrors the mobile login */}
          <Link href="/" className="flex flex-col items-center text-center mb-10 group">
            <span className="flex items-center justify-center w-12 h-12 bg-accent text-white rounded-md shadow-level2 mb-4 group-hover:opacity-90 transition-opacity">
              <MicIcon className="w-6 h-6" />
            </span>
            <span className="text-2xl font-bold text-ink tracking-tight">Offload</span>
            <span className="text-sm text-ink-muted mt-1">
              Say it once. It&apos;s handled.
            </span>
          </Link>

          <h1 className="text-xl font-semibold text-ink text-center mb-1">
            Create your account
          </h1>
          <p className="text-sm text-ink-muted text-center mb-8">Free to get started</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Name (optional)"
              type="text"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
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
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>
          </form>

          {/* Legal acknowledgment */}
          <p className="text-xs text-center text-ink-faint mt-4 leading-relaxed">
            By creating an account, you agree to the{' '}
            <Link href="/terms" className="underline hover:text-ink transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline hover:text-ink transition-colors">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="text-center text-sm text-ink-muted mt-6">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
