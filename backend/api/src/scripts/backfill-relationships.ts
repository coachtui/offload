/**
 * One-time script to backfill hub.relationships for all existing objects.
 * Run with: npx ts-node backend/api/src/scripts/backfill-relationships.ts
 *
 * Options:
 *   --dry-run    Log what would happen without writing
 *   --limit=N    Process only the first N objects (default: all)
 *   --batch=N    Batch size (default: 20)
 *   --delay=N    MS delay between batches (default: 100)
 */

import dotenv from 'dotenv';
dotenv.config({ path: require('path').join(__dirname, '../../.env') });

import { pool } from '../db/connection';
import { updateObjectRelationships } from '../services/relationshipService';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const batchArg = args.find((a) => a.startsWith('--batch='));
  const delayArg = args.find((a) => a.startsWith('--delay='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 20;
  const delayMs = delayArg ? parseInt(delayArg.split('=')[1], 10) : 100;

  console.log('[backfill-relationships] Starting...');
  console.log(`  dry-run: ${dryRun}`);
  console.log(`  limit:   ${limit === Infinity ? 'all' : limit}`);
  console.log(`  batch:   ${batchSize}`);
  console.log(`  delay:   ${delayMs}ms between batches`);

  // Fetch all objects with completed embeddings, ordered newest first
  const result = await pool.query(
    `SELECT id, user_id FROM hub.atomic_objects
     WHERE deleted_at IS NULL AND embedding_status = 'complete'
     ORDER BY created_at DESC
     ${limit !== Infinity ? `LIMIT ${limit}` : ''}`
  );

  const objects = result.rows as { id: string; user_id: string }[];
  console.log(`[backfill-relationships] Found ${objects.length} objects to process`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);

    if (dryRun) {
      console.log(`[backfill-relationships] [dry-run] Would process batch ${i / batchSize + 1} (${batch.length} objects)`);
      processed += batch.length;
      continue;
    }

    await Promise.all(
      batch.map(async (obj) => {
        try {
          await updateObjectRelationships(obj.id, obj.user_id);
          processed++;
        } catch (err) {
          console.error(`[backfill-relationships] Failed for object ${obj.id}:`, err);
          failed++;
        }
      })
    );

    console.log(
      `[backfill-relationships] Batch ${Math.ceil(i / batchSize) + 1}/${Math.ceil(objects.length / batchSize)} — processed: ${processed}, failed: ${failed}`
    );

    if (i + batchSize < objects.length) {
      await sleep(delayMs);
    }
  }

  console.log(`[backfill-relationships] Complete — processed: ${processed}, failed: ${failed}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-relationships] Fatal error:', err);
  process.exit(1);
});
