import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';
import { Section, Ul } from '@/components/Prose';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with Offload — contact support, common questions, and account management.',
};

/**
 * This page is the App Store listing's Support URL target. Apple requires the
 * link to lead somewhere a user can actually get help, so keep the contact
 * email above the fold and keep the answers honest — every claim here is also
 * made in the app's review notes and privacy label, and the three must agree.
 */
export default function SupportPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-20">
        <div className="mb-14">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">
            Help
          </p>
          <h1 className="text-4xl font-bold text-ink tracking-tight mb-3">Support</h1>
          <p className="text-sm text-ink-faint">
            Questions, problems, or ideas — we read everything.
          </p>
        </div>

        <div className="divide-y divide-line space-y-10">
          <Section title="Contact us">
            <p>
              Email{' '}
              <a
                href="mailto:support@useoffload.app"
                className="text-ink underline hover:no-underline"
              >
                support@useoffload.app
              </a>{' '}
              and we&rsquo;ll get back to you as soon as we can. Including your iPhone model and
              iOS version helps us help you faster.
            </p>
          </Section>

          <Section title="A reminder didn't fire when I arrived">
            <p>
              Arrival reminders run entirely on your phone, so they work without a signal — but
              they depend on two permissions:
            </p>
            <Ul
              items={[
                'Location must be set to "Always" (Settings → Offload → Location). "While Using" can’t wake the app when it’s closed.',
                'Notifications must be allowed (Settings → Offload → Notifications).',
              ]}
            />
            <p>
              Also check that the note is still open — completed notes don&rsquo;t fire — and that
              the place has arrival reminders switched on (Places → tap the place).
            </p>
          </Section>

          <Section title="Is my voice recording stored?">
            <p>
              No. Audio is transcribed and immediately discarded — only the text of your note
              survives. Your location isn&rsquo;t tracked either: arrival checks happen on your
              device, and no movement history exists anywhere. The full details are in our{' '}
              <Link href="/privacy" className="text-ink underline hover:no-underline">
                Privacy Policy
              </Link>
              .
            </p>
          </Section>

          <Section title="Delete your account">
            <p>
              In the app: tap your avatar (top right) → <span className="text-ink">Settings</span>{' '}
              → <span className="text-ink">Delete account</span>. You&rsquo;ll re-enter your
              password to confirm, and your account and everything in it — notes, transcripts,
              places, reminders — is deleted immediately and permanently. No email or support
              request needed.
            </p>
          </Section>

          <Section title="Legal">
            <p>
              <Link href="/privacy" className="text-ink underline hover:no-underline">
                Privacy Policy
              </Link>{' '}
              ·{' '}
              <Link href="/terms" className="text-ink underline hover:no-underline">
                Terms of Service
              </Link>
            </p>
          </Section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
