/**
 * Derived memory-intent classification. Single source of truth for
 * retention_policy and trigger_context — reused at ingest and mirrored by the
 * migration 014 backfill. Captured now; enforced in later Phase 8 slices.
 */
export type RetentionPolicy = 'temporary' | 'until_done' | 'long_term' | 'decay' | 'user_confirmed';
export type TriggerContext = 'place' | 'time' | 'person' | 'topic' | 'calendar' | 'manual' | 'none';

export function retentionPolicyFor(objectType?: string | null): RetentionPolicy {
  switch (objectType) {
    case 'task':
    case 'reminder':
    case 'commitment':
      return 'until_done';
    case 'preference':
    case 'decision':
      return 'long_term';
    case 'concern':
    case 'journal':
    case 'observation':
      return 'decay';
    default: // idea, question, reference, null, unknown
      return 'temporary';
  }
}

export function triggerContextFor(signals: {
  places?: string[] | null;
  geofenceCandidate?: boolean | null;
  hasDate?: boolean | null;
}): TriggerContext {
  if ((signals.places && signals.places.length > 0) || signals.geofenceCandidate) return 'place';
  if (signals.hasDate) return 'time';
  return 'none';
}
