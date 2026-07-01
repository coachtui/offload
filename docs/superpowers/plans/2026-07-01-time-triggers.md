# Phase 8.2 Time Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spoken dates ("call the dentist Friday") become real reminders: parse `temporal_date_text` → `remind_at` at ingest, and a 5-minute job pushes a notification deep-linking to the note when the time arrives.

**Architecture:** A pure `temporalTrigger.ts` service (chrono-node, deterministic, mirroring `memoryIntent.ts`) derives `remind_at` inside `AtomicObjectModel.create`. A new `timeReminderJob` polls unfired due reminders (partial-indexed) and reuses Phase 7 `pushService`. Per-row `reminder_fired_at` gives idempotency; no `job_state` needed. The ml-service is NOT touched.

**Tech Stack:** Node/TypeScript (backend/api), chrono-node, PostgreSQL (raw SQL migration 016), jest, Expo push (existing `pushService`), React Native (one App.tsx branch, OTA-able).

**Spec:** `docs/superpowers/specs/2026-07-01-time-triggers-design.md`

## Global Constraints

- Work on branch `feature/time-triggers` off `main`.
- **Do NOT touch `backend/ml-service`** — `remind_at` is code-derived; the parser contract is unchanged (avoids the Phase 8.1 four-layer drift trap).
- Timezone is **fixed HST = UTC-10, no DST** (`timezone: -600` minutes) — same convention as `weeklySynthesisJob.ts`.
- Date-only mentions fire at **09:00 HST (= 19:00 UTC)**.
- Only object types `task`, `reminder`, `commitment` get reminders.
- Migration is raw SQL, idempotent (`IF NOT EXISTS`), applied manually to prod (established workflow; public DB URL in `plans/handoff.md`).
- Baselines before claiming success: `cd backend/api && npx tsc --noEmit` (currently clean) and `npm test` (currently 180 tests pass; 1 suite has a known pre-existing failure-at-suite-level — compare against baseline, don't chase it).
- Column for lifecycle is **`state`** (`open/active/resolved/archived`), not `status`.

---

### Task 1: `temporalTrigger.ts` — pure date-derivation service

**Files:**
- Modify: `backend/api/package.json` (add `chrono-node` dependency)
- Create: `backend/api/src/services/temporalTrigger.ts`
- Test: `backend/api/src/__tests__/services/temporalTrigger.test.ts`

**Interfaces:**
- Consumes: nothing project-internal (chrono-node only).
- Produces: `deriveRemindAt(input: { dateText: string | null | undefined; objectType: string | null | undefined; createdAt: Date }): Date | null` — Task 3 calls this from `AtomicObjectModel.create`.

- [ ] **Step 1: Install chrono-node**

```bash
cd /Users/tui/offload/backend/api && npm install chrono-node
```

Expected: `chrono-node` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `backend/api/src/__tests__/services/temporalTrigger.test.ts`:

```ts
import { deriveRemindAt } from '../../services/temporalTrigger';

// Reference instant: Tuesday 2026-06-30 10:00 HST == 2026-06-30T20:00:00Z
// (2026-06-29 is a Monday — same anchor the weeklySynthesisTiming test uses.)
const TUE_10AM_HST = new Date('2026-06-30T20:00:00Z');

describe('deriveRemindAt', () => {
  it('resolves a bare weekday to the COMING one at 09:00 HST', () => {
    const d = deriveRemindAt({ dateText: 'Friday', objectType: 'reminder', createdAt: TUE_10AM_HST });
    // Coming Friday = 2026-07-03; 09:00 HST = 19:00 UTC
    expect(d?.toISOString()).toBe('2026-07-03T19:00:00.000Z');
  });

  it('keeps an explicit time', () => {
    const d = deriveRemindAt({ dateText: 'tomorrow at 2pm', objectType: 'task', createdAt: TUE_10AM_HST });
    // Wed 2026-07-01 14:00 HST = 2026-07-02T00:00:00Z
    expect(d?.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });

  it('defaults a date-only mention to 09:00 HST', () => {
    const d = deriveRemindAt({ dateText: 'July 15th', objectType: 'commitment', createdAt: TUE_10AM_HST });
    expect(d?.toISOString()).toBe('2026-07-15T19:00:00.000Z');
  });

  it('returns null for past-resolving text', () => {
    expect(deriveRemindAt({ dateText: 'yesterday', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(deriveRemindAt({ dateText: 'soon', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
    expect(deriveRemindAt({ dateText: 'eventually', objectType: 'reminder', createdAt: TUE_10AM_HST })).toBeNull();
  });

  it('returns null for non-actionable object types even with a parseable date', () => {
    for (const t of ['journal', 'idea', 'preference', 'concern', 'observation', 'reference', 'question', 'decision', null, undefined]) {
      expect(deriveRemindAt({ dateText: 'Friday', objectType: t as any, createdAt: TUE_10AM_HST })).toBeNull();
    }
  });

  it('returns null for missing dateText', () => {
    expect(deriveRemindAt({ dateText: null, objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
    expect(deriveRemindAt({ dateText: '', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest temporalTrigger -v 2>&1 | tail -20`
Expected: FAIL — "Cannot find module '../../services/temporalTrigger'"

- [ ] **Step 4: Write the implementation**

Create `backend/api/src/services/temporalTrigger.ts`:

```ts
/**
 * Derived time trigger. Single source of truth for remind_at — deterministic
 * chrono-node parse of the LLM-captured temporal_date_text, relative to note
 * creation time in HST (fixed UTC-10, no DST). Only actionable types remind.
 * Unparseable / past-resolving text → null (the note still saves normally).
 */
import * as chrono from 'chrono-node';

const HST_OFFSET_MINUTES = -600; // HST is fixed UTC-10, no DST
const DEFAULT_HOUR_HST = 9;      // date-only mentions fire at 9am HST
const ACTIONABLE_TYPES = new Set(['task', 'reminder', 'commitment']);

export function deriveRemindAt(input: {
  dateText: string | null | undefined;
  objectType: string | null | undefined;
  createdAt: Date;
}): Date | null {
  if (!input.objectType || !ACTIONABLE_TYPES.has(input.objectType)) return null;
  if (!input.dateText) return null;

  const results = chrono.parse(
    input.dateText,
    { instant: input.createdAt, timezone: HST_OFFSET_MINUTES },
    { forwardDate: true } // "Friday" = the coming Friday, never last week's
  );
  if (results.length === 0) return null;

  const start = results[0].start;
  let remindAt: Date;
  if (start.isCertain('hour')) {
    remindAt = start.date();
  } else {
    // Date-only: build 09:00 HST as a UTC instant (9 + 10 = 19:00 UTC).
    remindAt = new Date(Date.UTC(
      start.get('year')!,
      start.get('month')! - 1,
      start.get('day')!,
      DEFAULT_HOUR_HST - HST_OFFSET_MINUTES / 60,
      0, 0
    ));
  }

  return remindAt.getTime() > input.createdAt.getTime() ? remindAt : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/tui/offload/backend/api && npx jest temporalTrigger -v 2>&1 | tail -20`
Expected: PASS, 7 tests. If the "tomorrow at 2pm" or weekday expectations are off by chrono's actual behavior, debug with a scratch `node -e` invocation before touching the expected values — the HST math above is correct; suspect the parse options first.

- [ ] **Step 6: Commit**

```bash
cd /Users/tui/offload && git add backend/api/package.json backend/api/package-lock.json backend/api/src/services/temporalTrigger.ts backend/api/src/__tests__/services/temporalTrigger.test.ts && git commit -m "feat(time-triggers): deriveRemindAt — chrono-node parse of temporal_date_text"
```

---

### Task 2: Migration 016 — remind_at columns + partial index

**Files:**
- Create: `backend/api/src/db/migrations/016_time_triggers.sql`

**Interfaces:**
- Produces: columns `hub.atomic_objects.remind_at timestamptz NULL`, `hub.atomic_objects.reminder_fired_at timestamptz NULL`; partial index `idx_atomic_objects_pending_reminders`. Tasks 3 and 5 rely on these exact names.

- [ ] **Step 1: Write the migration**

Create `backend/api/src/db/migrations/016_time_triggers.sql`:

```sql
-- 016_time_triggers.sql — Phase 8.2 time triggers (additive, idempotent)
-- remind_at: resolved fire time (derived by temporalTrigger.ts at ingest)
-- reminder_fired_at: set when the push succeeds; per-row idempotency

ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS remind_at timestamptz;
ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS reminder_fired_at timestamptz;

-- Keeps the 5-minute poll cheap regardless of table growth.
CREATE INDEX IF NOT EXISTS idx_atomic_objects_pending_reminders
  ON hub.atomic_objects (remind_at)
  WHERE remind_at IS NOT NULL AND reminder_fired_at IS NULL;
```

- [ ] **Step 2: Apply to production and verify**

The DB public URL is in `plans/handoff.md` (§Database Connection).

```bash
psql "postgresql://postgres:NXUQcCsnJqrLfsCxzGSbdnVfRuluXLCu@metro.proxy.rlwy.net:57046/railway" \
  -f /Users/tui/offload/backend/api/src/db/migrations/016_time_triggers.sql
psql "postgresql://postgres:NXUQcCsnJqrLfsCxzGSbdnVfRuluXLCu@metro.proxy.rlwy.net:57046/railway" \
  -c "SELECT column_name FROM information_schema.columns WHERE table_schema='hub' AND table_name='atomic_objects' AND column_name IN ('remind_at','reminder_fired_at');"
```

Expected: two `ALTER TABLE` + one `CREATE INDEX` acks, then both column names returned.

- [ ] **Step 3: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/db/migrations/016_time_triggers.sql && git commit -m "feat(time-triggers): migration 016 — remind_at + reminder_fired_at + partial index"
```

---

### Task 3: Persist remind_at in `AtomicObjectModel.create`

**Files:**
- Modify: `backend/api/src/models/AtomicObject.ts` (row interface ~line 45–70; class fields ~line 95–115; constructor ~line 175–185; `create()` INSERT ~line 305–365; `toJSON()`/`toAtomicObject` output ~line 634–655)
- Modify: `backend/api/src/shared-types/index.ts` (the `AtomicObject` interface — near `temporalHints` at line ~109)
- Test: `backend/api/src/__tests__/models/atomicObjectRemindAt.test.ts`

**Interfaces:**
- Consumes: `deriveRemindAt` from Task 1 (`import { deriveRemindAt } from '../services/temporalTrigger';`).
- Produces: `AtomicObjectRow.remind_at: Date | null`, `AtomicObjectRow.reminder_fired_at: Date | null`; model properties `remindAt`/`reminderFiredAt`; INSERT places `remind_at` as **$37** (0-indexed params[36] in tests). Task 5's poll reads the DB columns directly.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/models/atomicObjectRemindAt.test.ts` (mirrors the existing `atomicObjectMemoryIntent.test.ts` mocking pattern):

```ts
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

function rowFrom(params: any[]) {
  return {
    id: 'o1', user_id: 'u1', content: params[1], category: [],
    confidence: 0.5,
    source_type: 'voice' as const,
    source_timestamp: new Date(),
    created_at: new Date(), updated_at: new Date(),
    object_type: params[21],
    remind_at: params[36] ?? null,
  };
}

describe('AtomicObjectModel.create — remind_at derivation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists a derived remind_at for an actionable note with a date ($37)', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    const obj = await AtomicObjectModel.create('u1', {
      content: 'call the dentist tomorrow at 2pm',
      source: { type: 'voice' },
      objectType: 'reminder',
      temporalHints: { hasDate: true, dateText: 'tomorrow at 2pm', urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[36]).toBeInstanceOf(Date);           // $37 remind_at
    expect((params[36] as Date).getTime()).toBeGreaterThan(Date.now());
    expect(obj.remindAt).toBeInstanceOf(Date);
  });

  it('persists null remind_at for a journal note with a date', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    await AtomicObjectModel.create('u1', {
      content: 'nice dinner last Friday',
      source: { type: 'voice' },
      objectType: 'journal',
      temporalHints: { hasDate: true, dateText: 'Friday', urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[36]).toBeNull();
  });

  it('persists null remind_at when there is no dateText', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    await AtomicObjectModel.create('u1', {
      content: 'buy milk',
      source: { type: 'voice' },
      objectType: 'task',
      temporalHints: { hasDate: false, dateText: null, urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[36]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest atomicObjectRemindAt -v 2>&1 | tail -15`
Expected: FAIL — `params[36]` is `undefined` (INSERT currently ends at $36) and `obj.remindAt` doesn't exist.

- [ ] **Step 3: Wire the model**

In `backend/api/src/models/AtomicObject.ts`, five edits:

1. Import (top of file, alongside the `memoryIntent` import):
```ts
import { deriveRemindAt } from '../services/temporalTrigger';
```

2. `AtomicObjectRow` interface — after `trigger_context: string | null;`:
```ts
  remind_at: Date | null;
  reminder_fired_at: Date | null;
```

3. Class fields — after `triggerContext: string | null;`:
```ts
  remindAt: Date | null;
  reminderFiredAt: Date | null;
```

4. Constructor — after `this.triggerContext = row.trigger_context ?? null;`:
```ts
    this.remindAt = row.remind_at ?? null;
    this.reminderFiredAt = row.reminder_fired_at ?? null;
```

5. `create()` — after the `triggerContext` derivation block:
```ts
    const remindAt = deriveRemindAt({
      dateText: input.temporalHints?.dateText,
      objectType: input.objectType,
      createdAt: new Date(),
    });
```
   Then extend the INSERT: column list gains `remind_at` after `trigger_context`, the VALUES list gains `$37` after `$36`, and the params array gains:
```ts
        remindAt,                                                         // $37 remind_at
```

6. `toJSON()`/`toAtomicObject()` output — after `triggerContext: this.triggerContext,`:
```ts
      remindAt: this.remindAt,
      reminderFiredAt: this.reminderFiredAt,
```

In `backend/api/src/shared-types/index.ts`, add to the `AtomicObject` interface next to `triggerContext`/`temporalHints` (optional, so mobile is unaffected):
```ts
  remindAt?: Date | string | null;
  reminderFiredAt?: Date | string | null;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest atomicObjectRemindAt atomicObjectMemoryIntent -v 2>&1 | tail -15 && npx tsc --noEmit`
Expected: both suites PASS (memory-intent suite proves $34–$36 didn't shift), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/models/AtomicObject.ts backend/api/src/shared-types/index.ts backend/api/src/__tests__/models/atomicObjectRemindAt.test.ts && git commit -m "feat(time-triggers): derive + persist remind_at at ingest"
```

---

### Task 4: `pushService.sendToUser` signals success/failure

**Files:**
- Modify: `backend/api/src/services/pushService.ts`
- Test: `backend/api/src/__tests__/services/pushService.test.ts` (create; if a pushService test already exists, extend it instead)

**Interfaces:**
- Consumes: existing `PushTokenModel.findTokensByUser` / `deleteToken`.
- Produces: `sendToUser(userId: string, msg: PushMessage): Promise<boolean>` — still **never throws**. Returns `true` when delivery was handed to Expo OK **or the user has no tokens** (nothing to deliver — callers should not retry forever); `false` on HTTP non-OK or thrown error. The existing digest-job call site ignores the return value — no change there.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/pushService.test.ts`:

```ts
import { sendToUser } from '../../services/pushService';
import { PushTokenModel } from '../../models/PushToken';

jest.mock('../../models/PushToken', () => ({
  PushTokenModel: { findTokensByUser: jest.fn(), deleteToken: jest.fn() },
  JobStateModel: { getLastRun: jest.fn(), setLastRun: jest.fn() },
}));
const mockTokens = PushTokenModel as jest.Mocked<typeof PushTokenModel>;

const MSG = { title: 't', body: 'b', data: { screen: 'Objects' } };

describe('pushService.sendToUser return value', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { (global.fetch as any) = undefined; });

  it('returns true when Expo accepts the push', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['ExponentPushToken[x]']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
    }) as any;
    await expect(sendToUser('u1', MSG)).resolves.toBe(true);
  });

  it('returns true when the user has no tokens (nothing to deliver)', async () => {
    mockTokens.findTokensByUser.mockResolvedValue([]);
    await expect(sendToUser('u1', MSG)).resolves.toBe(true);
  });

  it('returns false on HTTP non-OK', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['ExponentPushToken[x]']);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as any;
    await expect(sendToUser('u1', MSG)).resolves.toBe(false);
  });

  it('returns false (not a throw) when fetch rejects', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['ExponentPushToken[x]']);
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    await expect(sendToUser('u1', MSG)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest __tests__/services/pushService -v 2>&1 | tail -15`
Expected: FAIL — current `sendToUser` returns `undefined` (`Promise<void>`).

- [ ] **Step 3: Change the return type**

In `backend/api/src/services/pushService.ts`, change the signature and the four exit paths (behavior otherwise identical — still never throws):

```ts
export async function sendToUser(userId: string, msg: PushMessage): Promise<boolean> {
  try {
    const tokens = await PushTokenModel.findTokensByUser(userId);
    if (tokens.length === 0) {
      console.log(`[pushService] No push tokens for user ${userId} — nothing to send`);
      return true; // nothing to deliver; callers must not retry forever
    }

    const messages = tokens.map((to) => ({
      to,
      title: msg.title,
      body: msg.body,
      data: msg.data ?? {},
      sound: 'default',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.warn(`[pushService] Expo push responded ${response.status}`);
      return false;
    }

    const json = (await response.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          console.log(`[pushService] Pruning unregistered token ${tokens[i]}`);
          await PushTokenModel.deleteToken(tokens[i]);
        }
      })
    );
    return true;
  } catch (err) {
    console.warn('[pushService] sendToUser failed (swallowed):', err);
    return false;
  }
}
```

Also update the doc comment's first line to: `Reusable server→device push via the Expo Push API. Never throws; returns whether delivery was handed off (false → caller may retry). Consumers: weekly digest, time reminders.`

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest __tests__/services/pushService -v 2>&1 | tail -10 && npx tsc --noEmit`
Expected: PASS (4 tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/services/pushService.ts backend/api/src/__tests__/services/pushService.test.ts && git commit -m "feat(time-triggers): pushService.sendToUser returns delivery success"
```

---

### Task 5: `timeReminderJob` — 5-minute poll + fire

**Files:**
- Create: `backend/api/src/jobs/timeReminderJob.ts`
- Modify: `backend/api/src/index.ts:203` (register after `startWeeklySynthesisJob()`)
- Test: `backend/api/src/__tests__/jobs/timeReminderJob.test.ts`

**Interfaces:**
- Consumes: `queryMany`/`query` from `../db/queries`; `sendToUser(userId, msg): Promise<boolean>` from Task 4; columns from Task 2.
- Produces: `processDueReminders(now: Date): Promise<void>` (exported for tests) and `startTimeReminderJob(): void`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/jobs/timeReminderJob.test.ts`:

```ts
import { processDueReminders } from '../../jobs/timeReminderJob';
import * as queries from '../../db/queries';
import * as pushService from '../../services/pushService';

jest.mock('../../db/queries');
jest.mock('../../services/pushService');
const mockQ = queries as jest.Mocked<typeof queries>;
const mockPush = pushService as jest.Mocked<typeof pushService>;

const NOW = new Date('2026-07-03T19:02:00Z');
const dueRow = { id: 'obj-1', user_id: 'u1', content: 'call the dentist Friday\nmore detail', title: null };

describe('processDueReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pushes each due reminder and marks it fired on success', async () => {
    mockQ.queryMany.mockResolvedValue([dueRow] as any);
    mockPush.sendToUser.mockResolvedValue(true);
    mockQ.query.mockResolvedValue({} as any);

    await processDueReminders(NOW);

    expect(mockPush.sendToUser).toHaveBeenCalledWith('u1', {
      title: '⏰ Reminder',
      body: 'call the dentist Friday',
      data: { screen: 'Objects', objectId: 'obj-1' },
    });
    const [updateSql, updateParams] = mockQ.query.mock.calls[0];
    expect(updateSql).toContain('SET reminder_fired_at');
    expect(updateParams).toEqual([NOW, 'obj-1']);
  });

  it('does NOT mark fired when the push fails (retries next tick)', async () => {
    mockQ.queryMany.mockResolvedValue([dueRow] as any);
    mockPush.sendToUser.mockResolvedValue(false);

    await processDueReminders(NOW);

    expect(mockQ.query).not.toHaveBeenCalled();
  });

  it('prefers the title as the notification body when present', async () => {
    mockQ.queryMany.mockResolvedValue([{ ...dueRow, title: 'Call the dentist' }] as any);
    mockPush.sendToUser.mockResolvedValue(true);
    mockQ.query.mockResolvedValue({} as any);

    await processDueReminders(NOW);

    expect(mockPush.sendToUser.mock.calls[0][1].body).toBe('Call the dentist');
  });

  it('poll query filters to unfired, due, open/active, actionable, undeleted', async () => {
    mockQ.queryMany.mockResolvedValue([]);
    await processDueReminders(NOW);
    const [sql, params] = mockQ.queryMany.mock.calls[0];
    expect(sql).toContain('remind_at <= $1');
    expect(sql).toContain('reminder_fired_at IS NULL');
    expect(sql).toContain("IN ('open', 'active')");
    expect(sql).toContain("object_type IN ('task', 'reminder', 'commitment')");
    expect(sql).toContain('deleted_at IS NULL');
    expect(params).toEqual([NOW]);
    expect(mockPush.sendToUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest timeReminderJob -v 2>&1 | tail -15`
Expected: FAIL — "Cannot find module '../../jobs/timeReminderJob'"

- [ ] **Step 3: Write the job**

Create `backend/api/src/jobs/timeReminderJob.ts`:

```ts
/**
 * Time-based reminder push. Every 5 minutes, fires a push for each atomic
 * object whose remind_at has arrived and hasn't fired yet. Per-row
 * reminder_fired_at gives idempotency (set only on push success, so a failed
 * push retries next tick). Resolving/archiving a note before its time
 * silently cancels the reminder via the state filter. Naturally multi-user:
 * user_id rides along on each row.
 */
import { queryMany, query } from '../db/queries';
import { sendToUser } from '../services/pushService';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_LIMIT = 50; // safety valve; a tick never sends more than this

interface DueReminderRow {
  id: string;
  user_id: string;
  content: string;
  title: string | null;
}

export async function processDueReminders(now: Date): Promise<void> {
  const rows = await queryMany<DueReminderRow>(
    `SELECT id, user_id, content, title
     FROM hub.atomic_objects
     WHERE remind_at <= $1
       AND reminder_fired_at IS NULL
       AND COALESCE(state, 'open') IN ('open', 'active')
       AND object_type IN ('task', 'reminder', 'commitment')
       AND deleted_at IS NULL
     ORDER BY remind_at ASC
     LIMIT ${BATCH_LIMIT}`,
    [now]
  );

  for (const row of rows) {
    const body = (row.title || row.content).split('\n')[0].slice(0, 178);
    const delivered = await sendToUser(row.user_id, {
      title: '⏰ Reminder',
      body,
      data: { screen: 'Objects', objectId: row.id },
    });
    if (delivered) {
      await query('UPDATE hub.atomic_objects SET reminder_fired_at = $1 WHERE id = $2', [now, row.id]);
    }
  }
}

export function startTimeReminderJob(): void {
  console.log('[timeReminderJob] Starting — 5-min tick for due time reminders');
  setInterval(() => {
    processDueReminders(new Date()).catch((err) =>
      console.error('[timeReminderJob] tick error:', err)
    );
  }, CHECK_INTERVAL_MS);
}
```

Note: verify `queryMany<T>(sql, params)` returns `Promise<T[]>` by checking `backend/api/src/db/queries.ts` — if the helper has a different shape, adapt the call, not the query.

In `backend/api/src/index.ts`, add the import next to the other job imports and register after line 203:

```ts
import { startTimeReminderJob } from './jobs/timeReminderJob';
```
```ts
  startWeeklySynthesisJob();
  startTimeReminderJob();
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest timeReminderJob -v 2>&1 | tail -15 && npx tsc --noEmit`
Expected: PASS (4 tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/jobs/timeReminderJob.ts backend/api/src/__tests__/jobs/timeReminderJob.test.ts backend/api/src/index.ts && git commit -m "feat(time-triggers): timeReminderJob — 5-min poll, push, per-row fired flag"
```

---

### Task 6: Mobile deep-link — reminder push opens the note

**Files:**
- Modify: `mobile/App.tsx:47-52` (the `handleNotificationData` else-if chain)

**Interfaces:**
- Consumes: push `data: { screen: 'Objects', objectId }` from Task 5. `ObjectsScreen` already reads `route.params?.objectId` as `initialObjectId` (`mobile/src/screens/ObjectsScreen.tsx:199`) and opens the detail view — no screen changes.

- [ ] **Step 1: Capture the mobile typecheck baseline**

Run: `cd /Users/tui/offload/mobile && npx tsc --noEmit 2>&1 | tail -3`
Note the error count (there is a known non-zero baseline; do not try to fix unrelated errors).

- [ ] **Step 2: Add the deep-link branch**

In `mobile/App.tsx`, the chain currently ends:

```ts
  } else if (data?.screen === 'Objects' && data?.geofenceId) {
    console.log('[App] Navigating to Objects with geofenceId:', data.geofenceId);
    navigationRef.navigate('Objects', { geofenceId: data.geofenceId });
  } else if (data?.screen === 'Insights') {
    navigationRef.navigate('Insights');
  }
```

Insert a branch between them (reminder pushes carry `objectId`, geofence pushes carry `geofenceId` — no collision):

```ts
  } else if (data?.screen === 'Objects' && data?.geofenceId) {
    console.log('[App] Navigating to Objects with geofenceId:', data.geofenceId);
    navigationRef.navigate('Objects', { geofenceId: data.geofenceId });
  } else if (data?.screen === 'Objects' && data?.objectId) {
    console.log('[App] Navigating to Objects with objectId:', data.objectId);
    navigationRef.navigate('Objects', { objectId: data.objectId });
  } else if (data?.screen === 'Insights') {
    navigationRef.navigate('Insights');
  }
```

- [ ] **Step 3: Verify typecheck unchanged**

Run: `cd /Users/tui/offload/mobile && npx tsc --noEmit 2>&1 | tail -3`
Expected: same error count as the Step 1 baseline.

- [ ] **Step 4: Commit**

```bash
cd /Users/tui/offload && git add mobile/App.tsx && git commit -m "feat(time-triggers): deep-link reminder push to note detail"
```

---

### Task 7: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Full backend suite + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx tsc --noEmit && npm test 2>&1 | tail -10`
Expected: tsc clean; every test passes (baseline 180 tests + the ~18 new ones from Tasks 1/3/4/5; the one pre-existing suite-level failure noted in Global Constraints is acceptable if unchanged).

- [ ] **Step 2: Confirm no ml-service drift**

Run: `cd /Users/tui/offload && git diff main --stat -- backend/ml-service`
Expected: empty output (this slice must not touch the parser contract).

- [ ] **Step 3: Report**

Summarize test counts and any deviations. Do NOT merge/deploy in this task — merging, Railway deploy, and the mobile OTA (`eas update` with `.env` + `--clear-cache`) are handled by the finishing-a-development-branch flow, followed by on-device verification: record "remind me to call the dentist tomorrow at 2pm", check `remind_at` in prod DB, and confirm the push arrives and opens the note.
