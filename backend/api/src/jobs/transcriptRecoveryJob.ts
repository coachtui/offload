/**
 * Recovery sweep for transcripts whose processing never finished.
 *
 * Processing runs in-process via setImmediate, so anything in flight dies with
 * the process — and on Railway that happens on every deploy, not just crashes.
 * The session is left in 'processing' forever and the user's note is never
 * sorted, even though the transcript itself was safely stored.
 *
 * This is the piece that makes "return immediately" honest: the write is
 * durable, and the work after it is guaranteed to be retried rather than merely
 * likely to succeed.
 */

import { Session } from '../models/Session';
import { processSessionInBackground } from '../services/transcriptProcessingService';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * How long a session may sit in 'processing' before it is presumed abandoned.
 *
 * Must comfortably exceed the worst legitimate run: a five-minute note is a
 * ~90s parse plus concurrent writes. Too low and the sweep starts a second run
 * alongside one that is merely slow, double-writing every object.
 */
const STUCK_AFTER_MS = 10 * 60 * 1000; // 10 minutes

const BATCH_SIZE = 20;

let running = false;

/** Re-run abandoned sessions. Returns how many were picked up. */
export async function recoverStuckTranscripts(): Promise<{ found: number; recovered: number }> {
  const result = { found: 0, recovered: 0 };

  // Claim one at a time rather than reading a batch and looping over it. The
  // claim is atomic, so a concurrent sweep on another instance takes different
  // rows instead of duplicating this one's work. Sequential on purpose too:
  // these are already-late jobs competing with live traffic, and each one
  // internally fans out its own object writes.
  for (let i = 0; i < BATCH_SIZE; i++) {
    const session = await Session.claimStuckProcessing(STUCK_AFTER_MS);
    if (!session) break;

    result.found++;
    try {
      await processSessionInBackground(session);
      result.recovered++;
      console.log(`[transcriptRecovery] ✅ ${session.id}`);
    } catch (err: any) {
      console.error(`[transcriptRecovery] ❌ ${session.id}: ${err?.message ?? err}`);
    }
  }

  if (result.found > 0) {
    console.log(`[transcriptRecovery] Done — ${result.recovered}/${result.found} recovered`);
  }
  return result;
}

/** Start the periodic sweep. Safe to call multiple times (idempotent). */
export function startTranscriptRecoveryJob(): void {
  console.log(
    `[transcriptRecovery] Starting job (interval: ${SWEEP_INTERVAL_MS / 1000}s, ` +
      `stuck after: ${STUCK_AFTER_MS / 1000}s)`
  );

  setInterval(async () => {
    if (running) {
      console.log('[transcriptRecovery] Previous run still in progress, skipping');
      return;
    }
    running = true;
    try {
      await recoverStuckTranscripts();
    } catch (err) {
      console.error('[transcriptRecovery] Sweep failed:', err);
    } finally {
      running = false;
    }
  }, SWEEP_INTERVAL_MS);
}
