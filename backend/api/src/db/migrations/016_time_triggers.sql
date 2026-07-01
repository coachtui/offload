-- 016_time_triggers.sql — Phase 8.2 time triggers (additive, idempotent)
-- remind_at: resolved fire time (derived by temporalTrigger.ts at ingest)
-- reminder_fired_at: set when the push succeeds; per-row idempotency

ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS remind_at timestamptz;
ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS reminder_fired_at timestamptz;

-- Keeps the 5-minute poll cheap regardless of table growth.
CREATE INDEX IF NOT EXISTS idx_atomic_objects_pending_reminders
  ON hub.atomic_objects (remind_at)
  WHERE remind_at IS NOT NULL AND reminder_fired_at IS NULL;
