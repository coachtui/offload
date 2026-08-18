/**
 * RevenueCat wrapper — the only file that touches react-native-purchases.
 *
 * Two rules govern this module:
 *
 * 1. The server decides entitlement, never this SDK. A purchase here kicks off
 *    Apple → RevenueCat → webhook → hub.users.entitlement; the app then asks
 *    GET /auth/me what the server concluded. CustomerInfo from the SDK is used
 *    for UX pacing only (e.g. "did the purchase sheet finish"), never as the
 *    authority for unlocking anything — a jailbroken client faking the SDK
 *    gains nothing because every gated call still hits requireEntitlement.
 *
 * 2. Purchases must be unconfigurable without breaking the app. Until the real
 *    RevenueCat key ships (EXPO_PUBLIC_REVENUECAT_IOS_KEY via EAS env), and in
 *    any environment where the native module is absent or the key is the
 *    placeholder, every function here degrades to a harmless no-op/null. The
 *    paywall screen renders an "unavailable" state instead of crashing, and
 *    grandfathered/entitled users never reach this code path at all.
 *
 * appUserID is our hub.users.id uuid — set at login, cleared at logout — so
 * RevenueCat's webhook `app_user_id` matches what the backend expects (never
 * an email, which can change; never the anonymous id, which the backend
 * deliberately records-and-skips).
 */
import Purchases, {
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { Platform } from 'react-native';

const PLACEHOLDER_KEY = 'appl_PLACEHOLDER_SET_EXPO_PUBLIC_REVENUECAT_IOS_KEY';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || PLACEHOLDER_KEY;

let configured = false;

export function isPurchasesConfigured(): boolean {
  return configured;
}

/** Idempotent; called once at app start. Never throws. */
export function configurePurchases(): void {
  if (configured) return;
  if (Platform.OS !== 'ios') return; // Android IAP is out of scope for 1.2.0
  if (API_KEY === PLACEHOLDER_KEY) {
    console.log('[purchases] no RevenueCat key set — purchases disabled this build');
    return;
  }
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
    console.log('[purchases] RevenueCat configured');
  } catch (e) {
    console.warn('[purchases] configure failed:', e);
  }
}

/**
 * Identify the RevenueCat customer as our user id. Best-effort: a failure
 * here must never block sign-in — the purchase sheet re-identifies lazily,
 * and an unidentified session only matters once someone tries to buy.
 */
export async function purchasesLogIn(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
    console.log('[purchases] identified');
  } catch (e) {
    console.warn('[purchases] logIn failed:', e);
  }
}

/** Called on sign-out/delete, before local state is torn down. Best-effort. */
export async function purchasesLogOut(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    // logOut throws if already anonymous — harmless either way.
    console.log('[purchases] logOut noop:', e);
  }
}

/** The default offering (monthly + annual packages), or null when unavailable. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (e) {
    console.warn('[purchases] getOfferings failed:', e);
    return null;
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

/**
 * Run Apple's purchase sheet for a package. Returns an outcome instead of
 * throwing so the paywall's handling stays a switch, not a try/catch maze.
 */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!configured) return 'failed';
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    console.warn('[purchases] purchase failed:', e);
    return 'failed';
  }
}

/**
 * Restore Purchases — required by App Review on any paywall (its absence is a
 * stock 3.1.2 rejection). Returns true when the SDK call completed; whether
 * anything was actually restored is the server's call, read via /auth/me.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    await Purchases.restorePurchases();
    return true;
  } catch (e) {
    console.warn('[purchases] restore failed:', e);
    return false;
  }
}
