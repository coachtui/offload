# Phase 8.4 Retention & Reinforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-capturing a thought supersedes the old note (new note lives, old archives, reinforcement count carries +1 via the dormant `evolved_from_id` chain), and an hourly lifecycle job enforces the 8.1 retention policies (resolved +7d, fired reminders +3d, decay +90d untouched → archived).

**Architecture:** New `reinforcementService.ts` — a pure gate (`shouldSupersede`) plus an `applySupersede` action that runs in the existing fire-and-forget post-save block in `objectService.createObject` (embedding already stored; zero save latency; errors swallowed). New `lifecycleJob.ts` mirrors the existing `setInterval` job pattern with three set-based UPDATEs. **No migration** — `evolved_from_id`, `mention_count`, `retention_policy`, `state`/`state_updated_at`, `reminder_fired_at`, `last_accessed_at` all exist.

**Tech Stack:** Node/TypeScript (backend/api), PostgreSQL, existing `findSimilar` (Weaviate) + `AtomicObjectModel`, jest. **Backend-only — no mobile changes, no OTA, no ml-service changes.**

**Spec:** `docs/superpowers/specs/2026-07-02-retention-reinforcement-design.md`

## Global Constraints

- Work on branch `feature/retention-reinforcement` off `main`.
- Supersede gate (ALL required): score **≥ 0.85** (`SUPERSEDE_MIN_SCORE`); same `object_type`; match state `open`/`active`; match ≠ candidate; candidate type ∈ {`task`, `reminder`, `commitment`, `concern`} (`SUPERSEDE_ELIGIBLE_TYPES`). Only the single top-scoring qualifying match is superseded.
- Supersede action ORDER: (1) new note gets `evolved_from_id` + inherited `mention_count + 1`; (2) THEN old note → `archived`. A crash between the two must leave nothing broken.
- Supersede failures are logged and swallowed — they must never break note saving or relationship detection.
- Lifecycle windows: `until_done` resolved **7 days** (by `state_updated_at`); `reminder` type fired **3 days** (by `reminder_fired_at`, state still open/active); `decay` policy **90 days** (by `created_at` AND `last_accessed_at` null-or-older-than-90d). `long_term`/`user_confirmed` NEVER archived by the job. All rules exclude `deleted_at IS NOT NULL`.
- Do NOT touch `backend/ml-service`, `mobile/`, `importanceScoreJob`, or `retentionJob`.
- Baselines: jest 207 tests pass (1 pre-existing suite-level compile failure in `voiceSessionService.test.ts` — out of scope); `npx tsc --noEmit` exactly 5 pre-existing errors (`voiceSessionService.ts`).
- `mention_count` is NOT exposed on `AtomicObjectModel` — inherit it in SQL (subquery), do not add it to the model.

---

### Task 1: `reinforcementService.ts` — pure gate + supersede action + wiring

**Files:**
- Create: `backend/api/src/services/reinforcementService.ts`
- Modify: `backend/api/src/services/objectService.ts:136-145` (the `setImmediate` relationship block)
- Test: `backend/api/src/__tests__/services/reinforcement.test.ts`

**Interfaces:**
- Consumes: `findSimilar(objectId, userId, limit): Promise<SemanticSearchResult[]>` from `./vectorService` (`SemanticSearchResult = { objectId, content, distance, score }`); `AtomicObjectModel.findById` / `findByIds`; `query` from `../db/queries`.
- Produces: `shouldSupersede(candidate: { id: string; objectType: string | null }, match: { id: string; objectType: string | null; state: string; score: number }): boolean` and `applySupersede(objectId: string, userId: string): Promise<void>` (never throws).

- [ ] **Step 1: Write the failing tests**

Create `backend/api/src/__tests__/services/reinforcement.test.ts`:

