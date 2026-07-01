# Weekly Digest Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the already-built weekly synthesis proactively via a scheduled push notification, and stand up reusable server→device push infrastructure.

**Architecture:** New `hub.push_tokens` + `hub.job_state` tables; a `PushToken` model; a reusable `pushService.sendToUser` that calls the Expo Push API and prunes dead tokens; an hourly `weeklySynthesisJob` that fires Sunday 18:00 HST (ISO-week deduped) by generating the synthesis then pushing; a `/api/v1/push` route for token registration + a dev test-send; and mobile registration of the Expo push token on auth plus an `Insights` deep-link.

**Tech Stack:** Node/Express + Postgres (`pg` via `src/db/queries`), Jest; React Native / Expo (`expo-notifications`, `expo-constants`, `expo-secure-store`), Expo Push API.

## Global Constraints

- Single user; default-on; **no** settings toggle in v1.
- Delivery: **Sunday ~18:00 HST** (HST = UTC−10, no DST).
- Push transport: **Expo Push API** `https://exp.host/--/api/v2/push/send`.
- Expo project id: `6444b92a-4608-4106-8a94-5764a457cb72` (owner `talailima`).
- Raw-SQL migrations live in `backend/api/src/db/migrations/` (NOT node-pg-migrate); next number is `013`. Apply to prod via `PGSSLMODE=require psql "$DATABASE_PUBLIC_URL" -f <file>` (see infra_reference memory). Files must be idempotent (`IF NOT EXISTS`).
- Backend deploys by pushing to `main` (Railway auto-deploy). Mobile ships via `eas update --branch preview --clear-cache`.
- Existing helpers to reuse: `query/queryOne/queryMany` from `src/db/queries`; `authenticate` from `src/auth/middleware` (`req.user.id`); `generateWeeklySynthesis(userId, days=7, force=false)` returning `{ accomplishedCount: number, openThreads: string[], ... }`.

---

### Task 1: Migration — `push_tokens` + `job_state` tables

**Files:**
- Create: `backend/api/src/db/migrations/013_push_tokens.sql`

**Interfaces:**
- Produces: tables `hub.push_tokens (id, user_id, token UNIQUE, platform, created_at, updated_at)` and `hub.job_state (job_name PK, last_run_at)`.

- [ ] **Step 1: Write the migration**

Create `backend/api/src/db/migrations/013_push_tokens.sql`:

```sql
-- 013_push_tokens.sql — server→device push tokens + generic scheduled-job dedup state
CREATE TABLE IF NOT EXISTS hub.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text CHECK (platform IN ('ios','android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON hub.push_tokens(user_id);

CREATE TABLE IF NOT EXISTS hub.job_state (
  job_name    text PRIMARY KEY,
  last_run_at timestamptz
);
```

- [ ] **Step 2: Apply to the database and verify**

Run (from `backend/api`, Railway-linked):
```bash
PGURL=$(railway variables --json | jq -r '.DATABASE_PUBLIC_URL')
PGSSLMODE=require psql "$PGURL" -v ON_ERROR_STOP=1 -f src/db/migrations/013_push_tokens.sql
PGSSLMODE=require psql "$PGURL" -tAc "select to_regclass('hub.push_tokens'), to_regclass('hub.job_state');"
```
Expected: `hub.push_tokens|hub.job_state` (both non-null).

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/db/migrations/013_push_tokens.sql
git commit -m "feat(db): push_tokens + job_state tables (migration 013)"
```

---

### Task 2: `PushToken` model (tokens + job_state helpers)

**Files:**
- Create: `backend/api/src/models/PushToken.ts`
- Test: `backend/api/src/__tests__/models/pushToken.test.ts`

**Interfaces:**
- Consumes: `query`, `queryOne`, `queryMany` from `../db/queries`.
- Produces:
  - `PushTokenModel.upsert(userId: string, token: string, platform: 'ios'|'android'): Promise<void>`
  - `PushTokenModel.findTokensByUser(userId: string): Promise<string[]>`
  - `PushTokenModel.deleteToken(token: string): Promise<void>`
  - `JobStateModel.getLastRun(jobName: string): Promise<Date | null>`
  - `JobStateModel.setLastRun(jobName: string, when: Date): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/models/pushToken.test.ts`:

```typescript
import { PushTokenModel, JobStateModel } from '../../models/PushToken';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

