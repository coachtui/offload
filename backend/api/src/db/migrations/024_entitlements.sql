-- 024_entitlements.sql — server-side subscription entitlement (1.2.0 paywall)
--
-- The one architectural rule (plans/paywall-1.2.0.md): entitlement is decided
-- server-side, always. The app never tells the backend it is premium — the
-- backend hears it from RevenueCat's webhook and from nothing else. These
-- columns are that single source of truth.
--
-- Values:
--   'none'          — no active subscription; gated routes refuse
--   'trialing'      — inside the 14-day Introductory Offer
--   'active'        — paying
--   'grandfathered' — existed before the paywall shipped; free forever.
--                     Covers every TestFlight tester and the App Review demo
--                     account, which must never hit a paywall mid-review.
--
-- Deploy-order note: this migration runs at server startup (migrate.ts), so
-- the UPDATE below grandfathers exactly the accounts that exist at deploy
-- time. Signups after this deploy start at 'none' — which is inert until
-- requireEntitlement is wired to routes, and that wiring ships only alongside
-- the app that can pay (plan, Phase E), or fresh installs would be locked out
-- with no way to subscribe.

ALTER TABLE hub.users
  ADD COLUMN IF NOT EXISTS entitlement text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS entitlement_expires_at timestamptz NULL,
  -- Event timestamp (RevenueCat's, not arrival time) of the last webhook we
  -- applied. Webhooks are retried and can arrive out of order; an event older
  -- than this is skipped so a re-delivered EXPIRATION can't undo a RENEWAL.
  ADD COLUMN IF NOT EXISTS entitlement_event_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revenuecat_customer_id text NULL;

-- Add the CHECK separately so re-running the file stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'hub.users'::regclass AND conname = 'users_entitlement_check'
  ) THEN
    ALTER TABLE hub.users ADD CONSTRAINT users_entitlement_check
      CHECK (entitlement IN ('none', 'trialing', 'active', 'grandfathered'));
  END IF;
END $$;

-- Grandfather everyone who exists when the paywall ships. The WHERE guard
-- means a hypothetical re-run can't re-grandfather post-launch lapsed users
-- (they'd be 'none' too, but with entitlement_event_at set by a webhook).
UPDATE hub.users
SET entitlement = 'grandfathered'
WHERE entitlement = 'none' AND entitlement_event_at IS NULL;

-- Processed-webhook ledger. RevenueCat retries delivery until it sees a 2xx,
-- so the same event can arrive many times; INSERT ... ON CONFLICT DO NOTHING
-- on this PK is the idempotency gate. Rows are tiny and write-once; no index
-- beyond the PK is needed (lookups are by event id only).
CREATE TABLE IF NOT EXISTS hub.revenuecat_events (
  event_id    text        PRIMARY KEY,
  user_id     uuid        NULL,
  event_type  text        NOT NULL,
  event_at    timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT NOW()
);
