import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: "Offload — Offload what's on your mind",
    template: '%s | Offload',
  },
  description:
    'Capture thoughts instantly. AI organizes them. Your notes return when they matter.',
  metadataBase: new URL('https://useoffload.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://useoffload.app',
    siteName: 'Offload',
    title: "Offload — Offload what's on your mind",
    description:
      'Capture thoughts instantly. AI organizes them. Your notes return when they matter.',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Offload — Offload what's on your mind",
    description:
      'Capture thoughts instantly. AI organizes them. Your notes return when they matter.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
