/**
 * Subscription entitlement — the server-side single source of truth.
 *
 * Two rules from plans/paywall-1.2.0.md govern everything here:
 *
 * 1. The client never decides. The app asks Apple/RevenueCat to buy; this
 *    service hears the result via webhook and writes hub.users.entitlement.
 *    Anything client-supplied ("I'm premium") is ignored by design — the
 *    request path that checks entitlement reads only what a webhook wrote.
 *
 * 2. Lapsing must not break what was promised. Reminders fire from the device
 *    precisely so they work with no network; a lapsed subscription gates the
 *    *creation* of new notes, never the delivery of armed ones, and never
 *    read access to the user's own data. That is enforced by which routes get
 *    requireEntitlement — this service only answers "entitled or not".
 *
 * Webhook hazards this code exists to absorb (each bit RevenueCat documents,
 * all of them observed in the wild by everyone who has ever integrated it):
 *  - Retries: delivery repeats until a 2xx, so the same event arrives many
 *    times. The hub.revenuecat_events PK is the idempotency gate.
 *  - Out-of-order arrival: an EXPIRATION retry can land after the RENEWAL
 *    that superseded it. Events older than users.entitlement_event_at are
 *    recorded but not applied, so state can only move forward in event time.
 *  - Grace skew: a renewal's webhook can trail the actual renewal by minutes.
 *    isEntitled honors expiry + 24h so a paying user is never locked out by
 *    webhook lag; the eventual EXPIRATION (only sent when the sub truly
 *    lapsed) still lands within the same 24h and flips state to 'none'.
 *
 * 'grandfathered' is terminal: set once by migration 024 for every account
 * that predates the paywall, and never overwritten by any webhook — a
 * grandfathered user who subscribes anyway must not lose free-forever status
 * when that subscription later expires.
 */
import { queryOne } from '../db/queries';

export type Entitlement = 'none' | 'trialing' | 'active' | 'grandfathered';

/** Webhook lag allowance — see header. */
const GRACE_MS = 24 * 60 * 60 * 1000;

export interface EntitlementState {
  entitlement: Entitlement;
  entitlementExpiresAt: Date | null;
}

export function isEntitled(state: EntitlementState, now: Date = new Date()): boolean {
  switch (state.entitlement) {
    case 'grandfathered':
      return true;
    case 'trialing':
    case 'active':
      return (
        state.entitlementExpiresAt === null ||
        state.entitlementExpiresAt.getTime() + GRACE_MS > now.getTime()
      );
    default:
      return false;
  }
}

/**
 * The subset of RevenueCat's webhook event this service reads.
 * https://www.revenuecat.com/docs/integrations/webhooks — `app_user_id` is
 * set to our hub.users.id at SDK login (never email).
 */
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  event_timestamp_ms: number;
  expiration_at_ms?: number | null;
  period_type?: string | null;
}

export type ApplyResult =
  | 'applied'
  | 'duplicate'
  | 'stale'
  | 'no_state_change'
  | 'unknown_user'
  | 'grandfathered_untouched';

