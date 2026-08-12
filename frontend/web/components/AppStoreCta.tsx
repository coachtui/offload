import { APP_STORE_URL } from '@/lib/appStore';
import { AppleIcon } from '@/components/ui/icons';

/**
 * The site's single call to action. Renders a real App Store link once
 * APP_STORE_URL is set; until then, a non-interactive "coming soon" badge
 * in the same visual slot so layouts don't shift at launch.
 */
export default function AppStoreCta({ className = '' }: { className?: string }) {
  const label = APP_STORE_URL ? 'Download on the App Store' : 'Coming soon to the App Store';

  if (APP_STORE_URL) {
    return (
      <a
        href={APP_STORE_URL}
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
