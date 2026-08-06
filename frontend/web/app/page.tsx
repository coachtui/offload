import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';
import {
  MicIcon,
  LocationIcon,
  ShieldIcon,
  CheckIcon,
  AppleIcon,
  LogoGlyph,
  LogoMark,
} from '@/components/ui/icons';
import HeroStrands from '@/components/marketing/HeroStrands';
import PhoneRecord from '@/components/marketing/PhoneRecord';
import PhoneLock from '@/components/marketing/PhoneLock';
import PhoneHome from '@/components/marketing/PhoneHome';
import PhoneNotes from '@/components/marketing/PhoneNotes';

// ── How it works — the logo story in three steps ─────────────────────────

/** Strands + dots only — thoughts in the open, before the vessel. */
function StrandsGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={5.5}
      strokeLinecap="round"
      aria-hidden
      className={props.className}
    >
      <g transform="translate(10 24)">
        <circle cx="12" cy="14" r="3.5" fill="currentColor" stroke="none" />
        <circle cx="22" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <path d="M22 20 C36 14 40 26 54 22" />
        <path d="M34 32 C46 27 50 36 62 32" />
      </g>
    </svg>
  );
}

const HOW_IT_WORKS = [
  {
    icon: <StrandsGlyph className="w-7 h-7" />,
    title: 'Just talk',
    description:
      'Hit record and say everything on your mind — no structure, no order, no typing.',
  },
  {
    icon: <LogoMark className="w-7 h-7" />,
    title: 'Offload it',
    description:
      'Offload catches the stream and splits it into separate notes, each filed under the right category.',
  },
  {
    icon: <LogoGlyph className="w-7 h-7" />,
    title: 'Find it organized',
    description:
      'Open the app to tidy, searchable notes — resurfaced when you reach the right place or moment.',
  },
];

// ── Section 2 — product screens ──────────────────────────────────────────

const PRODUCT_SCREENS = [
  { phone: <PhoneHome />, caption: 'Everything in one place' },
  { phone: <PhoneNotes />, caption: 'Notes that file themselves' },
  { phone: <PhoneNotes dark />, caption: 'Easy on the eyes' },
];

// ── Privacy trust points ─────────────────────────────────────────────────

const TRUST_POINTS = [
  'Your data belongs to you',
  'We do not sell personal data',
  'AI models are never trained on your content',
  'Delete your account and data at any time',
];

// ── Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <PublicNav />

      {/* ── 1 · Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-16 pb-14 lg:pt-20 lg:pb-16">
        <HeroStrands />

        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] items-center gap-12 lg:gap-8">
          {/* Copy */}
          <div className="relative z-10 max-w-xl">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-7 text-[11px] font-bold uppercase tracking-[0.08em] text-accent bg-accent-tint border border-accent-line rounded-full">
              <MicIcon className="w-3.5 h-3.5" strokeWidth={2.4} />
              Voice notes that sort themselves
            </span>

            <h1 className="text-5xl sm:text-6xl font-extrabold text-ink tracking-tight leading-[1.06] mb-6 text-balance">
              Say it once.
              <br />
              <span className="text-accent">It&apos;s handled.</span>
            </h1>

            <p className="text-lg sm:text-xl text-ink-muted leading-relaxed mb-9 max-w-lg">
              Talk for thirty seconds — errands, ideas, gym notes, all in one breath. Offload
              splits the ramble into organized notes and resurfaces each one exactly where and
              when you need it.
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center px-7 py-3.5 text-base font-bold text-bg bg-ink rounded-full shadow-level2 hover:-translate-y-0.5 hover:shadow-level3 active:translate-y-0 active:shadow-level1 transition-all duration-150"
              >
                Get the app
              </Link>
              <a
                href="#how"
                className="text-base font-semibold text-accent hover:opacity-80 transition-opacity"
              >
                See how it works&nbsp;→
              </a>
            </div>
          </div>

          {/* Phone — Record focus mode */}
          <div className="relative z-10 hidden sm:flex justify-center">
            <div className="scale-[0.62] -my-[122px] lg:scale-[0.72] lg:-my-[90px]">
              <PhoneRecord />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 · Place-based reminders (the differentiator) ────────────── */}
      <section id="places" className="scroll-mt-20 px-6 py-24 border-t border-line">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex justify-center order-2 lg:order-1">
            <PhoneLock className="scale-[0.8] sm:scale-90 origin-top" />
          </div>
          <div className="order-1 lg:order-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent bg-accent-tint border border-accent-line px-3 py-1.5 rounded-full mb-5">
              <LocationIcon className="w-3 h-3" />
              Reminders with a sense of place
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight text-balance mb-4">
              The reminder finds you — at the right place, not just the right time.
            </h2>
            <p className="text-lg text-ink-muted leading-relaxed mb-7 max-w-lg">
              Timed reminders fire while you&apos;re stuck in a meeting. Offload pins your notes
              to places instead — and you never set that up. Mention Costco in a ramble, and
              when you pull into the car park, the list is already on your lock screen.
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3 text-ink-secondary">
                <span className="font-bold text-accent shrink-0 w-14">Say it</span>
                <span>&quot;Grab paper towels next time I&apos;m at Costco&quot;</span>
              </li>
              <li className="flex gap-3 text-ink-secondary">
                <span className="font-bold text-accent shrink-0 w-14">Pinned</span>
                <span>Offload links the note to the place — no forms, no setup</span>
              </li>
              <li className="flex gap-3 text-ink-secondary">
                <span className="font-bold text-accent shrink-0 w-14">Arrive</span>
                <span>The notification meets you at the door, list ready</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 3 · Your day, sorted ──────────────────────────────────────── */}
      <section id="product" className="scroll-mt-20 px-6 py-24 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
              The product
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight mb-4">
              Your day, sorted
            </h2>
            <p className="text-lg text-ink-muted max-w-xl mx-auto">
              Real screens from the iOS app — capture on the go, and every note lands where it
              belongs.
            </p>
          </div>

          <div className="flex flex-wrap justify-center items-start gap-x-10 gap-y-14">
            {PRODUCT_SCREENS.map((screen) => (
              <div key={screen.caption} className="flex flex-col items-center">
                {screen.phone}
                <p className="mt-5 text-sm font-medium text-ink-muted">{screen.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 · How it works ──────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 px-6 py-24 bg-surface-muted border-y border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              From ramble to organized in one step.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item, index) => (
              <div
                key={item.title}
                className="relative p-7 bg-surface border border-line rounded-lg shadow-level1"
              >
                <span className="absolute top-5 right-5 text-xs font-bold text-line-strong select-none">
                  0{index + 1}
                </span>
                <div className="inline-flex items-center justify-center w-12 h-12 bg-accent-tint text-accent rounded-md mb-5">
                  {item.icon}
                </div>
                <h3 className="text-base font-semibold text-ink mb-2">{item.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Privacy ───────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Fixed deep-lagoon panel — deliberately dark in both schemes */}
          <div className="bg-[#17211E] rounded-xl px-8 py-14 md:px-14 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-white/10 rounded-md mb-7">
              <ShieldIcon className="text-[#53B8A5]" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Your thoughts stay yours.
            </h2>
            <p className="text-[#9BA6A0] text-lg leading-relaxed mb-10 max-w-lg mx-auto">
              We do not sell personal data or train AI models on your content. You stay in
              control of your information.
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

      {/* ── 5 · Close ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24 text-center border-t border-line">
        <div className="max-w-xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent text-white rounded-xl shadow-level2 mb-8">
            <LogoGlyph className="w-9 h-9" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight mb-10 text-balance">
            Stop holding it all in your head.
          </h2>
          <div className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-bg font-semibold text-sm rounded-md cursor-default select-none">
            <AppleIcon />
            Available on the App Store
          </div>
          <p className="mt-6">
            <Link
              href="/signup"
              className="text-sm font-semibold text-accent hover:opacity-80 transition-opacity"
            >
              Create your account&nbsp;→
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