/** Event types that carry an entitlement state transition. */
function targetStateFor(event: RevenueCatEvent): Entitlement | null {
  switch (event.type) {
    case 'INITIAL_PURCHASE':
      return event.period_type === 'TRIAL' ? 'trialing' : 'active';
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
      return 'active';
    case 'EXPIRATION':
      return 'none';
    // CANCELLATION = auto-renew switched off; the user stays entitled until
    // expiry, when EXPIRATION arrives. BILLING_ISSUE likewise resolves to
    // either a RENEWAL or an EXPIRATION — no state change on its own.
    case 'CANCELLATION':
    case 'BILLING_ISSUE':
    case 'SUBSCRIBER_ALIAS':
    case 'TRANSFER':
    case 'NON_RENEWING_PURCHASE':
    case 'TEST':
    default:
      return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function applyWebhookEvent(event: RevenueCatEvent): Promise<ApplyResult> {
  // RevenueCat can send anonymous ids ("$RCAnonymousID:…") for purchases made
  // before the SDK's logIn ran. Those aren't uuids, and letting one reach a
  // `WHERE id = $1::uuid` would throw → 500 → RevenueCat retries the same
  // event forever. Record it (user_id NULL) and move on.
  const userId = UUID_RE.test(event.app_user_id) ? event.app_user_id : null;

  // Idempotency gate first: record the event; a conflict means we already
  // processed it (or are processing it concurrently) — do nothing else.
  const inserted = await queryOne<{ event_id: string }>(
    `INSERT INTO hub.revenuecat_events (event_id, user_id, event_type, event_at)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [event.id, userId, event.type, event.event_timestamp_ms]
  );
  if (!inserted) return 'duplicate';

  if (!userId) {
    console.warn(
      `[entitlementService] event ${event.id} has non-uuid app_user_id ` +
        `"${event.app_user_id}" — recorded, not applied`
    );
    return 'unknown_user';
  }

  const target = targetStateFor(event);
  if (target === null) {
    console.log(
      `[entitlementService] event ${event.id} (${event.type}) recorded, no state change`
    );
    return 'no_state_change';
  }

  const expiresAt =
    event.expiration_at_ms != null ? new Date(event.expiration_at_ms) : null;

  // Single guarded UPDATE: the WHERE clause enforces both the never-touch-
  // grandfathered rule and forward-only event time, atomically — two webhook
  // deliveries racing each other cannot interleave a stale write.
  const updated = await queryOne<{ id: string }>(
    `UPDATE hub.users
     SET entitlement = $2,
         entitlement_expires_at = $3,
         entitlement_event_at = to_timestamp($4 / 1000.0),
         revenuecat_customer_id = $5,
         updated_at = NOW()
     WHERE id = $1
       AND entitlement <> 'grandfathered'
       AND (entitlement_event_at IS NULL
            OR entitlement_event_at <= to_timestamp($4 / 1000.0))
     RETURNING id`,
    [userId, target, expiresAt, event.event_timestamp_ms, event.app_user_id]
  );

  if (updated) {
    console.log(
      `[entitlementService] user=${event.app_user_id} → ${target} ` +
        `(${event.type}, expires ${expiresAt?.toISOString() ?? 'never'})`
    );
    return 'applied';
  }

  // Distinguish why the guard refused, for the log's sake.
  const user = await queryOne<{ entitlement: string }>(
    'SELECT entitlement FROM hub.users WHERE id = $1',
    [userId]
  );
  if (!user) {
    // Not an error path worth failing the webhook over: RevenueCat retries
    // 5xx, and a deleted account's trailing events will simply never match.
    console.warn(
      `[entitlementService] event ${event.id} for unknown user ${event.app_user_id}`
    );
    return 'unknown_user';
  }
  if (user.entitlement === 'grandfathered') {
    console.log(
      `[entitlementService] event ${event.id} ignored: user ${event.app_user_id} is grandfathered`
    );
    return 'grandfathered_untouched';
  }
  console.log(
    `[entitlementService] event ${event.id} (${event.type}) stale — older than applied state`
  );
  return 'stale';
}

/** Current entitlement state straight from the row — used by requireEntitlement. */
export async function getEntitlementState(userId: string): Promise<EntitlementState | null> {
  const row = await queryOne<{ entitlement: Entitlement; entitlement_expires_at: Date | null }>(
    'SELECT entitlement, entitlement_expires_at FROM hub.users WHERE id = $1',
    [userId]
  );
  if (!row) return null;
  return { entitlement: row.entitlement, entitlementExpiresAt: row.entitlement_expires_at };
}

/**
 * Best-effort deletion of the RevenueCat customer when the account is deleted
 * (same completeness promise as the Weaviate purge in accountService).
 * Requires the secret REVENUECAT_API_KEY; quietly skips when unset so
 * account deletion never depends on a vendor being configured.
 */
export async function deleteRevenueCatCustomer(userId: string): Promise<void> {
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) return;

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } }
  );
  // 404 = never a customer (never purchased) — that's success, not failure.
  if (!res.ok && res.status !== 404) {
    throw new Error(`RevenueCat delete failed: ${res.status}`);
  }
}
