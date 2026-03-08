-- Migration 008: lifecycle state, scoring, and decision outcome fields on hub.atomic_objects

ALTER TABLE hub.atomic_objects
  -- Lifecycle state machine
  ADD COLUMN IF NOT EXISTS state              text DEFAULT 'open'
    CHECK (state IN ('open', 'active', 'resolved', 'archived')),
  ADD COLUMN IF NOT EXISTS state_updated_at  timestamptz,

  -- Importance / resurfacing signals
  ADD COLUMN IF NOT EXISTS importance_score  decimal(4,3) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS mention_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed_at  timestamptz,

  -- Decision outcome tracking
  ADD COLUMN IF NOT EXISTS expected_outcome      text,
  ADD COLUMN IF NOT EXISTS actual_outcome        text,
  ADD COLUMN IF NOT EXISTS outcome_evaluated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_accuracy      decimal(3,2),

  -- Thought evolution
  ADD COLUMN IF NOT EXISTS evolved_from_id   uuid
    REFERENCES hub.atomic_objects(id) ON DELETE SET NULL;

-- Indexes for new query patterns
CREATE INDEX IF NOT EXISTS idx_ao_state ON hub.atomic_objects (state)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ao_importance_score ON hub.atomic_objects (importance_score DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ao_last_accessed ON hub.atomic_objects (last_accessed_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ao_evolved_from ON hub.atomic_objects (evolved_from_id)
  WHERE evolved_from_id IS NOT NULL;

-- Partial index for dormancy detection
CREATE INDEX IF NOT EXISTS idx_ao_idea_dormancy ON hub.atomic_objects (user_id, importance_score, last_accessed_at)
  WHERE deleted_at IS NULL AND state = 'open' AND object_type = 'idea';

-- Partial index for decision review
CREATE INDEX IF NOT EXISTS idx_ao_decision_review ON hub.atomic_objects (user_id, created_at)
  WHERE deleted_at IS NULL AND object_type = 'decision' AND outcome_evaluated_at IS NULL;
