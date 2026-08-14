-- 022_object_corrections.sql — user corrections of parsed atomic objects
--
-- When the parser gets a note wrong — calls a commitment an idea, files a
-- jobsite note under Personal, mangles a title — the user's correction is the
-- single most valuable signal this system can collect: a labelled
-- (what the model said, what it should have said) pair, in the user's own
-- domain vocabulary. It is what prompt tuning, few-shot examples, or an
-- eventual fine-tune would be built from.
--
-- This previously lived in the ml-service as an append-only JSONL file at
-- CORRECTIONS_LOG_PATH, defaulting to /tmp — which is ephemeral on Railway, so
-- anything written there died at the next deploy. Nothing had ever called that
-- endpoint, so no data was lost, but the storage was never going to work.
--
-- It belongs here instead: corrections are user data about atomic objects, and
-- this service already owns the objects, the per-user auth, and a durable
-- database. The ml-service is deliberately stateless.

CREATE TABLE IF NOT EXISTS hub.object_corrections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cascade: account deletion purges corrections with the user row, the same
  -- way every other user-owned table does.
  user_id         uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,

  -- Cascade rather than SET NULL, deliberately. corrected_value holds the
  -- user's own words; if they delete the note, the text they wrote about it
  -- should go too. That costs some training data, which is the right trade in
  -- an app whose promise is that deleting a note deletes it.
  object_id       uuid        NOT NULL REFERENCES hub.atomic_objects(id) ON DELETE CASCADE,

  -- Which field the parser got wrong.
  field           text        NOT NULL CHECK (field IN (
                                'type', 'domain', 'cleaned_text', 'title',
                                'tags', 'actionability', 'other')),

  original_value  text,       -- what the parser produced (null if it produced nothing)
  corrected_value text        NOT NULL,
  note            text,       -- optional free-text comment from the user

  created_at      timestamptz NOT NULL DEFAULT NOW()
);

-- Reading the trail for one user, newest first.
CREATE INDEX IF NOT EXISTS object_corrections_user_idx
  ON hub.object_corrections(user_id, created_at DESC);

-- "Has this object already been corrected?" — and the join for exporting
-- training pairs alongside their source objects.
CREATE INDEX IF NOT EXISTS object_corrections_object_idx
  ON hub.object_corrections(object_id);

-- One correction per (object, field): a second correction of the same field is
-- the user changing their mind, not a new data point. Upsert overwrites.
CREATE UNIQUE INDEX IF NOT EXISTS object_corrections_object_field_key
  ON hub.object_corrections(object_id, field);

COMMENT ON TABLE hub.object_corrections IS
  'User corrections of parser output. Labelled (original, corrected) pairs — '
  'the seed for prompt tuning or a future fine-tune. Replaces the ml-service '
  'JSONL log, which wrote to ephemeral /tmp.';
