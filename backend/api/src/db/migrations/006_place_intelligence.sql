-- Migration 006: Place Intelligence Engine
-- Adds places, object_place_links, place_trigger_state tables
-- Extends hub.geofences with place_id and created_by columns

-- ─── hub.places ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hub.places (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  raw_name           text        NOT NULL,
  normalized_name    text        NOT NULL,
  provider_place_id  text,
  lat                decimal(10,8) NOT NULL,
  lng                decimal(11,8) NOT NULL,
  radius_meters      integer     NOT NULL DEFAULT 150,
  category           text,
  confidence         decimal(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  user_confirmed     boolean     NOT NULL DEFAULT false,
  created_by         varchar(10) NOT NULL DEFAULT 'inferred'
                       CHECK (created_by IN ('manual', 'inferred')),
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS places_user_id_idx
  ON hub.places(user_id);

CREATE INDEX IF NOT EXISTS places_user_name_idx
  ON hub.places(user_id, lower(normalized_name));

-- ─── hub.object_place_links ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hub.object_place_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id        uuid        NOT NULL REFERENCES hub.atomic_objects(id) ON DELETE CASCADE,
  place_id         uuid        NOT NULL REFERENCES hub.places(id) ON DELETE CASCADE,
  relevance_score  decimal(3,2) DEFAULT 1.0,
  link_reason      varchar(30) NOT NULL DEFAULT 'mentioned_in_note',
  active           boolean     NOT NULL DEFAULT true,
  dismissed_at     timestamptz,
  snoozed_until    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(object_id, place_id)
);

CREATE INDEX IF NOT EXISTS opl_place_id_idx
  ON hub.object_place_links(place_id);

CREATE INDEX IF NOT EXISTS opl_object_id_idx
  ON hub.object_place_links(object_id);

CREATE INDEX IF NOT EXISTS opl_active_idx
  ON hub.object_place_links(place_id, active)
  WHERE active = true;

-- ─── hub.place_trigger_state ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hub.place_trigger_state (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  place_id         uuid        NOT NULL REFERENCES hub.places(id) ON DELETE CASCADE,
  last_entered_at  timestamptz,
  last_notified_at timestamptz,
  cooldown_until   timestamptz,
  visit_count      integer     NOT NULL DEFAULT 0,
  UNIQUE(user_id, place_id)
);

CREATE INDEX IF NOT EXISTS pts_user_place_idx
  ON hub.place_trigger_state(user_id, place_id);

-- ─── Extend hub.geofences ─────────────────────────────────────────────────────

ALTER TABLE hub.geofences
  ADD COLUMN IF NOT EXISTS place_id
    uuid REFERENCES hub.places(id) ON DELETE SET NULL;

ALTER TABLE hub.geofences
  ADD COLUMN IF NOT EXISTS created_by
    varchar(10) NOT NULL DEFAULT 'manual';

-- Add check constraint only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'geofences_created_by_check'
      AND conrelid = 'hub.geofences'::regclass
  ) THEN
    ALTER TABLE hub.geofences
      ADD CONSTRAINT geofences_created_by_check
      CHECK (created_by IN ('manual', 'inferred'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS geofences_created_by_idx
  ON hub.geofences(user_id, created_by);
