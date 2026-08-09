/**
 * SQL migration runner.
 *
 * Why this exists: the `.sql` files in `src/db/migrations/` had no runner, no
 * tracking table, and no deploy step — they were applied by hand whenever
 * someone remembered. On 2026-08-06 `017_terms_acceptance.sql` shipped with the
 * ToS-acceptance feature and was never applied, so `User.create` inserted a
 * column that did not exist and **every signup in production failed for three
 * days**. Nobody noticed because existing sessions were unaffected.
 *
 * Design notes:
 *
 * - Every migration in this directory is idempotent (`IF NOT EXISTS` on tables,
 *   columns and indexes; `ADD CONSTRAINT` wrapped in `DO $$ … IF NOT EXISTS`).
 *   That is what lets this run without a baselining step: on the first run
 *   against an already-migrated database it simply re-executes them all
 *   harmlessly and records them, which self-heals any gap like the 017 one
 *   rather than requiring us to guess which files were applied by hand.
 *
 * - Failure is fatal. Serving traffic on a schema the code does not match is
 *   precisely the outage above; a hard exit instead leaves the previous
 *   deployment running and shows up as a failed deploy.
 *
 * - An advisory lock serialises concurrent boots, so scaling to more than one
 *   replica cannot run the same migration twice.
 *
 * Note that `tsc` does not copy `.sql` files into `dist/`, so the build script
 * has a copy step. If migrations appear to vanish in production, check that
 * first.
 */

import fs from 'fs';
import path from 'path';
import { pool } from './connection';

/** Arbitrary but fixed: distinguishes this lock from any other advisory lock. */
const MIGRATION_LOCK_ID = 947_213_884;

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

function readMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      `Migrations directory not found at ${MIGRATIONS_DIR}. ` +
        `If this is a built image, the build step is not copying *.sql into dist/.`
    );
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filenames are zero-padded, so lexical order is apply order
}

/**
 * Apply every migration not yet recorded in `hub.schema_migrations`.
 *
 * Throws on the first failure, leaving that migration's transaction rolled back
 * and every earlier one committed.
 */
export async function runMigrations(): Promise<MigrationResult> {
  const files = readMigrationFiles();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await client.query('CREATE SCHEMA IF NOT EXISTS hub');
    await client.query(`
      CREATE TABLE IF NOT EXISTS hub.schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM hub.schema_migrations'
    );
    const done = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) {
        skipped.push(file);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO hub.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(
          `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (applied.length === 0) {
      console.log(`[migrate] schema up to date (${skipped.length} migrations already applied)`);
    } else {
      console.log(`[migrate] applied ${applied.length}: ${applied.join(', ')}`);
    }

    return { applied, skipped };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

/**
 * Boot-time entry point: run migrations or take the process down.
 *
 * Deliberately fatal — a server that starts on the wrong schema fails later, in
 * production, in whichever code path happens to touch the missing column.
 */
export async function runMigrationsOrExit(): Promise<void> {
  try {
    await runMigrations();
  } catch (error) {
    console.error('[migrate] FATAL — refusing to start on an unmigrated schema:', error);
    process.exit(1);
  }
}
