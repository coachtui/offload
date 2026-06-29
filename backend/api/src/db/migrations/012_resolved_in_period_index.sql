-- Migration 012: index for the weekly recap "Accomplished" query
-- (objects resolved within a time window, keyed on resolution timestamp).

CREATE INDEX IF NOT EXISTS idx_ao_resolved_in_period
  ON hub.atomic_objects (user_id, state_updated_at)
  WHERE deleted_at IS NULL AND state = 'resolved';
