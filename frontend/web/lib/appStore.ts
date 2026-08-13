/**
 * Where the site's download CTA points (ASC app 6799952861).
 *
 * Two links, checked in order of preference, so launch is a one-line change
 * that needs no cleanup:
 *
 *  - APP_STORE_URL wins whenever it's set. null until the app clears public
 *    App Store review — a live link would 404 for visitors before then. On
 *    approval set it to 'https://apps.apple.com/app/id6799952861' and every
 *    CTA upgrades itself; the TestFlight link below can stay where it is.
 *  - TESTFLIGHT_URL is the interim public beta invite. It deliberately does
 *    NOT reuse APP_STORE_URL: the CTA labels itself from which one it got, so
 *    a beta link never renders under Apple's "Download on the App Store"
 *    badge — misleading to visitors and against Apple's badge guidelines.
 *
 * Both null → non-interactive "coming soon" badge in the same visual slot.
 */
export const APP_STORE_URL: string | null = null;

export const TESTFLIGHT_URL: string | null = 'https://testflight.apple.com/join/Ys1CRVxy';