```ts
import { shouldSupersede, applySupersede, SUPERSEDE_MIN_SCORE } from '../../services/reinforcementService';
import * as vectorService from '../../services/vectorService';
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../services/vectorService');
jest.mock('../../models/AtomicObject');
jest.mock('../../db/queries');
const mockVector = vectorService as jest.Mocked<typeof vectorService>;
const mockModel = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;
const mockQ = queries as jest.Mocked<typeof queries>;

const CAND = { id: 'new-1', objectType: 'task' };
const MATCH = { id: 'old-1', objectType: 'task', state: 'open', score: 0.9 };

describe('shouldSupersede (pure gate)', () => {
  it('passes the happy path', () => {
    expect(shouldSupersede(CAND, MATCH)).toBe(true);
  });
  it('rejects below the score threshold', () => {
    expect(shouldSupersede(CAND, { ...MATCH, score: 0.84 })).toBe(false);
    expect(shouldSupersede(CAND, { ...MATCH, score: SUPERSEDE_MIN_SCORE })).toBe(true); // inclusive
  });
  it('rejects cross-type matches', () => {
    expect(shouldSupersede(CAND, { ...MATCH, objectType: 'journal' })).toBe(false);
  });
  it('rejects non-open/active matches', () => {
    expect(shouldSupersede(CAND, { ...MATCH, state: 'resolved' })).toBe(false);
    expect(shouldSupersede(CAND, { ...MATCH, state: 'archived' })).toBe(false);
    expect(shouldSupersede(CAND, { ...MATCH, state: 'active' })).toBe(true);
  });
  it('rejects self-matches', () => {
    expect(shouldSupersede(CAND, { ...MATCH, id: 'new-1' })).toBe(false);
  });
  it('rejects non-eligible candidate types', () => {
    for (const t of ['journal', 'preference', 'decision', 'idea', 'observation', 'question', 'reference', null]) {
      expect(shouldSupersede({ id: 'new-1', objectType: t }, MATCH)).toBe(false);
    }
    for (const t of ['task', 'reminder', 'commitment', 'concern']) {
      expect(shouldSupersede({ id: 'new-1', objectType: t }, { ...MATCH, objectType: t })).toBe(true);
    }
  });
});

describe('applySupersede', () => {
  const candidateModel = { id: 'new-1', userId: 'u1', objectType: 'task' };
  const matchModel = { id: 'old-1', userId: 'u1', objectType: 'task', state: 'open' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockModel.findById.mockResolvedValue(candidateModel as any);
    mockModel.findByIds.mockResolvedValue([matchModel as any]);
    mockQ.query.mockResolvedValue({ rowCount: 1 } as any);
  });

  it('links the new note FIRST, then archives the old (order matters)', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'old-1', content: '', distance: 0.1, score: 0.9 },
    ]);

    await applySupersede('new-1', 'u1');

    expect(mockQ.query).toHaveBeenCalledTimes(2);
    const [firstSql, firstParams] = mockQ.query.mock.calls[0];
    const [secondSql, secondParams] = mockQ.query.mock.calls[1];
    expect(firstSql).toContain('SET evolved_from_id');
    expect(firstSql).toContain('mention_count');
    expect(firstParams).toEqual(['old-1', 'new-1']);
    expect(secondSql).toContain("SET state = 'archived'");
    expect(secondParams).toEqual(['old-1']);
  });

  it('supersedes only the top-scoring qualifying match', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'best', content: '', distance: 0.05, score: 0.95 },
      { objectId: 'old-1', content: '', distance: 0.1, score: 0.9 },
    ]);
    mockModel.findByIds.mockResolvedValue([
      { id: 'best', userId: 'u1', objectType: 'journal', state: 'open' } as any, // fails gate (type)
      matchModel as any,
    ]);

    await applySupersede('new-1', 'u1');

    const [, firstParams] = mockQ.query.mock.calls[0];
    expect(firstParams).toEqual(['old-1', 'new-1']); // fell through to next-best qualifying
  });

  it('does nothing when no match clears the gate', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'old-1', content: '', distance: 0.3, score: 0.7 },
    ]);
    await applySupersede('new-1', 'u1');
    expect(mockQ.query).not.toHaveBeenCalled();
  });

  it('never throws — vector failure is swallowed with a warn', async () => {
    mockVector.findSimilar.mockRejectedValue(new Error('weaviate down'));
    await expect(applySupersede('new-1', 'u1')).resolves.toBeUndefined();
    expect(mockQ.query).not.toHaveBeenCalled();
  });

  it('skips matches belonging to another user', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'old-1', content: '', distance: 0.1, score: 0.9 },
    ]);
    mockModel.findByIds.mockResolvedValue([{ ...matchModel, userId: 'u2' } as any]);
    await applySupersede('new-1', 'u1');
    expect(mockQ.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tui/offload/backend/api && npx jest reinforcement --verbose 2>&1 | tail -10`
Expected: FAIL — "Cannot find module '../../services/reinforcementService'"

- [ ] **Step 3: Write the service**

Create `backend/api/src/services/reinforcementService.ts`:

```ts
/**
 * Reinforcement via supersede-on-recapture. When a newly captured note is
 * near-identical (>= SUPERSEDE_MIN_SCORE) to an existing open note of the
 * same type, the NEW note becomes the living version — it inherits the old
 * note's mention_count + 1 and links back via evolved_from_id — and the old
 * note is archived. Repeated captures build one strong note with history
 * instead of fragments. Runs post-save (embedding already stored); never
 * throws — a reinforcement failure must not break note saving.
 */
import { findSimilar } from './vectorService';
import { AtomicObjectModel } from '../models/AtomicObject';
import { query } from '../db/queries';

export const SUPERSEDE_MIN_SCORE = 0.85;
const SUPERSEDE_ELIGIBLE_TYPES = new Set(['task', 'reminder', 'commitment', 'concern']);
const CANDIDATE_LIMIT = 5;

export function shouldSupersede(
  candidate: { id: string; objectType: string | null },
  match: { id: string; objectType: string | null; state: string; score: number }
): boolean {
  if (!candidate.objectType || !SUPERSEDE_ELIGIBLE_TYPES.has(candidate.objectType)) return false;
  if (match.score < SUPERSEDE_MIN_SCORE) return false;
  if (match.objectType !== candidate.objectType) return false;
  if (match.state !== 'open' && match.state !== 'active') return false;
  if (match.id === candidate.id) return false;
  return true;
}

export async function applySupersede(objectId: string, userId: string): Promise<void> {
  try {
    const candidate = await AtomicObjectModel.findById(objectId);
    if (!candidate || candidate.userId !== userId) return;
    if (!candidate.objectType || !SUPERSEDE_ELIGIBLE_TYPES.has(candidate.objectType)) return;

    const similar = await findSimilar(objectId, userId, CANDIDATE_LIMIT);
    const aboveThreshold = similar.filter((s) => s.score >= SUPERSEDE_MIN_SCORE);
    if (aboveThreshold.length === 0) return;

    const hydrated = await AtomicObjectModel.findByIds(aboveThreshold.map((s) => s.objectId));
    const byId = new Map(hydrated.map((m) => [m.id, m]));

    // findSimilar returns results ordered by score desc; take the best qualifier.
    for (const s of aboveThreshold) {
      const m = byId.get(s.objectId);
      if (!m || m.userId !== userId) continue;
      if (
        !shouldSupersede(
          { id: candidate.id, objectType: candidate.objectType },
          { id: m.id, objectType: m.objectType, state: m.state, score: s.score }
        )
      ) {
        continue;
      }

      // Order matters: link + inherit on the NEW note first, so a crash here
      // leaves only an un-archived old note (harmless), never a broken chain.
      await query(
        `UPDATE hub.atomic_objects
         SET evolved_from_id = $1,
             mention_count = (SELECT mention_count + 1 FROM hub.atomic_objects WHERE id = $1)
         WHERE id = $2`,
        [m.id, candidate.id]
      );
      await query(
        `UPDATE hub.atomic_objects
         SET state = 'archived', state_updated_at = NOW()
         WHERE id = $1 AND state IN ('open', 'active')`,
        [m.id]
      );
      console.log(
        `[reinforcement] note ${candidate.id} supersedes ${m.id} (score ${s.score.toFixed(2)})`
      );
      return; // one supersede per capture
    }
  } catch (err) {
    console.warn('[reinforcement] supersede pass failed (swallowed):', err);
  }
}
```

- [ ] **Step 4: Wire into the post-save block**

In `backend/api/src/services/objectService.ts`, add the import alongside the `relationshipService` import:

```ts
import { applySupersede } from './reinforcementService';
```

and extend the existing fire-and-forget block (currently `setImmediate(async () => { try { await updateObjectRelationships(...) } catch ... })`) so the supersede pass runs after relationship detection:

```ts
  if (process.env.ENABLE_RELATIONSHIPS !== 'false') {
    setImmediate(async () => {
      try {
        await updateObjectRelationships(atomicObject.id, userId);
      } catch (err) {
        console.warn('[objectService] Relationship detection failed (non-fatal):', err);
      }
      await applySupersede(atomicObject.id, userId); // never throws
    });
  }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest reinforcement --verbose 2>&1 | tail -12 && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 11 tests pass; tsc exactly `5`.

- [ ] **Step 6: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/services/reinforcementService.ts backend/api/src/services/objectService.ts backend/api/src/__tests__/services/reinforcement.test.ts && git commit -m "feat(retention): supersede-on-recapture — evolved_from_id chain + mention inheritance"
```

---

### Task 2: `lifecycleJob.ts` — hourly retention-policy enforcement