describe('PushTokenModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upsert inserts on conflict(token) updating user/platform/updated_at', async () => {
    mockQ.query.mockResolvedValue({} as any);
    await PushTokenModel.upsert('u1', 'ExpoTok', 'ios');
    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toMatch(/insert into hub\.push_tokens/i);
    expect(sql).toMatch(/on conflict \(token\) do update/i);
    expect(params).toEqual(['u1', 'ExpoTok', 'ios']);
  });

  it('findTokensByUser returns the token strings', async () => {
    mockQ.queryMany.mockResolvedValue([{ token: 'a' }, { token: 'b' }] as any);
    const tokens = await PushTokenModel.findTokensByUser('u1');
    expect(tokens).toEqual(['a', 'b']);
    expect(mockQ.queryMany.mock.calls[0][1]).toEqual(['u1']);
  });

  it('deleteToken deletes by token', async () => {
    mockQ.query.mockResolvedValue({} as any);
    await PushTokenModel.deleteToken('bad');
    expect(mockQ.query.mock.calls[0][0]).toMatch(/delete from hub\.push_tokens/i);
    expect(mockQ.query.mock.calls[0][1]).toEqual(['bad']);
  });
});

describe('JobStateModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getLastRun returns the timestamp or null', async () => {
    mockQ.queryOne.mockResolvedValue({ last_run_at: new Date('2026-06-21T00:00:00Z') } as any);
    const d = await JobStateModel.getLastRun('weekly_digest_push');
    expect(d?.toISOString()).toBe('2026-06-21T00:00:00.000Z');

    mockQ.queryOne.mockResolvedValue(null as any);
    expect(await JobStateModel.getLastRun('nope')).toBeNull();
  });

  it('setLastRun upserts job_state by job_name', async () => {
    mockQ.query.mockResolvedValue({} as any);
    const when = new Date('2026-06-28T04:00:00Z');
    await JobStateModel.setLastRun('weekly_digest_push', when);
    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toMatch(/insert into hub\.job_state/i);
    expect(sql).toMatch(/on conflict \(job_name\) do update/i);
    expect(params).toEqual(['weekly_digest_push', when]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest pushToken -v`
Expected: FAIL — "Cannot find module '../../models/PushToken'".

- [ ] **Step 3: Write the model**

Create `backend/api/src/models/PushToken.ts`:

```typescript
/**
 * PushToken model — hub.push_tokens (Expo push tokens) and hub.job_state
 * (generic scheduled-job dedup markers).
 */
import { query, queryOne, queryMany } from '../db/queries';

export class PushTokenModel {
  static async upsert(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    await query(
      `INSERT INTO hub.push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             updated_at = now()`,
      [userId, token, platform]
    );
  }

  static async findTokensByUser(userId: string): Promise<string[]> {
    const rows = await queryMany<{ token: string }>(
      `SELECT token FROM hub.push_tokens WHERE user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.token);
  }

  static async deleteToken(token: string): Promise<void> {
    await query(`DELETE FROM hub.push_tokens WHERE token = $1`, [token]);
  }
}

export class JobStateModel {
  static async getLastRun(jobName: string): Promise<Date | null> {
    const row = await queryOne<{ last_run_at: Date | null }>(
      `SELECT last_run_at FROM hub.job_state WHERE job_name = $1`,
      [jobName]
    );
    return row?.last_run_at ?? null;
  }

  static async setLastRun(jobName: string, when: Date): Promise<void> {
    await query(
      `INSERT INTO hub.job_state (job_name, last_run_at)
       VALUES ($1, $2)
       ON CONFLICT (job_name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`,
      [jobName, when]
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/api && npx jest pushToken -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/models/PushToken.ts backend/api/src/__tests__/models/pushToken.test.ts
git commit -m "feat(api): PushToken + JobState models"
```

---

### Task 3: `pushService.sendToUser` (Expo Push + dead-token cleanup)

**Files:**
- Create: `backend/api/src/services/pushService.ts`
- Test: `backend/api/src/__tests__/services/pushService.test.ts`

**Interfaces:**
- Consumes: `PushTokenModel.findTokensByUser`, `PushTokenModel.deleteToken`; global `fetch`.
- Produces: `sendToUser(userId: string, msg: { title: string; body: string; data?: Record<string, unknown> }): Promise<void>` (never throws).

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/pushService.test.ts`:

```typescript
import { sendToUser } from '../../services/pushService';
import { PushTokenModel } from '../../models/PushToken';

jest.mock('../../models/PushToken');
const mockPT = PushTokenModel as jest.Mocked<typeof PushTokenModel>;

describe('pushService.sendToUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('POSTs one Expo message per token with title/body/data', async () => {
    mockPT.findTokensByUser.mockResolvedValue(['TokA', 'TokB']);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }),
    });

    await sendToUser('u1', { title: 'T', body: 'B', data: { screen: 'Insights' } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const sent = JSON.parse(opts.body);
    expect(sent).toEqual([
      { to: 'TokA', title: 'T', body: 'B', data: { screen: 'Insights' }, sound: 'default' },
      { to: 'TokB', title: 'T', body: 'B', data: { screen: 'Insights' }, sound: 'default' },
    ]);
  });

  it('deletes a token that Expo reports as DeviceNotRegistered', async () => {
    mockPT.findTokensByUser.mockResolvedValue(['GoodTok', 'DeadTok']);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok' },
          { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    });

    await sendToUser('u1', { title: 'T', body: 'B' });

    expect(mockPT.deleteToken).toHaveBeenCalledWith('DeadTok');
    expect(mockPT.deleteToken).not.toHaveBeenCalledWith('GoodTok');
  });

  it('no tokens → no fetch, no throw', async () => {
    mockPT.findTokensByUser.mockResolvedValue([]);
    await expect(sendToUser('u1', { title: 'T', body: 'B' })).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('swallows network errors (never throws)', async () => {
    mockPT.findTokensByUser.mockResolvedValue(['TokA']);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    await expect(sendToUser('u1', { title: 'T', body: 'B' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest pushService -v`
Expected: FAIL — "Cannot find module '../../services/pushService'".

- [ ] **Step 3: Write the service**

Create `backend/api/src/services/pushService.ts`:

```typescript
/**
 * Reusable server→device push via the Expo Push API. First consumer is the
 * weekly digest; Phase 8 contextual resurfacing will reuse it. Never throws —
 * a failed push must not crash a caller (e.g. the cron).
 */
import { PushTokenModel } from '../models/PushToken';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendToUser(userId: string, msg: PushMessage): Promise<void> {
  try {
    const tokens = await PushTokenModel.findTokensByUser(userId);
    if (tokens.length === 0) {
      console.log(`[pushService] No push tokens for user ${userId} — nothing to send`);
      return;
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
      return;
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
  } catch (err) {
    console.warn('[pushService] sendToUser failed (swallowed):', err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/api && npx jest pushService -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/pushService.ts backend/api/src/__tests__/services/pushService.test.ts
git commit -m "feat(api): reusable Expo pushService.sendToUser with dead-token cleanup"
```

---

### Task 4: `/api/v1/push` route (register + dev test-send)

**Files:**
- Create: `backend/api/src/routes/push.ts`
- Modify: `backend/api/src/index.ts` (import + mount)
- Test: `backend/api/src/__tests__/routes/pushRegisterRoute.test.ts`

**Interfaces:**
- Consumes: `authenticate`, `PushTokenModel.upsert`, `sendToUser`.
- Produces: `POST /api/v1/push/register` `{ token, platform }` → `{ ok: true }`; `POST /api/v1/push/test` → sends a test push to the caller, returns `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/routes/pushRegisterRoute.test.ts`:

```typescript
import express from 'express';
import request from 'supertest';
import pushRoutes from '../../routes/push';
import { PushTokenModel } from '../../models/PushToken';

jest.mock('../../models/PushToken');
jest.mock('../../services/pushService', () => ({ sendToUser: jest.fn() }));
jest.mock('../../auth/middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: 'u1' }; next(); },
}));

const mockPT = PushTokenModel as jest.Mocked<typeof PushTokenModel>;

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/push', pushRoutes);
  return a;
}

describe('POST /api/v1/push/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts the token and returns ok', async () => {
    mockPT.upsert.mockResolvedValue();
    const res = await request(app())
      .post('/api/v1/push/register')
      .send({ token: 'ExpoTok', platform: 'ios' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockPT.upsert).toHaveBeenCalledWith('u1', 'ExpoTok', 'ios');
  });

  it('rejects a missing token with 400', async () => {
    const res = await request(app()).post('/api/v1/push/register').send({ platform: 'ios' });
    expect(res.status).toBe(400);
    expect(mockPT.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest pushRegisterRoute -v`
Expected: FAIL — "Cannot find module '../../routes/push'".

- [ ] **Step 3: Write the route**

Create `backend/api/src/routes/push.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { PushTokenModel } from '../models/PushToken';
import { sendToUser } from '../services/pushService';

const router = Router();
router.use(authenticate);

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']).optional(),
});

// POST /api/v1/push/register — store this device's Expo push token
router.post('/register', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_BODY', message: parsed.error.message });
  await PushTokenModel.upsert(req.user.id, parsed.data.token, parsed.data.platform ?? 'ios');
  res.json({ ok: true });
});

// POST /api/v1/push/test — dev helper: send a test push to the caller's devices
router.post('/test', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  await sendToUser(req.user.id, {
    title: '🔔 Offload test push',
    body: 'If you can see this, push delivery works.',
    data: { screen: 'Insights' },
  });
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/api && npx jest pushRegisterRoute -v`
Expected: PASS (2 tests). (If `supertest` is absent, install as a dev dep: `npm i -D supertest @types/supertest` — check `package.json` first; other route tests indicate the harness is present.)

- [ ] **Step 5: Mount the route in `index.ts`**

In `backend/api/src/index.ts`, add the import beside the other route imports (after line 88, `import diagnosticsRoutes from './routes/diagnostics';`):

```typescript
import pushRoutes from './routes/push';
```

And mount it beside the others (after line 100, `app.use('/api/v1/diagnostics', diagnosticsRoutes);`):

```typescript
app.use('/api/v1/push', pushRoutes);
```

- [ ] **Step 6: Verify build + commit**

Run: `cd backend/api && npx tsc --noEmit 2>&1 | grep -E "push" || echo "no push errors"`
Expected: `no push errors`.

```bash
git add backend/api/src/routes/push.ts backend/api/src/index.ts backend/api/src/__tests__/routes/pushRegisterRoute.test.ts
git commit -m "feat(api): /push register + dev test-send route"
```

---

### Task 5: Weekly cron job (Sunday 18:00 HST, ISO-week deduped)

**Files:**
- Create: `backend/api/src/jobs/weeklySynthesisJob.ts`
- Modify: `backend/api/src/index.ts` (import + start)
- Test: `backend/api/src/__tests__/jobs/weeklySynthesisTiming.test.ts`

**Interfaces:**
- Consumes: `generateWeeklySynthesis`, `sendToUser`, `JobStateModel`.
- Produces:
  - `shouldFireWeekly(nowUtc: Date, lastRunAt: Date | null): boolean` (pure; HST Sunday 18:00 + not already this ISO week)
  - `runWeeklyDigestOnce(userId: string): Promise<void>`
  - `startWeeklySynthesisJob(): void`

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/jobs/weeklySynthesisTiming.test.ts`:

```typescript
import { shouldFireWeekly } from '../../jobs/weeklySynthesisJob';

// HST = UTC-10. Sunday 18:00 HST == Monday 04:00 UTC.
const SUN_18_HST = new Date('2026-06-29T04:00:00Z'); // Mon 2026-06-29 04:00Z = Sun 18:00 HST
const SUN_17_HST = new Date('2026-06-29T03:00:00Z'); // Sun 17:00 HST
const SUN_19_HST = new Date('2026-06-29T05:00:00Z'); // Sun 19:00 HST
const SAT_18_HST = new Date('2026-06-28T04:00:00Z'); // Sat 18:00 HST

describe('shouldFireWeekly', () => {
  it('fires at Sunday 18:00 HST when never run', () => {
    expect(shouldFireWeekly(SUN_18_HST, null)).toBe(true);
  });
  it('does not fire outside the 18:00 HST hour', () => {
    expect(shouldFireWeekly(SUN_17_HST, null)).toBe(false);
    expect(shouldFireWeekly(SUN_19_HST, null)).toBe(false);
  });
  it('does not fire on a non-Sunday', () => {
    expect(shouldFireWeekly(SAT_18_HST, null)).toBe(false);
  });
  it('does not re-fire if already run this ISO week', () => {
    const earlierSameHour = new Date('2026-06-29T04:00:00Z');
    expect(shouldFireWeekly(SUN_18_HST, earlierSameHour)).toBe(false);
  });
  it('fires again once a new ISO week has started', () => {
    const lastWeek = new Date('2026-06-22T04:00:00Z'); // prior week
    expect(shouldFireWeekly(SUN_18_HST, lastWeek)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest weeklySynthesisTiming -v`
Expected: FAIL — "Cannot find module '../../jobs/weeklySynthesisJob'".

- [ ] **Step 3: Write the job**

Create `backend/api/src/jobs/weeklySynthesisJob.ts`:

```typescript
/**
 * Weekly digest push. Hourly tick; fires once at Sunday 18:00 HST (UTC-10),
 * deduped per ISO week via hub.job_state. Generates the weekly synthesis, then
 * pushes a notification linking to the Insights screen.
 */
import { generateWeeklySynthesis } from '../services/synthesisService';
import { sendToUser } from '../services/pushService';
import { JobStateModel } from '../models/PushToken';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const JOB_NAME = 'weekly_digest_push';
const HST_OFFSET_HOURS = -10; // HST has no DST
const FIRE_HOUR_HST = 18;     // 6pm
const SUNDAY = 0;

// Single-user app: the sole account. Kept as a constant so the loop is trivial;
// generalize to "for each user with a push token" when multi-user lands.
const TARGET_USER_ID = process.env.WEEKLY_DIGEST_USER_ID ?? '16207862-4d0b-4e10-8d51-6f2fcdafe9cc';

function hstParts(nowUtc: Date): { day: number; hour: number } {
  const shifted = new Date(nowUtc.getTime() + HST_OFFSET_HOURS * 60 * 60 * 1000);
  return { day: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

// ISO week key (year + week number) computed in HST, for dedup.
function isoWeekKey(nowUtc: Date): string {
  const d = new Date(nowUtc.getTime() + HST_OFFSET_HOURS * 60 * 60 * 1000);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${date.getUTCFullYear()}-W${week}`;
}

export function shouldFireWeekly(nowUtc: Date, lastRunAt: Date | null): boolean {
  const { day, hour } = hstParts(nowUtc);
  if (day !== SUNDAY || hour !== FIRE_HOUR_HST) return false;
  if (lastRunAt && isoWeekKey(lastRunAt) === isoWeekKey(nowUtc)) return false;
  return true;
}

export async function runWeeklyDigestOnce(userId: string): Promise<void> {
  const synthesis = await generateWeeklySynthesis(userId); // 7-day, same-day cached
  const accomplished = synthesis.accomplishedCount ?? 0;
  const stillOpen = synthesis.openThreads?.length ?? 0;
  await sendToUser(userId, {
    title: '🧠 Your weekly brief is ready',
    body: `${accomplished} accomplished · ${stillOpen} still open`,
    data: { screen: 'Insights' },
  });
}

async function tick(): Promise<void> {
  const now = new Date();
  const lastRun = await JobStateModel.getLastRun(JOB_NAME);
  if (!shouldFireWeekly(now, lastRun)) return;
  console.log('[weeklyDigestJob] Firing weekly digest push');
  try {
    await runWeeklyDigestOnce(TARGET_USER_ID);
    await JobStateModel.setLastRun(JOB_NAME, now); // mark only on success
  } catch (err) {
    console.error('[weeklyDigestJob] run failed (will retry next tick):', err);
  }
}

export function startWeeklySynthesisJob(): void {
  console.log('[weeklyDigestJob] Starting — hourly check, fires Sunday 18:00 HST');
  setInterval(() => {
    tick().catch((err) => console.error('[weeklyDigestJob] tick error:', err));
  }, CHECK_INTERVAL_MS);
}
```

Note: replace the `TARGET_USER_ID` default with the real account id (it is the user id used throughout this session's DB work) or set `WEEKLY_DIGEST_USER_ID` in Railway.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/api && npx jest weeklySynthesisTiming -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Start the job in `index.ts`**

In `backend/api/src/index.ts`, add the import beside the other job imports (after line 75, `import { startMonthlyLongTermSynthesisJob } from './jobs/monthlyLongTermSynthesisJob';`):

```typescript
import { startWeeklySynthesisJob } from './jobs/weeklySynthesisJob';
```

And start it beside the others (after line 199, `startMonthlyLongTermSynthesisJob();`):

```typescript
startWeeklySynthesisJob();
```

- [ ] **Step 6: Verify build + commit**

Run: `cd backend/api && npx tsc --noEmit 2>&1 | grep -E "weeklySynthesisJob" || echo "no weekly job errors"`
Expected: `no weekly job errors`.

```bash
git add backend/api/src/jobs/weeklySynthesisJob.ts backend/api/src/index.ts backend/api/src/__tests__/jobs/weeklySynthesisTiming.test.ts
git commit -m "feat(api): weekly digest cron (Sunday 18:00 HST, ISO-week deduped)"
```

---

### Task 6: Mobile — register the Expo push token on auth

**Files:**
- Create: `mobile/src/services/pushRegistration.ts`
- Modify: `mobile/src/services/api.ts` (add `registerPushToken`)
- Modify: `mobile/src/context/AuthContext.tsx` (register when authenticated)

**Interfaces:**
- Consumes: `expo-notifications` `getExpoPushTokenAsync`, `expo-constants`, `apiService`.
- Produces: `apiService.registerPushToken(token: string, platform: 'ios'|'android'): Promise<void>`; `registerPushTokenWithBackend(): Promise<void>`.

- [ ] **Step 1: Add `registerPushToken` to `mobile/src/services/api.ts`**

Add this method inside the `ApiService` class (near the other POST methods, e.g. after `getDeepgramToken`):

```typescript
  async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    await this.request('/api/v1/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  }
```

- [ ] **Step 2: Create the registration helper**

Create `mobile/src/services/pushRegistration.ts`:

```typescript
/**
 * Registers this device's Expo push token with the backend so the server can
 * deliver the weekly digest (and future proactive pushes). Safe to call on
 * every auth — the backend upserts by token. Never throws.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiService } from './api';

const EAS_PROJECT_ID =
  (Constants.expoConfig?.extra as any)?.eas?.projectId ?? '6444b92a-4608-4106-8a94-5764a457cb72';

export async function registerPushTokenWithBackend(): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) {
      console.log('[push] notification permission not granted — skipping token registration');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    await apiService.registerPushToken(token, platform);
    console.log('[push] registered Expo push token with backend');
  } catch (err) {
    console.warn('[push] token registration failed (non-fatal):', err);
  }
}
```

- [ ] **Step 3: Call it when authenticated in `AuthContext.tsx`**

In `mobile/src/context/AuthContext.tsx`, import the helper near the top:

```typescript
import { registerPushTokenWithBackend } from '../services/pushRegistration';
```

Add a `useEffect` inside the provider component that fires whenever the user becomes authenticated (place it beside the existing effects that read `state.isAuthenticated`):

```typescript
  useEffect(() => {
    if (state.isAuthenticated) {
      void registerPushTokenWithBackend();
    }
  }, [state.isAuthenticated]);
```

(If `useEffect` is not yet imported from `react` in this file, add it to the import.)

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "pushRegistration|AuthContext|api.ts" || echo "no new errors"`
Expected: `no new errors` (baseline pre-existing errors unchanged — confirm total count is still the known baseline of 5: `npx tsc --noEmit 2>&1 | grep -cE "error TS"`).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/pushRegistration.ts mobile/src/services/api.ts mobile/src/context/AuthContext.tsx
git commit -m "feat(mobile): register Expo push token with backend on auth"
```

---

### Task 7: Mobile — `Insights` deep-link on notification tap

**Files:**
- Modify: `mobile/App.tsx` (`handleNotificationData`)

**Interfaces:**
- Consumes: existing `navigationRef`, existing `handleNotificationData(data)` dispatcher.
- Produces: tapping a `data.screen === 'Insights'` push navigates to the `Insights` route (`SynthesisScreen`).

- [ ] **Step 1: Add the Insights branch**

In `mobile/App.tsx`, inside `handleNotificationData`, add a branch alongside the existing `PlaceSummary` / `Objects` branches (use the same `navigationRef.navigate` style already used there):

```typescript
  } else if (data?.screen === 'Insights') {
    navigationRef.navigate('Insights');
    return;
```

(Match the existing control-flow shape in that function — if it uses `if/else if`, insert this as another `else if` before the fallback; if the file references `navigationRef` differently, follow that local pattern. `Insights` is the route registered for `SynthesisScreen` in `AppNavigator`.)

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "App.tsx" || echo "no App.tsx errors"`
Expected: `no App.tsx errors`.

- [ ] **Step 3: Commit**

```bash
git add mobile/App.tsx
git commit -m "feat(mobile): deep-link weekly-digest push to Insights screen"
```

---

### Task 8: Ship + end-to-end device verification

**Files:** none (deploy + manual verification).

- [ ] **Step 1: Deploy backend + apply migration**

```bash
git push origin main            # Railway auto-deploys
# migration 013 already applied in Task 1; if not, apply now (see Task 1 Step 2)
```
Confirm deploy SUCCESS (`cd backend/api && railway deployment list | head -3`) and `GET /health` returns 200.

- [ ] **Step 2: Ship mobile OTA**

```bash
cd mobile && eas update --branch preview --message "feat: weekly digest push (token reg + Insights deep-link)" --clear-cache
```
Verify bundle is clean: `for f in dist/_expo/static/js/*/index-*.hbc; do echo "$(basename $(dirname $f)): $(grep -c localhost "$f")"; done` → both `0`.

- [ ] **Step 3: Register the token on-device**

Reopen the app 2–3× to load the OTA, then open it while logged in. Confirm in prod DB:
```bash
PGURL=$(cd backend/api && railway variables --json | jq -r '.DATABASE_PUBLIC_URL')
PGSSLMODE=require psql "$PGURL" -tAc "select count(*), max(updated_at) from hub.push_tokens;"
```
Expected: count ≥ 1.

- [ ] **Step 4: Fire the dev test push**

From an authenticated context (device or a curl with the user's access token):
```bash
curl -s -X POST https://brain-dump-production-895b.up.railway.app/api/v1/push/test \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json"
```
Expected: `{ "ok": true }` and a push notification arrives on the device; tapping it opens the **Insights / Synthesis** screen.

- [ ] **Step 5: Verify the weekly digest content path**

Trigger a real generation + push without waiting for Sunday by calling `runWeeklyDigestOnce` via the test route path, OR temporarily invoke it through the dev test route after pointing it at `runWeeklyDigestOnce` (optional). At minimum confirm `POST /api/v1/synthesis/weekly?force=true` returns a synthesis with `accomplishedCount` and `openThreads`, matching what the push body will show.

- [ ] **Step 6: (Sunday) confirm the scheduled fire**

On/after the next Sunday 18:00 HST, confirm a push arrived and:
```bash
PGSSLMODE=require psql "$PGURL" -tAc "select job_name, last_run_at from hub.job_state where job_name='weekly_digest_push';"
```
Expected: `last_run_at` within the last hour of the fire.

---

## Notes for the implementer

- **Single-user shortcut:** the cron targets one `TARGET_USER_ID`. When multi-user lands, replace `runWeeklyDigestOnce(TARGET_USER_ID)` with a loop over users who have a push token (`SELECT DISTINCT user_id FROM hub.push_tokens`) and per-user timezones.
- **HST has no DST**, so the fixed `-10` offset is correct year-round.
- **Do not** re-notify on `generateWeeklySynthesis`'s same-day cache — the ISO-week `job_state` marker is the dedup, independent of the synthesis cache.
- **Auth for the curl test:** grab a valid access token from the device (SecureStore `accessToken`) or the login endpoint.
