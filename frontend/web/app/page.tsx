import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';
import HeroIllustration from '@/components/HeroIllustration';
import { buttonClasses } from '@/components/ui/Button';
import { MicIcon, SparkleIcon, LocationIcon, ShieldIcon, CheckIcon } from '@/components/ui/icons';

// ── How it works steps ────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: <MicIcon />,
    // Coral is reserved for capture/record imagery — mirrors the mobile app
    iconBg: 'bg-record-tint',
    iconColor: 'text-record',
    title: 'Capture',
    description:
      'Speak naturally and save thoughts as they happen. No typing, no navigation — just record.',
  },
  {
    step: '02',
    icon: <SparkleIcon />,
    iconBg: 'bg-accent-tint',
    iconColor: 'text-accent',
    title: 'Organize',
    description:
      "AI structures your notes so they're searchable and easier to act on later. Everything in one place.",
  },
  {
    step: '03',
    icon: <LocationIcon />,
    iconBg: 'bg-accent-tint',
    iconColor: 'text-accent',
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
    <div className="min-h-screen bg-bg flex flex-col">
      <PublicNav />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            {/* Text column */}
            <div className="text-center lg:text-left order-2 lg:order-1">
              {/* Pill badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-10 text-xs font-medium text-accent bg-accent-tint border border-accent-line rounded-full">
                <span className="w-1.5 h-1.5 bg-accent rounded-full" aria-hidden="true" />
                Private by default
              </div>

              <h1 className="text-5xl sm:text-6xl font-bold text-ink tracking-tight leading-[1.08] mb-6 text-balance">
                Offload what&apos;s
                <br />
                on your mind.
              </h1>

              <p className="text-xl text-ink-muted leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0">
                Capture thoughts instantly. AI organizes them. Your notes return when they matter.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-12">
                <Link href="/signup" className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
                  Get Started
                </Link>
                <Link href="/login" className={buttonClasses('tonal', 'lg', 'w-full sm:w-auto')}>
                  Log In
                </Link>
              </div>

              {/* Trust chips */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                {TRUST_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-muted bg-surface border border-line rounded-full"
                  >
                    <CheckIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" strokeWidth={2.5} />
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Hero illustration — signal → structure → memory */}
            <div className="flex items-center justify-center order-1 lg:order-2">
              <HeroIllustration className="w-full max-w-[320px] sm:max-w-[420px] lg:max-w-[520px]" />
            </div>

          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────── */}
      <section className="px-6 py-24 border-t border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              Three steps. No friction.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="relative p-7 bg-surface border border-line rounded-lg shadow-level1"
              >
                <span className="absolute top-5 right-5 text-xs font-bold text-line-strong select-none">
                  {item.step}
                </span>
                <div
                  className={`inline-flex items-center justify-center w-11 h-11 ${item.iconBg} ${item.iconColor} rounded-md mb-5`}
                >
                  {item.icon}
                </div>
                <h3 className="text-base font-semibold text-ink mb-2">{item.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24 bg-surface-muted border-y border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
              Use cases
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              Built for the way people actually work.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {USE_CASES.map((card) => (
              <div
                key={card.title}
                className="p-6 bg-surface border border-line rounded-lg shadow-level1"
              >
                <span className="inline-block px-2.5 py-0.5 text-xs font-semibold text-accent bg-accent-tint border border-accent-line rounded-full mb-4">
                  {card.tag}
                </span>
                <h3 className="text-base font-semibold text-ink mb-2">{card.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy Trust ─────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Fixed deep-lagoon panel — deliberately dark in both schemes */}
          <div className="bg-[#17211E] rounded-xl px-8 py-16 md:px-14 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-white/10 rounded-md mb-8">
              <ShieldIcon className="text-[#53B8A5]" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Your thoughts stay yours.
            </h2>
            <p className="text-[#9BA6A0] text-lg leading-relaxed mb-12 max-w-lg mx-auto">
              We do not sell personal data or train AI models on your content. You stay in control
              of your information.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
              {TRUST_POINTS.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-md"
                >
                  <CheckIcon
                    className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#53B8A5]"
                    strokeWidth={2.5}
                  />
                  <span className="text-sm text-[#C3CBC5] leading-snug">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24 text-center border-t border-line">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight mb-4">
            Ready to clear your head?
          </h2>
          <p className="text-ink-muted mb-10 text-lg">
            Start using Offload for free. No credit card required.
          </p>
          <Link href="/signup" className={buttonClasses('primary', 'lg')}>
            Get Started Free
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