**Files:**
- Create: `backend/api/src/jobs/lifecycleJob.ts`
- Modify: `backend/api/src/index.ts` (register after `startTimeReminderJob()`)
- Test: `backend/api/src/__tests__/jobs/lifecycleJob.test.ts`

**Interfaces:**
- Consumes: `query` from `../db/queries` (pg `QueryResult` with `rowCount`).
- Produces: `runLifecycleSweep(): Promise<{ resolvedArchived: number; firedArchived: number; decayedArchived: number }>` (exported for tests) and `startLifecycleJob(): void`.

- [ ] **Step 1: Write the failing tests**

Create `backend/api/src/__tests__/jobs/lifecycleJob.test.ts`:

```ts
import { runLifecycleSweep } from '../../jobs/lifecycleJob';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

describe('runLifecycleSweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQ.query.mockResolvedValue({ rowCount: 2 } as any);
  });

  it('runs exactly three archive rules and reports counts', async () => {
    const result = await runLifecycleSweep();
    expect(mockQ.query).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ resolvedArchived: 2, firedArchived: 2, decayedArchived: 2 });
  });

  it('rule 1: archives resolved until_done items after 7 days', async () => {
    await runLifecycleSweep();
    const sql = mockQ.query.mock.calls[0][0] as string;
    expect(sql).toContain("SET state = 'archived'");
    expect(sql).toContain("retention_policy = 'until_done'");
    expect(sql).toContain("state = 'resolved'");
    expect(sql).toContain("state_updated_at < NOW() - INTERVAL '7 days'");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('rule 2: archives fired reminders after 3 days', async () => {
    await runLifecycleSweep();
    const sql = mockQ.query.mock.calls[1][0] as string;
    expect(sql).toContain("object_type = 'reminder'");
    expect(sql).toContain('reminder_fired_at IS NOT NULL');
    expect(sql).toContain("reminder_fired_at < NOW() - INTERVAL '3 days'");
    expect(sql).toContain("state IN ('open', 'active')");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('rule 3: archives untouched decay notes after 90 days', async () => {
    await runLifecycleSweep();
    const sql = mockQ.query.mock.calls[2][0] as string;
    expect(sql).toContain("retention_policy = 'decay'");
    expect(sql).toContain("created_at < NOW() - INTERVAL '90 days'");
    expect(sql).toContain("last_accessed_at IS NULL OR last_accessed_at < NOW() - INTERVAL '90 days'");
    expect(sql).toContain("state IN ('open', 'active')");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('never touches long_term or user_confirmed policies', async () => {
    await runLifecycleSweep();
    for (const call of mockQ.query.mock.calls) {
      const sql = call[0] as string;
      expect(sql).not.toContain('long_term');
      expect(sql).not.toContain('user_confirmed');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tui/offload/backend/api && npx jest lifecycleJob --verbose 2>&1 | tail -10`
Expected: FAIL — "Cannot find module '../../jobs/lifecycleJob'"

- [ ] **Step 3: Write the job**

Create `backend/api/src/jobs/lifecycleJob.ts`:

```ts
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
       AND retention_policy NOT IN ('long_term', 'user_confirmed')
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
```

In `backend/api/src/index.ts`, add the import next to the other job imports and register after `startTimeReminderJob()`:

```ts
import { startLifecycleJob } from './jobs/lifecycleJob';
```
```ts
  startTimeReminderJob();
  startLifecycleJob();
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest lifecycleJob --verbose 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 5 tests pass; tsc exactly `5`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/jobs/lifecycleJob.ts backend/api/src/__tests__/jobs/lifecycleJob.test.ts backend/api/src/index.ts && git commit -m "feat(retention): hourly lifecycle job enforcing retention-policy windows"
```

---

### Task 3: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Full suite + typecheck + scope**

Run: `cd /Users/tui/offload/backend/api && npx tsc --noEmit 2>&1 | grep -c "error TS" && npm test 2>&1 | tail -4`
Expected: tsc exactly `5`; all tests pass (207 baseline + 16 new = 223; the 1 pre-existing suite-level failure unchanged).

Run: `cd /Users/tui/offload && git diff main --stat -- backend/ml-service mobile`
Expected: empty (backend/api only).

- [ ] **Step 2: Report**

Summarize test counts and any deviations. Do NOT merge/deploy — handled by finishing-a-development-branch, then: backend deploy poll, no OTA needed, and DB verification: record "need to send Justin the quote" twice reworded → old note archived with `evolved_from_id` chain and bumped `mention_count` on the new one; confirm `[lifecycleJob] Starting` in prod logs; and spot-check that AI search still surfaces an archived note (the spec expects archived content to remain searchable).
