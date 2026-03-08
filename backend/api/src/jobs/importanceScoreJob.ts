/**
 * Importance Score Refresh Job
 * Runs daily at ~02:00 UTC.
 * Recomputes importance_score for all active objects based on:
 *   - ML confidence (30%)
 *   - Recency (30%, decays over 30 days)
 *   - Mention frequency (40%, capped at 10 mentions = 1.0)
 */

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_SIZE = 500;

let running = false;

async function refreshImportanceScores(): Promise<{ updated: number; batches: number }> {
  if (running) {
    console.log('[importanceScoreJob] Already running, skipping');
    return { updated: 0, batches: 0 };
  }
  running = true;

  let updated = 0;
  let batches = 0;

  try {
    // Count total objects to process
    const { pool } = await import('../db/connection');
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects WHERE deleted_at IS NULL`
    );
    const total = parseInt(countResult.rows[0].count, 10);
    console.log(`[importanceScoreJob] Refreshing importance scores for ${total} objects`);

    // Process in batches via offset
    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const result = await pool.query(
        `UPDATE hub.atomic_objects
         SET importance_score = LEAST(1.0, GREATEST(0.0,
           (COALESCE(confidence, 0.5) * 0.30) +
           (EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / (30 * 86400.0)) * 0.30) +
           (LEAST(COALESCE(mention_count, 0)::float / 10.0, 1.0) * 0.40)
         ))
         WHERE id IN (
           SELECT id FROM hub.atomic_objects
           WHERE deleted_at IS NULL
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2
         )`,
        [BATCH_SIZE, offset]
      );
      updated += result.rowCount ?? 0;
      batches++;
    }

    console.log(`[importanceScoreJob] Done — updated ${updated} objects in ${batches} batches`);
  } catch (error) {
    console.error('[importanceScoreJob] Error refreshing importance scores:', error);
  } finally {
    running = false;
  }

  return { updated, batches };
}

export async function runImportanceScoreRefreshOnce(dryRun = false): Promise<{ updated: number; batches: number }> {
  if (dryRun) {
    console.log('[importanceScoreJob] Dry run — no changes made');
    return { updated: 0, batches: 0 };
  }
  return refreshImportanceScores();
}

export function startImportanceScoreJob(): void {
  console.log('[importanceScoreJob] Starting — runs every 24h');

  // Run immediately on startup (with slight delay to let connections settle)
  setTimeout(() => {
    refreshImportanceScores().catch((err) =>
      console.error('[importanceScoreJob] Initial run failed:', err)
    );
  }, 30000); // 30s after startup

  // Then every 24h
  setInterval(() => {
    refreshImportanceScores().catch((err) =>
      console.error('[importanceScoreJob] Scheduled run failed:', err)
    );
  }, INTERVAL_MS);
}
