/**
 * Migration runner.
 *
 * The properties worth pinning are the ones whose absence caused, or would
 * repeat, the Aug 2026 signup outage: migrations must run in filename order,
 * already-applied ones must be skipped, a recorded row must only exist if the
 * SQL committed, and a failure must propagate rather than let the server come
 * up on a schema the code does not match.
 */

import path from 'path';
import fs from 'fs';
import { runMigrations } from '../../db/migrate';
import { pool } from '../../db/connection';

jest.mock('../../db/connection', () => ({
  pool: { connect: jest.fn() },
}));

const mockPool = pool as unknown as { connect: jest.Mock };

let client: { query: jest.Mock; release: jest.Mock };
let executed: string[];

/** Files actually on disk — the runner reads the real migrations directory. */
const realFiles = fs
  .readdirSync(path.join(__dirname, '../../db/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

function setupClient(alreadyApplied: string[] = [], failOn?: string) {
  executed = [];
  client = {
    query: jest.fn(async (sql: string, params?: any[]) => {
      executed.push(sql.trim().split('\n')[0].slice(0, 60));

      if (sql.includes('SELECT filename FROM hub.schema_migrations')) {
        return { rows: alreadyApplied.map((f) => ({ filename: f })) };
      }
      if (failOn && sql.includes(failOn)) {
        throw new Error('syntax error at or near "boom"');
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  mockPool.connect.mockResolvedValue(client);
}

/** Filenames passed to the INSERT that records a migration as applied. */
function recorded(): string[] {
  return client.query.mock.calls
    .filter(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO hub.schema_migrations'))
    .map(([, params]) => (params as string[])[0]);
}

describe('runMigrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('applies every migration on a virgin database, in filename order', async () => {
    setupClient([]);
    const result = await runMigrations();
    expect(result.applied).toEqual(realFiles);
    expect(recorded()).toEqual(realFiles);
  });

  it('skips migrations already recorded', async () => {
    const done = realFiles.slice(0, 3);
    setupClient(done);
    const result = await runMigrations();
    expect(result.skipped).toEqual(done);
    expect(result.applied).toEqual(realFiles.slice(3));
    expect(recorded()).not.toContain(done[0]);
  });

  it('does nothing when the schema is already up to date', async () => {
    setupClient(realFiles);
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(recorded()).toEqual([]);
  });

  it('would have caught the 017 gap — an unrecorded migration still runs', async () => {
    // Exactly the Aug 2026 state: everything applied by hand except the last one.
    const allButLast = realFiles.slice(0, -1);
    setupClient(allButLast);
    const result = await runMigrations();
    expect(result.applied).toEqual([realFiles[realFiles.length - 1]]);
  });

  it('serialises concurrent boots with an advisory lock, and always releases it', async () => {
    setupClient([]);
    await runMigrations();
    expect(executed.some((s) => s.includes('pg_advisory_lock'))).toBe(true);
    expect(executed.some((s) => s.includes('pg_advisory_unlock'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back and rethrows on a failing migration, and records nothing for it', async () => {
    // Fail on a statement unique to the first migration's body.
    setupClient([], 'CREATE TABLE IF NOT EXISTS hub.users');

    await expect(runMigrations()).rejects.toThrow(/Migration .*\.sql failed/);

    expect(executed.some((s) => s.includes('ROLLBACK'))).toBe(true);
    expect(recorded()).toEqual([]);
  });

  it('releases the lock even when a migration throws', async () => {
    setupClient([], 'CREATE TABLE IF NOT EXISTS hub.users');
    await expect(runMigrations()).rejects.toThrow();
    expect(executed.some((s) => s.includes('pg_advisory_unlock'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('creates the tracking table before reading it', async () => {
    setupClient([]);
    await runMigrations();
    const createIdx = executed.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS hub.schema_mig'));
    const selectIdx = executed.findIndex((s) => s.includes('SELECT filename FROM hub.schema_migrations'));
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeLessThan(selectIdx);
  });
});

describe('migration files', () => {
  it('are all idempotent — the runner re-applies unrecorded files against a live schema', () => {
    // If someone adds a bare CREATE TABLE / ADD COLUMN, the first boot after
    // deploy re-runs it against a database that already has the object and the
    // server refuses to start. Guarded forms only.
    const offenders: string[] = [];
    for (const f of realFiles) {
      const sql = fs.readFileSync(path.join(__dirname, '../../db/migrations', f), 'utf8');
      const stripped = sql.replace(/--.*$/gm, '');
      const bare = /\b(CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)|ADD\s+COLUMN)\b(?![\s\S]{0,40}IF\s+NOT\s+EXISTS)/gi;
      let m: RegExpExecArray | null;
      while ((m = bare.exec(stripped)) !== null) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
