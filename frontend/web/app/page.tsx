import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';
import HeroIllustration from '@/components/HeroIllustration';

// ── Inline SVG icons ──────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── How it works steps ────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: <MicIcon />,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    title: 'Capture',
    description:
      'Speak naturally and save thoughts as they happen. No typing, no navigation — just record.',
  },
  {
    step: '02',
    icon: <SparkleIcon />,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: 'Organize',
    description:
      "AI structures your notes so they're searchable and easier to act on later. Everything in one place.",
  },
  {
    step: '03',
    icon: <LocationIcon />,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: 'Resurface',
    description:
      'Relevant notes return when you reach the right place or moment. Nothing slips through.',
  },
];

// ── Use cases ─────────────────────────────────────────────────────────────

const USE_CASES = [
  {
    tag: 'Field & construction',
    title: 'For field workers',
    description:
      'Contractors, technicians, and tradespeople can capture job notes, part numbers, and reminders hands-free — without stopping work or reaching for a pen.',
  },
  {
    tag: 'Business',
    title: 'For entrepreneurs',
    description:
      'Ideas and decisions come fast. Offload them the moment they arrive so nothing valuable disappears between meetings or calls.',
  },
  {
    tag: 'Daily life',
    title: 'For busy parents',
    description:
      "Juggling schedules, errands, and obligations is hard enough. Offload keeps track so you don't have to hold it all in your head.",
  },
];

// ── Trust points ──────────────────────────────────────────────────────────

const TRUST_POINTS = [
  'Your data belongs to you',
  'We do not sell personal data',
  'AI models are never trained on your content',
  'Delete your account and data at any time',
];

const TRUST_CHIPS = [
  'Voice-first capture',
  'Context-aware reminders',
  'Built for real life',
  'Private by default',
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            {/* Text column */}
            <div className="text-center lg:text-left order-2 lg:order-1">
              {/* Pill badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-10 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                Private by default
              </div>

              <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 tracking-tight leading-[1.08] mb-6 text-balance">
                Offload what&apos;s
                <br />
                on your mind.
              </h1>

              <p className="text-xl text-gray-500 leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0">
                Capture thoughts instantly. AI organizes them. Your notes return when they matter.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-12">
                <Link
                  href="/signup"
                  className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 transition-colors"
                >
                  Get Started
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Log In
                </Link>
              </div>

              {/* Trust chips */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                {TRUST_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full"
                  >
                    <CheckIcon className="text-gray-400 flex-shrink-0" />
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Illustration column */}
            <div className="flex items-center justify-center order-1 lg:order-2">
              <div className="w-[260px] sm:w-[320px] lg:w-[480px] xl:w-[520px]">
                <HeroIllustration />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────── */}
      <section className="px-6 py-24 border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Three steps. No friction.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="relative p-7 bg-gray-50 border border-gray-200 rounded-2xl"
              >
                <span className="absolute top-5 right-5 text-xs font-bold text-gray-200 select-none">
                  {item.step}
                </span>
                <div
                  className={`inline-flex items-center justify-center w-11 h-11 ${item.iconBg} ${item.iconColor} rounded-xl mb-5`}
                >
                  {item.icon}
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Use cases
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Built for the way people actually work.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {USE_CASES.map((card) => (
              <div
                key={card.title}
                className="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm"
              >
                <span className="inline-block px-2 py-0.5 text-xs font-semibold text-gray-500 bg-gray-100 rounded-md mb-4">
                  {card.tag}
                </span>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy Trust ─────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 rounded-3xl px-8 py-16 md:px-14 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-white/10 rounded-xl mb-8">
              <ShieldIcon className="text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Your thoughts stay yours.
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-12 max-w-lg mx-auto">
              We do not sell personal data or train AI models on your content. You stay in control
              of your information.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
              {TRUST_POINTS.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl"
                >
                  <CheckIcon className="flex-shrink-0 mt-0.5 text-emerald-400" />
                  <span className="text-sm text-gray-300 leading-snug">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24 text-center border-t border-gray-100">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
            Ready to clear your head?
          </h2>
          <p className="text-gray-500 mb-10 text-lg">
            Start using Offload for free. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-flex px-8 py-3.5 text-base font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
