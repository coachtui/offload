-- 021_reminder_local_claim.sql — device-side reminder ownership (additive, idempotent)
--
-- When a device schedules a note's reminder as a local iOS notification it says
-- so, and the server stops pushing that row. Both firing would mean two
-- notifications for one reminder.
--
-- The device claims only what it actually scheduled, and re-states the whole
-- set on every sync (see setLocalReminderClaims — it clears the rows absent
-- from the set). So a device that can't schedule — notification permission
-- denied, or the note fell outside iOS's 64-pending-request budget — claims
-- nothing and the server keeps pushing exactly as it did before.
--
-- Deliberately no time-based expiry on a claim. An OS-scheduled local
-- notification needs neither network nor server at fire time, which makes it
-- strictly more reliable than a push, and every way it can fail (permission
-- revoked, app deleted) breaks push delivery too. A staleness backstop would
-- buy nothing and would double-notify every reminder it misjudged.

ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS reminder_local_claim_at timestamptz;
