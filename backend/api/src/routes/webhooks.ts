/**
 * Server-to-server webhooks. No JWT here — the caller is a vendor, not a user,
 * so each endpoint authenticates with its own shared secret.
 *
 * RevenueCat delivery contract: it retries until it receives a 2xx, with
 * backoff, for hours. That drives the status codes below —
 *  - 2xx for anything we never want redelivered, *including* events we chose
 *    not to apply (duplicates, stale, unknown user): retrying those can never
 *    change the outcome, so a non-2xx would just be a slow-motion retry storm;
 *  - 5xx only for genuine transient failure (DB down), where a retry helps;
 *  - 401 for a bad secret — misconfiguration, loud in RevenueCat's dashboard.
 */
import { Router, Request, Response } from 'express';
import { applyWebhookEvent, RevenueCatEvent } from '../services/entitlementService';

const router = Router();

router.post('/revenuecat', async (req: Request, res: Response) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed but loudly: without a configured secret, anyone could forge
    // entitlement events. 503 keeps RevenueCat retrying until config is fixed,
    // so no events are lost to a misdeploy.
    console.error('[webhooks] REVENUECAT_WEBHOOK_SECRET is not set — refusing webhook');
    res.status(503).json({ error: 'NOT_CONFIGURED' });
    return;
  }
  if (req.headers.authorization !== secret) {
    console.warn('[webhooks] revenuecat webhook with bad authorization header');
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const event = req.body?.event as Partial<RevenueCatEvent> | undefined;
  if (!event?.id || !event.type || !event.app_user_id || !event.event_timestamp_ms) {
    // Malformed by our reading — acknowledge it so RevenueCat doesn't redeliver
    // the same unparseable payload forever, but log the whole thing.
    console.error('[webhooks] malformed revenuecat event:', JSON.stringify(req.body).slice(0, 2000));
    res.status(200).json({ ok: false, reason: 'MALFORMED' });
    return;
  }

  try {
    const result = await applyWebhookEvent(event as RevenueCatEvent);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error(`[webhooks] revenuecat event ${event.id} failed:`, error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
