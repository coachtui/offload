-- 020_reminder_claim.sql — reminder claim lease (additive, idempotent)
--
-- The scheduler claims a row before it calls Expo, so two concurrent runs — a
-- second Railway replica, or a re-arm racing a tick — get disjoint row sets and
-- neither can push the same reminder twice. reminder_fired_at alone can't do
-- this: it is only set AFTER a successful push, leaving the whole send window
-- unguarded.
--
-- A claim is a lease, not a commitment. A normal push failure releases it
-- immediately; a process that dies mid-send leaves the row claimed but unfired,
-- and the scheduler reclaims it once the lease goes stale (CLAIM_LEASE_MS in
-- timeReminderJob.ts). So a crash delays a reminder, it never loses one.
--
-- No new index: idx_atomic_objects_pending_reminders (016) is still the driving
-- index for both the claim and the next-due-time queries.

ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS reminder_claimed_at timestamptz;
