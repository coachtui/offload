-- 018_place_lookups.sql — place-lookup fallback (additive, idempotent)
--
-- hub.place_lookups: what happened when a spoken place name could not be
-- silently resolved. One table serving three roles: the "needs your help"
-- queue the UI renders, the retry ledger a later provider/backfill re-runs,
-- and — via status='dismissed' rows — the per-user ignore list that stops a
-- word from re-queueing on every future note (no separate ignore table).
--
-- hub.place_provider_cache: geocoder responses keyed on (query, ~11 km cell,
-- provider). The same user says "Melaleuca" every month; a repeat lookup
-- should cost zero provider calls — and zero Google spend.
--
-- hub.users home columns: cached home-region centroid for search anchoring
-- (placeAnchors.ts) — what makes a note recorded on the mainland resolve to
-- the store at home.

CREATE TABLE IF NOT EXISTS hub.place_lookups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  object_id         uuid        NOT NULL REFERENCES hub.atomic_objects(id) ON DELETE CASCADE,
  query             text        NOT NULL,
  status            varchar(10) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','resolved','dismissed')),
  -- ProviderCandidate[] as returned by the provider chain; empty when no
  -- provider answered ('none' verdict) and 2 entries on 'ambiguous'.
  candidates        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Which provider produced the candidates; null when none answered.
  provider          varchar(10),
  -- Where the note was recorded — lets the UI show distances and a later
  -- backfill re-anchor the search.
  recorded_lat      decimal(10,8),
  recorded_lng      decimal(11,8),
  resolved_place_id uuid        REFERENCES hub.places(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW()
);

-- One lookup per (note, name): re-processing a transcript must not duplicate
-- the question.
CREATE UNIQUE INDEX IF NOT EXISTS place_lookups_object_query_idx
  ON hub.place_lookups(object_id, lower(query));

CREATE INDEX IF NOT EXISTS place_lookups_user_pending_idx
  ON hub.place_lookups(user_id, created_at DESC)
  WHERE status = 'pending';

-- Ignore-list membership: "has this user dismissed this word before?"
CREATE INDEX IF NOT EXISTS place_lookups_user_dismissed_idx
  ON hub.place_lookups(user_id, lower(query))
  WHERE status = 'dismissed';

CREATE TABLE IF NOT EXISTS hub.place_provider_cache (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- lower(query) at write time; ~0.1° cell (≈11 km) so a name looked up
  -- anywhere in a metro hits one row.
  query_key    text        NOT NULL,
  cell_lat     decimal(5,1) NOT NULL,
  cell_lng     decimal(5,1) NOT NULL,
  provider     varchar(10) NOT NULL,
  candidates   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(query_key, cell_lat, cell_lng, provider)
);

-- Home-region centroid cache (placeAnchors computes; recomputed when stale).
ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS home_lat decimal(10,8);
ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS home_lng decimal(11,8);
ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS home_computed_at timestamptz;
