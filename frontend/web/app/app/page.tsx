'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, clearAuthToken } from '@/lib/auth';
import { apiGetMe } from '@/lib/api';
import Card from '@/components/ui/Card';
import Footer from '@/components/Footer';
import { MicIcon, AppleIcon } from '@/components/ui/icons';

type User = { id: string; email: string; name?: string };

function Spinner() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div
        className="w-5 h-5 border-2 border-line border-t-accent rounded-full animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

const FEATURES = [
  {
    title: 'Voice capture',
    description:
      'Speak a thought and Offload transcribes, structures, and stores it automatically.',
  },
  {
    title: 'Place reminders',
    description:
      'Notes resurface when you arrive at relevant locations. No manual reminder needed.',
  },
  {
    title: 'Ask Offload',
    description:
      "Search your notes with natural language or ask questions across everything you've captured.",
  },
  {
    title: 'Insights',
    description:
      "Weekly summaries show patterns and recurring themes across what you've captured.",
  },
];

export default function AppDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check onboarding — new users are sent to onboarding before arriving here
    const onboardingDone = localStorage.getItem('offload_onboarding_complete');
    if (!onboardingDone) {
      router.replace('/app/onboarding');
      return;
    }

    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    apiGetMe(token)
      .then(setUser)
      .catch(() => {
        clearAuthToken();
        router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    clearAuthToken();
    router.push('/');
  }

  if (loading) return <Spinner />;

  const firstName = user?.name?.split(' ')[0] ?? null;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-xl font-bold text-ink tracking-tight">Offload</span>
          <button
            onClick={handleLogout}
            className="text-sm text-ink-muted hover:text-ink transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-ink">
            {firstName ? `Hello, ${firstName}.` : 'Hello.'}
          </h1>
          <p className="text-sm text-ink-muted mt-1">{user?.email}</p>
        </div>

        {/* iOS App hero card */}
        <Card className="p-8 mb-6 text-center shadow-level2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent text-white rounded-md mb-5">
            <MicIcon className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Your account is ready.</h2>
          <p className="text-ink-muted text-sm mb-7 max-w-xs mx-auto leading-relaxed">
            Download the Offload iOS app to start capturing thoughts, setting place reminders, and
            using all features.
          </p>
          <div className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-bg font-semibold text-sm rounded-md cursor-default select-none">
            <AppleIcon />
            Available on the App Store
          </div>
        </Card>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h3 className="text-sm font-semibold text-ink mb-1">{f.title}</h3>
              <p className="text-xs text-ink-muted leading-relaxed">{f.description}</p>
            </Card>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
