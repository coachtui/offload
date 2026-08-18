/**
 * "The server said ENTITLEMENT_REQUIRED" signal.
 *
 * Emitted from exactly one place — apiService's response handling — so no
 * screen ever needs its own 403 branch: any gated call from anywhere in the
 * app surfaces the same paywall. The subscriber (AppNavigator) presents the
 * Paywall route.
 *
 * Debounced here rather than at the subscriber: a screen that fires three
 * gated requests on mount (Home does) would otherwise stack three paywalls.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

const DEBOUNCE_MS = 2000;
let lastEmit = 0;

/**
 * `force` bypasses the debounce — for direct user actions (tapping record
 * while blocked) where "nothing happened" would read as a broken button.
 * The debounce exists for request bursts, not for taps.
 */
export function emitPaywallRequired(force = false): void {
  const now = Date.now();
  if (!force && now - lastEmit < DEBOUNCE_MS) return;
  lastEmit = now;
  console.log(`[paywallBus] entitlement required — ${listeners.size} listener(s)`);
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch (err) {
      console.warn('[paywallBus] listener threw:', err);
    }
  }
}

/** Subscribe. Returns an unsubscribe function. */
export function subscribePaywallRequired(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
