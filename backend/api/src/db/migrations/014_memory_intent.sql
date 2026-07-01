-- 014_memory_intent.sql — Phase 8.1 memory-intent fields (additive, idempotent)

ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS why_it_matters  text;
ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS retention_policy text;
ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS trigger_context  text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='hub.atomic_objects'::regclass AND conname='atomic_objects_retention_policy_check') THEN
    ALTER TABLE hub.atomic_objects ADD CONSTRAINT atomic_objects_retention_policy_check
      CHECK (retention_policy IS NULL OR retention_policy IN
        ('temporary','until_done','long_term','decay','user_confirmed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='hub.atomic_objects'::regclass AND conname='atomic_objects_trigger_context_check') THEN
    ALTER TABLE hub.atomic_objects ADD CONSTRAINT atomic_objects_trigger_context_check
      CHECK (trigger_context IS NULL OR trigger_context IN
        ('place','time','person','topic','calendar','manual','none'));
  END IF;
END $$;

-- object_type CHECK: drop whatever exists (prod currently has none — drift), add expanded list
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid='hub.atomic_objects'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%object_type%';
  IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE hub.atomic_objects DROP CONSTRAINT ' || quote_ident(c); END IF;
END $$;
ALTER TABLE hub.atomic_objects ADD CONSTRAINT atomic_objects_object_type_check
  CHECK (object_type IS NULL OR object_type IN
    ('task','reminder','idea','observation','question','decision','journal','reference',
     'commitment','preference','concern'));

-- Backfill (mirrors memoryIntent.ts derive rules)
UPDATE hub.atomic_objects SET retention_policy = CASE
  WHEN object_type IN ('task','reminder','commitment') THEN 'until_done'
  WHEN object_type IN ('preference','decision')        THEN 'long_term'
  WHEN object_type IN ('concern','journal','observation') THEN 'decay'
  ELSE 'temporary' END
WHERE retention_policy IS NULL;

UPDATE hub.atomic_objects SET trigger_context = CASE
  WHEN (location_places IS NOT NULL AND array_length(location_places, 1) > 0)
       OR location_geofence_candidate THEN 'place'
  WHEN temporal_has_date THEN 'time'
  ELSE 'none' END
WHERE trigger_context IS NULL;
