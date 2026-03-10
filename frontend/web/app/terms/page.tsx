import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Offload Terms of Service — the rules and conditions for using Offload.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3 text-gray-600 leading-relaxed text-sm">{children}</div>
    </section>
  );
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 text-gray-600 text-sm ml-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-20">
        {/* Header */}
        <div className="mb-14">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Legal
          </p>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-400">Last updated: March 9, 2026</p>
        </div>

        <div className="divide-y divide-gray-100 space-y-10">
          <Section title="Agreement to Terms">
            <p>
              By accessing or using Offload (the &ldquo;Service&rdquo;), you agree to be bound by
              these Terms of Service. If you disagree with any part of these terms, you may not use
              the Service.
            </p>
            <p>
              Offload is operated by AIGA LLC (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or
              &ldquo;us&rdquo;). If you have questions, contact us at{' '}
              <a
                href="mailto:support@useoffload.app"
                className="text-gray-900 underline hover:no-underline"
              >
                support@useoffload.app
              </a>
              .
            </p>
          </Section>

          <Section title="Description of Service">
            <p>
              Offload is a voice-first note capture and retrieval application. The Service allows
              you to:
            </p>
            <Ul
              items={[
                'Record voice notes that are transcribed and structured by AI',
                'Store, search, and retrieve structured notes',
                'Set location-based reminders (geofences) that trigger when you arrive at a place',
                'Ask questions about your stored notes using AI',
                'Review insights and patterns across your captured content',
              ]}
            />
            <p className="mt-4">
              The Service is provided on an &ldquo;as is&rdquo; basis. Features may change over
              time and the Service is offered primarily as a mobile iOS application, with a web
              presence at useoffload.app.
            </p>
          </Section>

          <Section title="Account Registration">
            <p>
              To use Offload, you must create an account with a valid email address and password. You
              are responsible for:
            </p>
            <Ul
              items={[
                'Providing accurate registration information',
                'Keeping your password confidential',
                'All activity that occurs under your account',
                'Notifying us immediately of any unauthorized access to your account',
              ]}
            />
            <p className="mt-4">
              You must be at least 13 years old to use the Service. By creating an account, you
              represent that you meet this requirement.
            </p>
          </Section>

          <Section title="Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <Ul
              items={[
                'Record or store content that is illegal, threatening, abusive, or harassing',
                'Violate the privacy or rights of others',
                'Attempt to gain unauthorized access to any part of the Service or its systems',
                'Reverse-engineer, decompile, or tamper with the Service',
                'Use the Service in any way that could damage, disable, or overburden it',
                'Use automated scripts or bots to interact with the Service',
                'Misrepresent your identity or affiliation',
              ]}
            />
            <p className="mt-4">
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </Section>

          <Section title="AI-Generated Content">
            <p>
              Offload uses AI to transcribe your voice recordings, extract structured notes, and
              generate insights and responses. You acknowledge that:
            </p>
            <Ul
              items={[
                'AI-generated outputs may be inaccurate, incomplete, or misleading',
                'You are responsible for reviewing AI-generated notes before acting on them',
                'Offload does not guarantee the accuracy of transcriptions or AI-structured content',
                'Place reminders and AI suggestions are provided as a convenience, not a guarantee',
                'Critical tasks, appointments, and obligations should be verified through your own systems',
              ]}
            />
          </Section>

          <Section title="Your Content">
            <p>
              You retain ownership of all content you submit to Offload, including voice recordings,
              transcripts, and notes. By using the Service, you grant AIGA LLC a limited,
              non-exclusive license to process and store your content solely for the purpose of
              providing the Service to you.
            </p>
            <p>
              We do not claim ownership of your content, and we do not use your content to train AI
              models or for any purpose beyond operating the Service on your behalf.
            </p>
          </Section>

          <Section title="Privacy">
            <p>
              Your use of the Service is also governed by our{' '}
              <Link href="/privacy" className="text-gray-900 underline hover:no-underline">
                Privacy Policy
              </Link>
              , which is incorporated into these Terms. Please review the Privacy Policy to
              understand how we collect, use, and protect your data.
            </p>
          </Section>

          <Section title="Service Availability">
            <p>
              We aim to keep Offload available and reliable, but we do not guarantee uninterrupted
              access. The Service may be temporarily unavailable due to maintenance, upgrades, or
              circumstances outside our control. We are not liable for any losses arising from
              Service interruptions.
            </p>
            <p>
              Place-based reminders depend on device location services, network connectivity, and
              background permissions. We cannot guarantee that reminders will fire in all
              circumstances.
            </p>
          </Section>

          <Section title="Disclaimers">
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
              WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p>
              We do not warrant that the Service will be error-free, that AI outputs will be
              accurate, or that place reminders will fire reliably. Do not rely solely on Offload
              for time-critical or safety-critical obligations.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, AIGA LLC SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING LOST
              DATA, MISSED REMINDERS, OR LOST PROFITS — ARISING FROM YOUR USE OF OR INABILITY TO
              USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR YOUR USE OF THE
              SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE
              CLAIM, OR $50 USD, WHICHEVER IS GREATER.
            </p>
          </Section>

          <Section title="Indemnification">
            <p>
              You agree to indemnify and hold harmless AIGA LLC and its officers, directors,
              employees, and agents from any claims, damages, or expenses (including legal fees)
              arising from your use of the Service or violation of these Terms.
            </p>
          </Section>

          <Section title="Account Termination">
            <p>
              You may delete your account at any time by contacting us at{' '}
              <a
                href="mailto:support@useoffload.app"
                className="text-gray-900 underline hover:no-underline"
              >
                support@useoffload.app
              </a>
              .
            </p>
            <p>
              We reserve the right to suspend or terminate your account if you violate these Terms,
              abuse the Service, or for any other reason at our discretion with or without notice.
              Upon termination, your right to use the Service ceases immediately.
            </p>
          </Section>

          <Section title="Changes to These Terms">
            <p>
              We may update these Terms from time to time. We will notify you of material changes
              by updating the &ldquo;last updated&rdquo; date. Your continued use of the Service
              after changes are posted constitutes your acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="Governing Law">
            <p>
              These Terms are governed by the laws of the United States. Any disputes shall be
              resolved in accordance with applicable law, and you consent to the jurisdiction of
              courts located in the United States.
            </p>
          </Section>

          <Section title="Contact">
            <p>For questions about these Terms, contact AIGA LLC at:</p>
            <p className="mt-2">
              <a
                href="mailto:support@useoffload.app"
                className="text-gray-900 font-medium underline hover:no-underline"
              >
                support@useoffload.app
              </a>
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back to Offload
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
