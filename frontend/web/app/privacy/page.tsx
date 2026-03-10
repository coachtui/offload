import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Offload Privacy Policy — how we collect, use, and protect your data.',
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

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-400">Last updated: March 9, 2026</p>
        </div>

        <div className="divide-y divide-gray-100 space-y-10">
          <Section title="Introduction">
            <p>
              Offload (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is operated by
              AIGA LLC. This Privacy Policy explains what information we collect, how we use it, and
              the choices you have.
            </p>
            <p>
              By using Offload, you agree to the collection and use of information in accordance
              with this policy. If you have questions, contact us at{' '}
              <a
                href="mailto:support@useoffload.app"
                className="text-gray-900 underline hover:no-underline"
              >
                support@useoffload.app
              </a>
              .
            </p>
          </Section>

          <Section title="Information We Collect">
            <p className="font-medium text-gray-800">Account information</p>
            <p>
              When you create an account, we collect your email address and optionally your name.
              We use your email address to identify your account and communicate with you about the
              service.
            </p>

            <p className="font-medium text-gray-800 mt-4">Voice recordings and transcripts</p>
            <p>
              When you use the voice capture feature, audio is streamed directly to Deepgram (our
              transcription provider) and is not stored on our servers. The resulting transcript
              text is stored and associated with your account.
            </p>

            <p className="font-medium text-gray-800 mt-4">Notes and structured content</p>
            <p>
              Transcripts are processed by AI to extract structured notes (tasks, reminders, ideas,
              decisions, and similar). This structured content is stored and associated with your
              account so you can search and retrieve it later.
            </p>

            <p className="font-medium text-gray-800 mt-4">Location data</p>
            <p>
              If you use the place reminders feature, the app may use your device&apos;s GPS
              location to determine which reminders are relevant to your current location. Location
              data is used to match you with saved geofences and is not continuously tracked or
              logged. Approximate location coordinates may be stored when a note is captured with
              GPS context enabled.
            </p>

            <p className="font-medium text-gray-800 mt-4">Usage data</p>
            <p>
              We may collect basic technical information such as device type, operating system,
              request timestamps, and error logs to operate and improve the service. This data does
              not identify you individually.
            </p>
          </Section>

          <Section title="How We Use Your Information">
            <p>We use the information we collect to:</p>
            <Ul
              items={[
                'Provide and maintain the Offload service',
                'Transcribe your voice recordings into text notes',
                'Process and structure your notes using AI',
                'Enable place-based reminders and geofence matching',
                'Allow you to search and retrieve your notes',
                'Communicate with you about your account or the service',
                'Diagnose technical issues and improve reliability',
              ]}
            />
            <p className="mt-4">
              We do not use your content to train, fine-tune, or improve any AI or machine learning
              models. Your notes and voice recordings are processed on your behalf — not to benefit
              the model or any third party.
            </p>
          </Section>

          <Section title="Third-Party Service Providers">
            <p>
              We share data with the following service providers solely to operate the service.
              Each provider is bound by their own privacy and data processing agreements.
            </p>
            <Ul
              items={[
                'Deepgram — real-time voice transcription (audio is streamed directly; not stored by us)',
                'Anthropic and/or OpenAI — AI processing of transcript text to extract structured notes',
                'Amazon Web Services (S3) — secure cloud storage for your data',
                'Weaviate — vector database used for semantic search of your notes',
                'Railway — backend infrastructure hosting',
              ]}
            />
            <p className="mt-4">
              We do not sell, rent, or share your personal data with advertisers or data brokers.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              We retain your account data and notes for as long as your account is active. If you
              delete your account, we will delete your associated data within 30 days, except where
              retention is required by law.
            </p>
            <p>
              You can request deletion of your account and data at any time by emailing{' '}
              <a
                href="mailto:support@useoffload.app"
                className="text-gray-900 underline hover:no-underline"
              >
                support@useoffload.app
              </a>
              .
            </p>
          </Section>

          <Section title="Your Rights">
            <p>You have the right to:</p>
            <Ul
              items={[
                'Access the personal data we hold about you',
                'Request correction of inaccurate data',
                'Request deletion of your account and associated data',
                'Export your notes and content',
                'Withdraw consent for location-based features at any time via device settings',
              ]}
            />
            <p className="mt-4">
              To exercise any of these rights, contact us at{' '}
              <a
                href="mailto:support@useoffload.app"
                className="text-gray-900 underline hover:no-underline"
              >
                support@useoffload.app
              </a>
              .
            </p>
          </Section>

          <Section title="Data Security">
            <p>
              We use industry-standard practices to protect your data, including encrypted
              connections (HTTPS/TLS) for all data in transit and access controls on our
              infrastructure. No system is completely secure, and we cannot guarantee absolute
              security.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              Offload is not directed to children under 13. We do not knowingly collect personal
              information from children under 13. If you believe a child has provided us personal
              information, contact us and we will delete it promptly.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by updating the &ldquo;last updated&rdquo; date at the top of this page. Your
              continued use of Offload after any changes constitutes your acceptance of the updated
              policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              If you have questions or concerns about this Privacy Policy, contact AIGA LLC at:
            </p>
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
