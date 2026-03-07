/**
 * Retention job — hard-deletes soft-deleted objects after 30 days.
 * Runs hourly. Safe to call multiple times (idempotent).
 */

import { AtomicObjectModel } from '../models/AtomicObject';

const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SOFT_DELETE_RETENTION_DAYS = 30;

let running = false;

/**
 * Hard-delete all objects soft-deleted more than SOFT_DELETE_RETENTION_DAYS ago.
 * Returns a summary of results.
 */
export async function purgeExpiredObjects(): Promise<{
  found: number;
  purged: number;
  failed: number;
}> {
  const objects = await AtomicObjectModel.findExpiredSoftDeleted(SOFT_DELETE_RETENTION_DAYS);
  const result = { found: objects.length, purged: 0, failed: 0 };
  if (objects.length === 0) return result;

  console.log(`[retentionJob] Purging ${objects.length} expired object(s)`);

  for (const obj of objects) {
    try {
      await obj.delete();
      result.purged++;
    } catch (err: any) {
      result.failed++;
      console.error(`[retentionJob] Failed to purge ${obj.id}: ${err.message}`);
    }
  }

  console.log(`[retentionJob] Done — ${result.purged} purged, ${result.failed} failed`);
  return result;
}

/**
 * Start the periodic retention job. Safe to call multiple times (idempotent).
 */
export function startRetentionJob(): void {
  console.log(`[retentionJob] Starting job (interval: ${RETENTION_INTERVAL_MS / 1000 / 60}min, retention: ${SOFT_DELETE_RETENTION_DAYS} days)`);

  setInterval(async () => {
    if (running) {
      console.log('[retentionJob] Previous run still in progress, skipping');
      return;
    }
    running = true;
    try {
      await purgeExpiredObjects();
    } catch (err: any) {
      console.error('[retentionJob] Unexpected error:', err.message);
    } finally {
      running = false;
    }
  }, RETENTION_INTERVAL_MS);
}
