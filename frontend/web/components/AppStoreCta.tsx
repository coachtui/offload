import { APP_STORE_URL, TESTFLIGHT_URL } from '@/lib/appStore';
import { AppleIcon } from '@/components/ui/icons';

/**
 * The site's single call to action.
 *
 * Three states, one visual slot so no layout shifts at launch: a real App Store
 * link, an interim TestFlight beta invite, or a non-interactive "coming soon"
 * badge. The label comes from whichever link is in hand — a TestFlight
 * destination must never wear the "Download on the App Store" badge, both
 * because it misleads the visitor about where they're going and because Apple's
 * badge guidelines don't allow it.
 */
export default function AppStoreCta({ className = '' }: { className?: string }) {
  // App Store wins once it exists; TestFlight is only the pre-launch stand-in.
  const href = APP_STORE_URL ?? TESTFLIGHT_URL;
  const label = APP_STORE_URL
    ? 'Download on the App Store'
    : TESTFLIGHT_URL
      ? 'Join the beta on TestFlight'
      : 'Coming soon to the App Store';

  if (href) {
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-2 font-bold text-bg bg-ink shadow-level2 hover:-translate-y-0.5 hover:shadow-level3 active:translate-y-0 active:shadow-level1 transition-all duration-150 ${className}`}
      >
        <AppleIcon />
        {label}
      </a>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 font-bold text-bg bg-ink cursor-default select-none ${className}`}
    >
      <AppleIcon />
      {label}
    </span>
  );
}
