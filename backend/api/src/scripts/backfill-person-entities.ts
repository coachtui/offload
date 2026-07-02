/**
 * One-shot backfill: LLM-classify existing entity strings and retype
 * metadata_entities entries from 'other' to 'person'.
 *
 * Usage (local only, never deployed):
 *   DATABASE_URL=<prod-public-url> npm run backfill-person-entities
 * Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment.
 *
 * Safe to re-run: classification happens fully BEFORE any write; entries
 * already typed 'person' are left alone.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../db/connection';
import { callLLM } from '../services/sparringService';

interface EntityEntry {
  type: string;
  value: string;
  confidence: number;
}

interface Row {
  id: string;
  metadata_entities: EntityEntry[];
}

const SYSTEM_PROMPT =
  'You classify strings. Reply with ONLY a JSON array (no prose) containing the subset of the input strings that are names of individual people — first names, full names, or nicknames. Exclude companies, places, products, job roles, and generic words.';

const CHUNK_SIZE = 100;

async function main(): Promise<void> {
  const { rows } = await pool.query<Row>(
    `SELECT id, metadata_entities
     FROM hub.atomic_objects
     WHERE deleted_at IS NULL
       AND metadata_entities IS NOT NULL
       AND CASE WHEN jsonb_typeof(metadata_entities) = 'array'
                THEN jsonb_array_length(metadata_entities) > 0
                ELSE false END`
  );

  const distinct = [...new Set(rows.flatMap((r) => r.metadata_entities.map((e) => e.value)))];
  console.log(`${rows.length} objects with entities; ${distinct.length} distinct strings`);
  if (distinct.length === 0) {
    await pool.end();
    return;
  }

  // Classify everything BEFORE writing anything — an LLM failure aborts cleanly.
  const persons = new Set<string>();
  for (let i = 0; i < distinct.length; i += CHUNK_SIZE) {
    const chunk = distinct.slice(i, i + CHUNK_SIZE);
    const reply = await callLLM(SYSTEM_PROMPT, JSON.stringify(chunk));
    const match = reply.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`Unparseable LLM reply: ${reply.slice(0, 200)}`);
    for (const name of JSON.parse(match[0]) as string[]) {
      persons.add(name.toLowerCase());
    }
  }
  console.log(`Classified ${persons.size} person names:`, [...persons].sort().join(', '));

  let updated = 0;
  for (const row of rows) {
    let changed = false;
    const next = row.metadata_entities.map((e) => {
      if (e.type === 'other' && persons.has(e.value?.toLowerCase())) {
        changed = true;
        return { ...e, type: 'person' };
      }
      return e;
    });
    if (changed) {
      await pool.query(
        'UPDATE hub.atomic_objects SET metadata_entities = $1 WHERE id = $2',
        [JSON.stringify(next), row.id]
      );
      updated++;
    }
  }
  console.log(`Updated ${updated} objects`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-person-entities] failed:', err);
  process.exit(1);
});
