-- Migration 011: Geofence trigger state (re-fire cooldown for manual geofences)
-- Mirrors hub.place_trigger_state so manual geofences get the same anti-spam cooldown.

CREATE SCHEMA IF NOT EXISTS hub;

CREATE TABLE IF NOT EXISTS hub.geofence_trigger_state (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  geofence_id      uuid        NOT NULL REFERENCES hub.geofences(id) ON DELETE CASCADE,
  last_entered_at  timestamptz,
  last_notified_at timestamptz,
  cooldown_until   timestamptz,
  visit_count      integer     NOT NULL DEFAULT 0,
  UNIQUE(user_id, geofence_id)
);

CREATE INDEX IF NOT EXISTS gts_user_geofence_idx
  ON hub.geofence_trigger_state(user_id, geofence_id);
