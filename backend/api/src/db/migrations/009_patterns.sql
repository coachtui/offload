-- Migration 009: hub.patterns — persistent synthesis pattern storage
-- Stores patterns extracted from weekly synthesis sessions.
-- Enables long-term trend analysis and idea resurfacing.

CREATE TABLE IF NOT EXISTS hub.patterns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  synthesis_session_id uuid REFERENCES hub.sessions(id) ON DELETE SET NULL,
  period_start         timestamptz NOT NULL,
  period_end           timestamptz NOT NULL,
  description          text NOT NULL,
  pattern_type         text CHECK (pattern_type IN (
                         'theme', 'behavior', 'contradiction', 'focus', 'habit'
                       )),
  frequency            integer NOT NULL DEFAULT 1,
  first_seen_at        timestamptz NOT NULL DEFAULT NOW(),
  last_seen_at         timestamptz NOT NULL DEFAULT NOW(),
  domains              text[] NOT NULL DEFAULT '{}',
  object_ids           uuid[] NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_user_id      ON hub.patterns (user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_last_seen    ON hub.patterns (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_pattern_type ON hub.patterns (user_id, pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_session      ON hub.patterns (synthesis_session_id);
