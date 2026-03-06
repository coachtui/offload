/**
 * Embedding retry job — periodically retries objects with embedding_status = 'failed'
 */

import { AtomicObjectModel } from '../models/AtomicObject';
import { storeInVector } from '../services/vectorService';

const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 50;

let running = false;

/**
 * Retry all failed embeddings. Returns a summary of results.
 */
export async function retryFailedEmbeddings(): Promise<{
  found: number;
  succeeded: number;
  failed: number;
}> {
  const objects = await AtomicObjectModel.findFailedEmbeddings(BATCH_SIZE);

  const result = { found: objects.length, succeeded: 0, failed: 0 };
  if (objects.length === 0) return result;

  console.log(`[embeddingRetry] Retrying ${objects.length} failed embedding(s)`);

  await Promise.all(
    objects.map(async (obj) => {
      try {
        await storeInVector(obj.toAtomicObject());
        await AtomicObjectModel.updateEmbeddingStatus(obj.id, 'complete');
        result.succeeded++;
        console.log(`[embeddingRetry] ✅ ${obj.id}`);
      } catch (err: any) {
        result.failed++;
        console.error(`[embeddingRetry] ❌ ${obj.id}: ${err.message}`);
      }
    })
  );

  console.log(
    `[embeddingRetry] Done — ${result.succeeded} succeeded, ${result.failed} still failing`
  );
  return result;
}

/**
 * Start the periodic retry job. Safe to call multiple times (idempotent).
 */
export function startEmbeddingRetryJob(): void {
  console.log(
    `[embeddingRetry] Starting job (interval: ${RETRY_INTERVAL_MS / 1000}s)`
  );

  setInterval(async () => {
    if (running) {
      console.log('[embeddingRetry] Previous run still in progress, skipping');
      return;
    }
    running = true;
    try {
      await retryFailedEmbeddings();
    } catch (err: any) {
      console.error('[embeddingRetry] Unexpected error:', err.message);
    } finally {
      running = false;
    }
  }, RETRY_INTERVAL_MS);
}
