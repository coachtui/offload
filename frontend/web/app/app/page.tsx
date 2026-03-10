'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, clearAuthToken } from '@/lib/auth';
import { apiGetMe } from '@/lib/api';

type User = { id: string; email: string; name?: string };

function Spinner() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
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
      'Search your notes with natural language or ask questions across everything you've captured.',
  },
  {
    title: 'Insights',
    description:
      'Weekly summaries show patterns and recurring themes across what you've captured.',
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900 tracking-tight">Offload</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-gray-900">
            {firstName ? `Hello, ${firstName}.` : 'Hello.'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
        </div>

        {/* iOS App hero card */}
        <div className="bg-gray-900 rounded-2xl p-8 mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-5">
            <MicIcon />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Your account is ready.</h2>
          <p className="text-gray-400 text-sm mb-7 max-w-xs mx-auto leading-relaxed">
            Download the Offload iOS app to start capturing thoughts, setting place reminders, and
            using all features.
          </p>
          <div className="inline-flex items-center gap-2 px-5 py-3 bg-white text-gray-900 font-semibold text-sm rounded-xl cursor-default select-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Available on the App Store
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-5 bg-white border border-gray-200 rounded-xl">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-5 mt-14">
          <a
            href="/privacy"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Privacy
          </a>
          <span className="text-gray-200 text-xs">·</span>
          <a
            href="/terms"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Terms
          </a>
          <span className="text-gray-200 text-xs">·</span>
          <a
            href="mailto:support@useoffload.app"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Contact
          </a>
        </div>
      </main>
    </div>
  );
}
