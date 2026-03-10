'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function MicIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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

function SparkleIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

const STEPS = [
  {
    icon: <MicIcon />,
    title: 'Capture thoughts instantly',
    description:
      'Voice-first capture for ideas, reminders, errands, and obligations. Just speak — no typing, no navigation.',
  },
  {
    icon: <SparkleIcon />,
    title: 'AI organizes what you say',
    description:
      'Notes are structured, tagged, and made searchable automatically — so you can find what you need later without effort.',
  },
  {
    icon: <LocationIcon />,
    title: 'Notes return when they matter',
    description:
      'Use time and place context to surface relevant reminders. Arrive at the hardware store and see what you needed to pick up.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      complete();
    }
  }

  function complete() {
    localStorage.setItem('offload_onboarding_complete', '1');
    router.replace('/app');
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-16">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? 'w-6 h-2 bg-gray-900' : i < step ? 'w-2 h-2 bg-gray-400' : 'w-2 h-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-3xl mb-8 text-gray-600">
            {current.icon}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-4 text-balance">
            {current.title}
          </h1>
          <p className="text-base text-gray-500 leading-relaxed">{current.description}</p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleNext}
            className="w-full py-3.5 text-base font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 transition-colors"
          >
            {isLast ? 'Start using Offload' : 'Next'}
          </button>
          {!isLast && (
            <button
              onClick={complete}
              className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
