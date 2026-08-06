'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { MicIcon, SparkleIcon, LocationIcon } from '@/components/ui/icons';

const STEPS = [
  {
    icon: <MicIcon className="w-8 h-8" strokeWidth={1.5} />,
    // Coral is reserved for capture/record imagery — matches the landing page
    iconBg: 'bg-record-tint',
    iconColor: 'text-record',
    title: 'Capture thoughts instantly',
    description:
      'Voice-first capture for ideas, reminders, errands, and obligations. Just speak — no typing, no navigation.',
  },
  {
    icon: <SparkleIcon className="w-8 h-8" strokeWidth={1.5} />,
    iconBg: 'bg-accent-tint',
    iconColor: 'text-accent',
    title: 'AI organizes what you say',
    description:
      'Notes are structured, tagged, and made searchable automatically — so you can find what you need later without effort.',
  },
  {
    icon: <LocationIcon className="w-8 h-8" strokeWidth={1.5} />,
    iconBg: 'bg-accent-tint',
    iconColor: 'text-accent',
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
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-16">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 h-2 bg-accent'
                  : i < step
                    ? 'w-2 h-2 bg-accent-line'
                    : 'w-2 h-2 bg-line-strong'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-14">
          <div
            className={`inline-flex items-center justify-center w-20 h-20 ${current.iconBg} ${current.iconColor} rounded-lg mb-8`}
          >
            {current.icon}
          </div>
          <h1 className="text-2xl font-bold text-ink tracking-tight mb-4 text-balance">
            {current.title}
          </h1>
          <p className="text-base text-ink-muted leading-relaxed">{current.description}</p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button variant="primary" size="lg" onClick={handleNext} className="w-full">
            {isLast ? 'Start using Offload' : 'Next'}
          </Button>
          {!isLast && (
            <Button variant="ghost" size="md" onClick={complete} className="w-full">
              Skip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
