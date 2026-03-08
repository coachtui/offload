-- Migration 007: hub.relationships graph table
-- Stores typed, directed edges between atomic objects.
-- Replaces UUID array storage on atomic_objects (kept for backward compat during transition).

CREATE TABLE IF NOT EXISTS hub.relationships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  source_id       uuid NOT NULL REFERENCES hub.atomic_objects(id) ON DELETE CASCADE,
  target_id       uuid NOT NULL REFERENCES hub.atomic_objects(id) ON DELETE CASCADE,
  edge_type       text NOT NULL CHECK (edge_type IN (
                    'related_to', 'contradicts', 'supports',
                    'mentioned_with', 'triggered_at_location',
                    'evolved_from', 'references', 'temporal'
                  )),
  confidence      decimal(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_by      text NOT NULL DEFAULT 'system'
                    CHECK (created_by IN ('system', 'user', 'synthesis')),
  created_at      timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT no_self_loop   CHECK (source_id != target_id),
  CONSTRAINT unique_edge    UNIQUE (source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_user_id        ON hub.relationships (user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source_id      ON hub.relationships (source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target_id      ON hub.relationships (target_id);
CREATE INDEX IF NOT EXISTS idx_relationships_user_edge_type ON hub.relationships (user_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_relationships_source_edge    ON hub.relationships (source_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_relationships_target_edge    ON hub.relationships (target_id, edge_type);
