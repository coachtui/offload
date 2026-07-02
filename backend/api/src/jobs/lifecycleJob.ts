/**
 * Lifecycle enforcement — archives notes whose retention window has passed,
 * per the 8.1 retention policies (captured then; enforced here):
 *   until_done  → archived 7 days after resolution
 *   reminder    → archived 3 days after its time-reminder fired (never resolved)
 *   decay       → archived 90 days after creation with no retrieval in 90 days
 *   long_term / user_confirmed → never touched.
 * Archive is reversible (existing state machine); the 30-day purge of
 * soft-DELETED rows lives in retentionJob and is unrelated.
 */
import { query } from '../db/queries';

const INTERVAL_MS = 60 * 60 * 1000; // hourly

let running = false;

export async function runLifecycleSweep(): Promise<{
  resolvedArchived: number;
  firedArchived: number;
  decayedArchived: number;
}> {
  const resolved = await query(
    `UPDATE hub.atomic_objects
     SET state = 'archived', state_updated_at = NOW()
     WHERE deleted_at IS NULL
       AND retention_policy = 'until_done'
       AND state = 'resolved'
       AND state_updated_at < NOW() - INTERVAL '7 days'`
  );

  const fired = await query(
    `UPDATE hub.atomic_objects
     SET state = 'archived', state_updated_at = NOW()
     WHERE deleted_at IS NULL
       AND object_type = 'reminder'
       AND reminder_fired_at IS NOT NULL
       AND reminder_fired_at < NOW() - INTERVAL '3 days'
       AND state IN ('open', 'active')`
  );

  const decayed = await query(
    `UPDATE hub.atomic_objects
     SET state = 'archived', state_updated_at = NOW()
     WHERE deleted_at IS NULL
       AND retention_policy = 'decay'
       AND created_at < NOW() - INTERVAL '90 days'
       AND (last_accessed_at IS NULL OR last_accessed_at < NOW() - INTERVAL '90 days')
       AND state IN ('open', 'active')`
  );

  return {
    resolvedArchived: resolved.rowCount ?? 0,
    firedArchived: fired.rowCount ?? 0,
    decayedArchived: decayed.rowCount ?? 0,
  };
}

export function startLifecycleJob(): void {
  console.log('[lifecycleJob] Starting — hourly retention-policy sweep');
  setInterval(async () => {
    if (running) {
      console.log('[lifecycleJob] Previous run still in progress, skipping');
      return;
    }
    running = true;
    try {
      const r = await runLifecycleSweep();
      const total = r.resolvedArchived + r.firedArchived + r.decayedArchived;
      if (total > 0) {
        console.log(
          `[lifecycleJob] Archived ${total} — resolved: ${r.resolvedArchived}, fired reminders: ${r.firedArchived}, decayed: ${r.decayedArchived}`
        );
      }
    } catch (err) {
      console.error('[lifecycleJob] sweep failed:', err);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
}
