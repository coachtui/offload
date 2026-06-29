# Place Done/Delete Cleanup + Completion-Aware Recap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every location notification list two clear actions — Done (global resolve) and Delete (soft-delete) — add a re-fire cooldown to manual geofences, and surface completed notes in a dedicated "Accomplished" section of the weekly AI recap.

**Architecture:** Three independent phases on one branch. **Phase A** simplifies the mobile `PlaceSummaryScreen` action row. **Phase B** mirrors the existing inferred-place cooldown machinery (`place_trigger_state` + `getPlaceNotifyPayload` + `POST /:id/notify`) for manual geofences. **Phase C** adds a deterministic `findResolvedInPeriod` query whose results become the recap's "Accomplished" list (not LLM-generated — the DB is the source of truth, which also captures notes created before the week but resolved during it).

**Tech Stack:** TypeScript, Express, node-postgres (raw SQL via `query`/`queryOne`/`queryMany`), Jest + ts-jest + supertest (backend tests), React Native + Expo (mobile, no test runner).

## Global Constraints

- All DB objects live in the `hub.` schema.
- **Raw-SQL migrations** go in `backend/api/src/db/migrations/`, zero-padded 3-digit prefix, idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Highest existing is `010_`. This plan adds `011_` (Phase B) and `012_` (Phase C). These `.sql` files are applied out-of-band (the user runs them against the DB — same path used for `006`–`010`); they are NOT picked up by `npm run migrate` (that command is the separate node-pg-migrate `.ts` system in `backend/api/migrations/`). Keep them idempotent so re-apply is safe.
- **Object lifecycle states:** `'open' | 'active' | 'resolved' | 'archived'`. **Done = `state='resolved'`** (global, row stays queryable). **Delete = soft-delete** (`deleted_at = NOW()`, recoverable 30 days, excluded from all reads).
- **Cooldown window = `60 * 60 * 1000` ms (1 hour).** Matches `placeService.COOLDOWN_MS` exactly.
- **Backend tests:** run `npm test` from `/Users/tui/offload/backend/api`. Tests mock the model/db layer — no real DB. Mirror existing patterns in `src/__tests__/`.
- **Mobile has NO test framework** (no jest, no test script, only `typescript`). Do NOT introduce one. Mobile tasks verify with `npx tsc --noEmit` (run from `/Users/tui/offload/mobile`) plus a manual on-device check. This overrides the default TDD step structure for Phase A and the mobile steps of Phase C.
- Two route styles exist. `geofences.ts` uses the verbose `{ error: 'CODE', message }` + explicit 404/403 mapping style; the new geofence notify route follows that file's own style for consistency.
- `GeofenceModel` is an instance class with static query methods; add static trigger-state helpers to it (mirroring `PlaceModel`'s static helpers).

---

## Phase A — Mobile: unified Done + Delete in PlaceSummaryScreen

### Task A1: Replace the place-note action row with Done + Delete

**Files:**
- Modify: `mobile/src/screens/PlaceSummaryScreen.tsx`

**Interfaces:**
- Consumes (already exist in `mobile/src/services/api.ts`): `apiService.updateObjectState(objectId, 'resolved')`, `apiService.deleteObject(objectId)`, `apiService.getPlaceObjects(placeId)`, `apiService.getGeofenceObjects(geofenceId, true)`.
- Produces: a screen whose every note (place or geofence) shows exactly two actions — Done and Delete.

This is a mobile-only change. No test runner exists, so the cycle is: edit → typecheck → commit. Manual device verification noted at the end.

- [ ] **Step 1: Update the file header comment**

In `mobile/src/screens/PlaceSummaryScreen.tsx`, change the top doc comment line:

```tsx
 * Displays linked atomic objects with Done / Delete actions.
```

(was "Done / Dismiss / Snooze / Unlink actions").

- [ ] **Step 2: Remove the `Modal` import and the `SNOOZE_OPTIONS` constant**

In the `react-native` import block, delete the `Modal,` line. Then delete the entire `SNOOZE_OPTIONS` constant:

```tsx
const SNOOZE_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: 'Tomorrow', hours: 24 },
];
```

- [ ] **Step 3: Remove the snooze state hook**

Delete this line from the component body:

```tsx
  const [snoozeTarget, setSnoozeTarget] = useState<string | null>(null); // objectId for snooze modal
```

- [ ] **Step 4: Replace `handleDone` and the three other handlers with `handleDone` + `handleDelete`**

Replace the whole block from `const handleDone = async ...` through the end of `handleUnlink` (the four handlers) with exactly these two:

```tsx
  const handleDone = async (objectId: string) => {
    setActionLoading(objectId);
    try {
      // Done = resolve the underlying object globally (gone from every place it's linked to)
      await apiService.updateObjectState(objectId, 'resolved');
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      Alert.alert('Error', 'Failed to mark as done.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (objectId: string) => {
    Alert.alert(
      'Delete note',
      'This note will be removed everywhere. You can recover it within 30 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(objectId);
            try {
              await apiService.deleteObject(objectId);
              setObjects(prev => prev.filter(o => o.id !== objectId));
            } catch (err: any) {
              Alert.alert('Error', 'Failed to delete.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };
```

- [ ] **Step 5: Replace the action row in `renderObject`**

Replace the `{isActioning ? (...) : (...)}` block's `else` branch (the `<View style={styles.actionRow}>...</View>` containing Done + the `{!geofenceId && (...)}` group) with this — same two buttons for both places and geofences:

```tsx
        {isActioning ? (
          <ActivityIndicator size="small" color="#3b82f6" style={styles.actionLoader} />
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.doneBtn]}
              onPress={() => handleDone(item.id)}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" />
              <Text style={[styles.actionBtnText, { color: '#22c55e' }]}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => handleDelete(item.id)}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
              <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
```

- [ ] **Step 6: Delete the snooze `<Modal>` block from the main return**

Remove the entire `{/* Snooze modal */}` block (the `<Modal visible={snoozeTarget !== null} ...> ... </Modal>`).

- [ ] **Step 7: Add `deleteBtn` style and remove the snooze styles**

In the `StyleSheet.create({...})`, add next to `doneBtn`:

```tsx
  deleteBtn: {
    backgroundColor: '#2e0a0a',
  },
```

Then delete these now-unused style keys: `modalBackdrop`, `snoozeSheet`, `snoozeTitle`, `snoozeOption`, `snoozeOptionText`, `snoozeCancelBtn`, `snoozeCancelText`.

- [ ] **Step 8: Typecheck**

Run from `/Users/tui/offload/mobile`:

```bash
npx tsc --noEmit
```

Expected: no errors. (If it reports an unused `setSnoozeTarget`/`snoozeTarget` or `Modal`, you missed a deletion in Steps 2–6.)

- [ ] **Step 9: Commit**

```bash
git add mobile/src/screens/PlaceSummaryScreen.tsx
git commit -m "feat(mobile): unify place/geofence note actions to Done + Delete"
```

- [ ] **Step 10: Manual device verification (no automated mobile tests exist)**

On a device/build pointed at the dev backend: open a place notification → confirm every note shows only **Done** and **Delete**; tap Done → note disappears and does not return on re-entry; tap Delete → confirm dialog → note disappears. Verify identical actions appear for a manual-geofence notification and an inferred-place notification.

---

## Phase B — Manual geofence re-fire cooldown

### Task B1: Add the `geofence_trigger_state` migration

**Files:**
- Create: `backend/api/src/db/migrations/011_geofence_trigger_state.sql`

**Interfaces:**
- Produces: table `hub.geofence_trigger_state` with columns `id, user_id, geofence_id, last_entered_at, last_notified_at, cooldown_until, visit_count` and `UNIQUE(user_id, geofence_id)` — the exact shape `hub.place_trigger_state` has, keyed on `geofence_id`.

- [ ] **Step 1: Write the migration file**

Create `backend/api/src/db/migrations/011_geofence_trigger_state.sql`:

```sql
-- Migration 011: Geofence trigger state (re-fire cooldown for manual geofences)
-- Mirrors hub.place_trigger_state so manual geofences get the same anti-spam cooldown.

CREATE SCHEMA IF NOT EXISTS hub;

CREATE TABLE IF NOT EXISTS hub.geofence_trigger_state (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  geofence_id      uuid        NOT NULL REFERENCES hub.geofences(id) ON DELETE CASCADE,
  last_entered_at  timestamptz,
  last_notified_at timestamptz,
  cooldown_until   timestamptz,
  visit_count      integer     NOT NULL DEFAULT 0,
  UNIQUE(user_id, geofence_id)
);

CREATE INDEX IF NOT EXISTS gts_user_geofence_idx
  ON hub.geofence_trigger_state(user_id, geofence_id);
```

- [ ] **Step 2: Validate the SQL parses (local DB)**

If a local Postgres with the `hub` schema is available, apply it (idempotent, safe to re-run):

```bash
psql "$DATABASE_URL" -f backend/api/src/db/migrations/011_geofence_trigger_state.sql
```

Expected: `CREATE TABLE` / `CREATE INDEX` (or `NOTICE ... already exists, skipping`). If no local DB is available, the user applies it against the real DB the same way `006`–`010` were applied — note this in the commit and proceed; downstream tasks mock the DB and do not need the table to exist.

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/db/migrations/011_geofence_trigger_state.sql
git commit -m "feat(db): add hub.geofence_trigger_state for manual-geofence cooldown"
```

### Task B2: Add trigger-state helpers to `GeofenceModel`

**Files:**
- Modify: `backend/api/src/models/Geofence.ts`
- Test: `backend/api/src/__tests__/models/geofenceTriggerState.test.ts`

**Interfaces:**
- Produces: `GeofenceModel.getTriggerState(userId, geofenceId): Promise<GeofenceTriggerState | null>` and `GeofenceModel.upsertTriggerState(userId, geofenceId, { lastEnteredAt?, lastNotifiedAt?, cooldownUntil?, incrementVisit? }): Promise<GeofenceTriggerState>`. `GeofenceTriggerState` has camelCase fields `{ id, userId, geofenceId, lastEnteredAt, lastNotifiedAt, cooldownUntil, visitCount }`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/models/geofenceTriggerState.test.ts`:

```ts
import { GeofenceModel } from '../../models/Geofence';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('GeofenceModel trigger state', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getTriggerState maps a row to camelCase and queries geofence_trigger_state', async () => {
    mockQueries.queryOne.mockResolvedValue({
      id: 't1', user_id: 'u1', geofence_id: 'g1',
      last_entered_at: null, last_notified_at: null,
      cooldown_until: null, visit_count: 3,
    } as any);

    const state = await GeofenceModel.getTriggerState('u1', 'g1');

    expect(state).toMatchObject({ id: 't1', userId: 'u1', geofenceId: 'g1', visitCount: 3 });
    const sql = mockQueries.queryOne.mock.calls[0][0] as string;
    expect(sql).toMatch(/hub\.geofence_trigger_state/i);
  });

  it('getTriggerState returns null when no row', async () => {
    mockQueries.queryOne.mockResolvedValue(null as any);
    expect(await GeofenceModel.getTriggerState('u1', 'g1')).toBeNull();
  });

  it('upsertTriggerState upserts on the (user_id, geofence_id) conflict', async () => {
    mockQueries.queryOne.mockResolvedValue({
      id: 't1', user_id: 'u1', geofence_id: 'g1',
      last_entered_at: null, last_notified_at: null,
      cooldown_until: null, visit_count: 1,
    } as any);

    await GeofenceModel.upsertTriggerState('u1', 'g1', { incrementVisit: true });

    const sql = mockQueries.queryOne.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO hub\.geofence_trigger_state/i);
    expect(sql).toMatch(/ON CONFLICT \(user_id, geofence_id\)/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tui/offload/backend/api && npm test -- geofenceTriggerState
```

Expected: FAIL — `GeofenceModel.getTriggerState is not a function`.

- [ ] **Step 3: Add the types and row mapper**

In `backend/api/src/models/Geofence.ts`, after the `GeofenceRow` interface, add:

```ts
export interface GeofenceTriggerStateRow {
  id: string;
  user_id: string;
  geofence_id: string;
  last_entered_at: Date | null;
  last_notified_at: Date | null;
  cooldown_until: Date | null;
  visit_count: number;
}

export interface GeofenceTriggerState {
  id: string;
  userId: string;
  geofenceId: string;
  lastEnteredAt: Date | null;
  lastNotifiedAt: Date | null;
  cooldownUntil: Date | null;
  visitCount: number;
}

function rowToGeofenceTriggerState(row: GeofenceTriggerStateRow): GeofenceTriggerState {
  return {
    id: row.id,
    userId: row.user_id,
    geofenceId: row.geofence_id,
    lastEnteredAt: row.last_entered_at,
    lastNotifiedAt: row.last_notified_at,
    cooldownUntil: row.cooldown_until,
    visitCount: row.visit_count,
  };
}
```

- [ ] **Step 4: Add the static helpers to the class**

Inside the `GeofenceModel` class (e.g. after `getOpenLinkedObjectIds`), add:

```ts
  // ─── Trigger state (manual-geofence re-fire cooldown) ──────────────────────

  static async getTriggerState(
    userId: string,
    geofenceId: string
  ): Promise<GeofenceTriggerState | null> {
    const row = await queryOne<GeofenceTriggerStateRow>(
      `SELECT * FROM hub.geofence_trigger_state WHERE user_id = $1 AND geofence_id = $2`,
      [userId, geofenceId]
    );
    return row ? rowToGeofenceTriggerState(row) : null;
  }

  static async upsertTriggerState(
    userId: string,
    geofenceId: string,
    updates: {
      lastEnteredAt?: Date;
      lastNotifiedAt?: Date;
      cooldownUntil?: Date;
      incrementVisit?: boolean;
    }
  ): Promise<GeofenceTriggerState> {
    const row = await queryOne<GeofenceTriggerStateRow>(
      `INSERT INTO hub.geofence_trigger_state
         (user_id, geofence_id, last_entered_at, last_notified_at, cooldown_until, visit_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, geofence_id) DO UPDATE SET
         last_entered_at  = COALESCE($3, geofence_trigger_state.last_entered_at),
         last_notified_at = COALESCE($4, geofence_trigger_state.last_notified_at),
         cooldown_until   = COALESCE($5, geofence_trigger_state.cooldown_until),
         visit_count      = CASE WHEN $7 THEN geofence_trigger_state.visit_count + 1
                                 ELSE geofence_trigger_state.visit_count END
       RETURNING *`,
      [
        userId,
        geofenceId,
        updates.lastEnteredAt ?? null,
        updates.lastNotifiedAt ?? null,
        updates.cooldownUntil ?? null,
        updates.incrementVisit ? 1 : 0,
        updates.incrementVisit ?? false,
      ]
    );
    if (!row) throw new Error('Failed to upsert geofence trigger state');
    return rowToGeofenceTriggerState(row);
  }
```

(`queryOne` is already imported at the top of `Geofence.ts`.)

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/tui/offload/backend/api && npm test -- geofenceTriggerState
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/models/Geofence.ts backend/api/src/__tests__/models/geofenceTriggerState.test.ts
git commit -m "feat(api): add GeofenceModel trigger-state helpers"
```

### Task B3: Add `getGeofenceNotifyPayload` with cooldown gate

**Files:**
- Modify: `backend/api/src/services/geofenceService.ts`
- Test: `backend/api/src/__tests__/services/geofenceNotifyPayload.test.ts`

**Interfaces:**
- Consumes: `GeofenceModel.getTriggerState` / `upsertTriggerState` (Task B2), `getGeofenceObjects(userId, geofenceId, true)` (same module).
- Produces: `getGeofenceNotifyPayload(userId, geofenceId): Promise<{ objects: AtomicObject[]; geofenceName: string } | null>` — returns `null` when within cooldown; otherwise sets a fresh 1-hour cooldown, increments visit, and returns open linked objects.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/geofenceNotifyPayload.test.ts`:

```ts
import { getGeofenceNotifyPayload } from '../../services/geofenceService';
import { GeofenceModel } from '../../models/Geofence';
import { AtomicObjectModel } from '../../models/AtomicObject';

jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');

const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;

const USER = 'u1';
const GF = 'g1';

describe('getGeofenceNotifyPayload — cooldown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeo.findById.mockResolvedValue({
      userId: USER, name: 'The Gym',
      notificationSettings: { enabled: true },
    } as any);
    mockGeo.getOpenLinkedObjectIds.mockResolvedValue(['o1']);
    mockObj.findByIds.mockResolvedValue([{ toAtomicObject: () => ({ id: 'o1' }) } as any]);
    mockGeo.upsertTriggerState.mockResolvedValue({} as any);
  });

  it('returns null and does NOT update trigger state when within cooldown', async () => {
    const future = new Date(Date.now() + 60_000);
    mockGeo.getTriggerState.mockResolvedValue({ cooldownUntil: future } as any);

    const payload = await getGeofenceNotifyPayload(USER, GF);

    expect(payload).toBeNull();
    expect(mockGeo.upsertTriggerState).not.toHaveBeenCalled();
  });

  it('returns objects + sets a fresh cooldown (incrementVisit) when not cooling down', async () => {
    mockGeo.getTriggerState.mockResolvedValue(null as any);

    const payload = await getGeofenceNotifyPayload(USER, GF);

    expect(payload).toMatchObject({ geofenceName: 'The Gym' });
    expect(payload?.objects).toHaveLength(1);
    expect(mockGeo.upsertTriggerState).toHaveBeenCalledWith(
      USER, GF, expect.objectContaining({ incrementVisit: true })
    );
  });

  it('throws Unauthorized when the geofence belongs to another user', async () => {
    mockGeo.findById.mockResolvedValue({ userId: 'other', notificationSettings: { enabled: true } } as any);
    mockGeo.getTriggerState.mockResolvedValue(null as any);

    await expect(getGeofenceNotifyPayload(USER, GF)).rejects.toThrow('Unauthorized');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tui/offload/backend/api && npm test -- geofenceNotifyPayload
```

Expected: FAIL — `getGeofenceNotifyPayload is not a function` (or import undefined).

- [ ] **Step 3: Implement the function**

In `backend/api/src/services/geofenceService.ts`, add near the top (after imports) the constant, and add the function next to `getGeofenceObjects`:

```ts
// Anti-spam window for manual geofences: one ping per visit, genuine later return re-fires (1 hour).
const GEOFENCE_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Called when a manual geofence fires. Checks the re-fire cooldown, updates trigger
 * state, and returns open linked objects. Returns null when in cooldown (suppress).
 */
export async function getGeofenceNotifyPayload(
  userId: string,
  geofenceId: string
): Promise<{ objects: AtomicObject[]; geofenceName: string } | null> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  const now = new Date();

  const state = await GeofenceModel.getTriggerState(userId, geofenceId);
  if (state?.cooldownUntil && state.cooldownUntil > now) {
    console.log(`[geofenceService] Geofence ${geofenceId} in cooldown until ${state.cooldownUntil.toISOString()}`);
    return null;
  }

  const cooldownUntil = new Date(now.getTime() + GEOFENCE_COOLDOWN_MS);
  await GeofenceModel.upsertTriggerState(userId, geofenceId, {
    lastEnteredAt: now,
    lastNotifiedAt: now,
    cooldownUntil,
    incrementVisit: true,
  });

  const objects = await getGeofenceObjects(userId, geofenceId, true);
  return { objects, geofenceName: geofence.name };
}
```

(`GeofenceModel`, `AtomicObjectModel`, and the `AtomicObject` type are already imported in this file.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/tui/offload/backend/api && npm test -- geofenceNotifyPayload
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/geofenceService.ts backend/api/src/__tests__/services/geofenceNotifyPayload.test.ts
git commit -m "feat(api): geofence notify payload with 1h re-fire cooldown"
```

### Task B4: Add the `POST /:id/notify` geofence route

**Files:**
- Modify: `backend/api/src/routes/geofences.ts`
- Test: `backend/api/src/__tests__/routes/geofenceNotifyRoute.test.ts`

**Interfaces:**
- Consumes: `getGeofenceNotifyPayload` (Task B3).
- Produces: `POST /api/v1/geofences/:id/notify` → `{ cooldown: boolean, objects: AtomicObject[], geofenceName: string | null }`. 401 if unauthenticated, 404 `Geofence not found`, 403 `Unauthorized`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/routes/geofenceNotifyRoute.test.ts`:

```ts
import request from 'supertest';
import express from 'express';
import geofencesRouter from '../../routes/geofences';
import * as geofenceService from '../../services/geofenceService';

jest.mock('../../auth/middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../../services/geofenceService');
const mockSvc = geofenceService as jest.Mocked<typeof geofenceService>;

function appWithUser(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = userId ? { id: userId } : undefined; next(); });
  app.use('/api/v1/geofences', geofencesRouter);
  return app;
}

describe('POST /api/v1/geofences/:id/notify', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns cooldown:false with objects when not cooling down', async () => {
    mockSvc.getGeofenceNotifyPayload.mockResolvedValue({
      objects: [{ id: 'o1' }] as any, geofenceName: 'The Gym',
    });
    const res = await request(appWithUser('u-1')).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cooldown: false, geofenceName: 'The Gym' });
    expect(res.body.objects).toHaveLength(1);
  });

  it('returns cooldown:true with empty objects when cooling down', async () => {
    mockSvc.getGeofenceNotifyPayload.mockResolvedValue(null);
    const res = await request(appWithUser('u-1')).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cooldown: true, objects: [], geofenceName: null });
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(appWithUser(null)).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(401);
  });

  it('maps "Geofence not found" to 404', async () => {
    mockSvc.getGeofenceNotifyPayload.mockRejectedValue(new Error('Geofence not found'));
    const res = await request(appWithUser('u-1')).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tui/offload/backend/api && npm test -- geofenceNotifyRoute
```

Expected: FAIL — route returns 404 (no handler) where 200 is expected, or `getGeofenceNotifyPayload` is undefined on the mock.

- [ ] **Step 3: Add the import**

In `backend/api/src/routes/geofences.ts`, add `getGeofenceNotifyPayload` to the destructured import from `'../services/geofenceService'`:

```ts
import {
  createGeofence,
  getGeofenceById,
  listGeofences,
  checkLocation,
  getGeofenceObjects,
  getGeofenceNotifyPayload,
  setGeofenceLinkedObjects,
  addGeofenceLinkedObject,
  removeGeofenceLinkedObject,
  updateGeofence,
  deleteGeofence,
} from '../services/geofenceService';
```

- [ ] **Step 4: Add the route handler before the bare `/:id` route**

Insert this handler immediately after the existing `GET /:id/objects` handler (so it is registered before `router.get('/:id', ...)`, preserving Express's specific-before-generic ordering):

```ts
/**
 * POST /api/v1/geofences/:id/notify
 * Called by the mobile geofence monitoring background task on manual-geofence entry.
 * Checks the re-fire cooldown and returns open linked objects (empty if cooling down).
 */
router.post('/:id/notify', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const payload = await getGeofenceNotifyPayload(req.user.id, req.params.id);

    if (!payload) {
      // In cooldown — mobile should suppress the notification
      res.json({ cooldown: true, objects: [], geofenceName: null });
      return;
    }

    res.json({ cooldown: false, objects: payload.objects, geofenceName: payload.geofenceName });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Geofence not found') {
        res.status(404).json({ error: 'NOT_FOUND', message: error.message });
        return;
      }
      if (error.message === 'Unauthorized') {
        res.status(403).json({ error: 'FORBIDDEN', message: error.message });
        return;
      }
    }
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get geofence notify payload',
    });
  }
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/tui/offload/backend/api && npm test -- geofenceNotifyRoute
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/routes/geofences.ts backend/api/src/__tests__/routes/geofenceNotifyRoute.test.ts
git commit -m "feat(api): POST /geofences/:id/notify cooldown endpoint"
```

### Task B5: Wire the mobile manual-geofence path to the notify endpoint

**Files:**
- Modify: `mobile/src/services/geofenceMonitoringService.ts`

**Interfaces:**
- Consumes: `POST /api/v1/geofences/:id/notify` (Task B4) returning `{ cooldown, objects, geofenceName }`.
- Produces: `showManualGeofenceNotification` that suppresses on `cooldown` and on zero open notes, mirroring `showPlaceNotification`.

Mobile-only (no test runner): edit → typecheck → commit.

- [ ] **Step 1: Add a `fetchGeofenceNotify` helper**

In `mobile/src/services/geofenceMonitoringService.ts`, add this method next to `fetchPlaceNotify` (mirrors it, hitting the geofence notify endpoint):

```ts
  private async fetchGeofenceNotify(geofenceId: string): Promise<any | null> {
    let token = await SecureStore.getItemAsync('accessToken');
    if (!token) {
      token = await refreshAuthToken();
      if (!token) {
        console.warn('[GeofenceMonitoring] No access token and refresh failed');
        return null;
      }
    }

    const doFetch = (t: string) =>
      fetch(`${API_BASE_URL}/api/v1/geofences/${geofenceId}/notify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

    let response = await doFetch(token);
    if (response.status === 401) {
      console.log('[GeofenceMonitoring] geofence notify 401 — refreshing token and retrying');
      const newToken = await refreshAuthToken();
      if (!newToken) return null;
      response = await doFetch(newToken);
    }

    if (!response.ok) {
      console.warn(`[GeofenceMonitoring] Geofence notify API failed (${response.status})`);
      return null;
    }
    return response.json();
  }
```

- [ ] **Step 2: Replace `showManualGeofenceNotification` and add a scheduler helper**

Replace the entire existing `showManualGeofenceNotification` method with the following two methods (the new one mirrors `showPlaceNotification`'s cooldown/empty/fallback structure):

```ts
  private async showManualGeofenceNotification(event: GeofenceEvent): Promise<void> {
    const geofenceId = event.region.identifier;
    const geofenceName = event.region.name;
    const title = event.type === 'enter'
      ? `📍 Arrived at ${geofenceName}`
      : `👋 Left ${geofenceName}`;

    try {
      const data = await this.fetchGeofenceNotify(geofenceId);

      // Backend unreachable / auth failed even after refresh. Never stay silent.
      if (data === null) {
        await this.scheduleManualGeofenceNotification(event, geofenceId, geofenceName, title, 'Tap to view your notes');
        return;
      }

      if (data.cooldown) {
        console.log(`[GeofenceMonitoring] Geofence ${geofenceId} in cooldown — suppressing notification`);
        return;
      }

      const objects: any[] = data.objects || [];
      const count = objects.length;

      if (count === 0) {
        console.log(`[GeofenceMonitoring] Geofence ${geofenceId} has no open notes — suppressing notification`);
        return;
      }

      const titles = objects
        .slice(0, 3)
        .map((o: any) => {
          const raw: string = o.title || o.content || '';
          return raw.length > 35 ? raw.slice(0, 33) + '…' : raw;
        })
        .filter(Boolean);

      const body = count <= 3 ? titles.join(', ') : `${titles.slice(0, 2).join(', ')} +${count - 2} more`;

      await this.scheduleManualGeofenceNotification(event, geofenceId, geofenceName, title, body);
    } catch (error) {
      console.warn('[GeofenceMonitoring] Error in showManualGeofenceNotification:', error);
      try {
        await this.scheduleManualGeofenceNotification(event, geofenceId, geofenceName, title, 'Tap to view your notes');
      } catch {
        /* nothing more we can do */
      }
    }
  }

  private async scheduleManualGeofenceNotification(
    event: GeofenceEvent,
    geofenceId: string,
    geofenceName: string,
    title: string,
    body: string
  ): Promise<void> {
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          geofenceId,
          geofenceName,
          eventType: event.type,
          screen: 'PlaceSummary',
        },
        sound: true,
      },
      trigger: null,
    });
    console.log(`[GeofenceMonitoring] Manual geofence notification scheduled: ${title} (id: ${notifId})`);
  }
```

- [ ] **Step 3: Remove the now-unused `getLinkedObjectsSummary` method**

The old `showManualGeofenceNotification` was the only caller of `getLinkedObjectsSummary` (which fetched `GET /geofences/:id/objects?openOnly=true`). Confirm it has no other references, then delete the whole `getLinkedObjectsSummary` method:

```bash
cd /Users/tui/offload && grep -rn "getLinkedObjectsSummary" mobile/src
```

Expected after deletion: no matches. (If any other reference exists, leave the method and note it.)

- [ ] **Step 4: Typecheck**

```bash
cd /Users/tui/offload/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/geofenceMonitoringService.ts
git commit -m "feat(mobile): honor geofence re-fire cooldown via notify endpoint"
```

- [ ] **Step 6: Manual device verification**

Enter a manual-geofence region twice within an hour → first entry pings, second is suppressed. Re-enter after the cooldown with open notes → pings again.

---

## Phase C — Completion-aware weekly recap

### Task C1: Add `findResolvedInPeriod` + supporting index

**Files:**
- Modify: `backend/api/src/models/AtomicObject.ts`
- Create: `backend/api/src/db/migrations/012_resolved_in_period_index.sql`
- Test: `backend/api/src/__tests__/models/findResolvedInPeriod.test.ts`

**Interfaces:**
- Produces: `AtomicObjectModel.findResolvedInPeriod(userId, from, to): Promise<AtomicObjectModel[]>` — objects with `state='resolved'` whose `state_updated_at` falls in `[from, to]`, not deleted, newest-resolved first.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/models/findResolvedInPeriod.test.ts`:

```ts
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('AtomicObjectModel.findResolvedInPeriod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filters resolved objects by state_updated_at window, newest first', async () => {
    mockQueries.queryMany.mockResolvedValue([] as any);
    const from = new Date('2026-06-22T00:00:00Z');
    const to = new Date('2026-06-29T00:00:00Z');

    await AtomicObjectModel.findResolvedInPeriod('u1', from, to);

    const sql = mockQueries.queryMany.mock.calls[0][0] as string;
    const params = mockQueries.queryMany.mock.calls[0][1] as any[];
    expect(sql).toMatch(/state\s*=\s*'resolved'/i);
    expect(sql).toMatch(/state_updated_at\s*>=\s*\$2/i);
    expect(sql).toMatch(/state_updated_at\s*<=\s*\$3/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/ORDER BY state_updated_at DESC/i);
    expect(params).toEqual(['u1', from, to]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tui/offload/backend/api && npm test -- findResolvedInPeriod
```

Expected: FAIL — `findResolvedInPeriod is not a function`.

- [ ] **Step 3: Implement the method**

In `backend/api/src/models/AtomicObject.ts`, add next to `findStaleActionables`:

```ts
  /**
   * Objects the user resolved within [from, to] — by resolution time (state_updated_at),
   * independent of when they were created. Powers the weekly recap "Accomplished" section.
   */
  static async findResolvedInPeriod(
    userId: string,
    from: Date,
    to: Date
  ): Promise<AtomicObjectModel[]> {
    const rows = await queryMany<AtomicObjectRow>(
      `SELECT * FROM hub.atomic_objects
       WHERE user_id = $1
         AND state = 'resolved'
         AND state_updated_at >= $2
         AND state_updated_at <= $3
         AND deleted_at IS NULL
       ORDER BY state_updated_at DESC`,
      [userId, from, to]
    );
    return rows.map((row) => new AtomicObjectModel(row));
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/tui/offload/backend/api && npm test -- findResolvedInPeriod
```

Expected: PASS.

- [ ] **Step 5: Write the supporting index migration**

Create `backend/api/src/db/migrations/012_resolved_in_period_index.sql`:

```sql
-- Migration 012: index for the weekly recap "Accomplished" query
-- (objects resolved within a time window, keyed on resolution timestamp).

CREATE INDEX IF NOT EXISTS idx_ao_resolved_in_period
  ON hub.atomic_objects (user_id, state_updated_at)
  WHERE deleted_at IS NULL AND state = 'resolved';
```

If a local DB is available, apply it (idempotent); otherwise the user applies it alongside `011` the same way `006`–`010` were applied:

```bash
psql "$DATABASE_URL" -f backend/api/src/db/migrations/012_resolved_in_period_index.sql
```

Expected: `CREATE INDEX` (or skip notice).

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/models/AtomicObject.ts backend/api/src/db/migrations/012_resolved_in_period_index.sql backend/api/src/__tests__/models/findResolvedInPeriod.test.ts
git commit -m "feat(api): findResolvedInPeriod query + supporting index"
```

### Task C2: Add the "Accomplished" data to the weekly synthesis

**Files:**
- Modify: `backend/api/src/services/synthesisService.ts`
- Test: `backend/api/src/__tests__/services/synthesisAccomplished.test.ts`

**Interfaces:**
- Consumes: `AtomicObjectModel.findResolvedInPeriod` (Task C1).
- Produces: `WeeklySynthesis` now carries `accomplished: string[]` and `accomplishedCount: number`, populated deterministically (NOT from the LLM). The corpus also marks resolved items with `[DONE]` so the LLM does not describe them as open threads.

**Design note (refinement over the spec):** the spec described an LLM "accomplished block." Building it from `findResolvedInPeriod` instead is strictly better — the LLM corpus is capped at 100 created-this-week notes and would miss items created earlier but resolved this week, and could drop entries. The DB query is exact. The LLM change is reduced to a single corpus marker so it does not mislabel resolved items.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/synthesisAccomplished.test.ts`:

```ts
import axios from 'axios';
import { generateWeeklySynthesis } from '../../services/synthesisService';
import { AtomicObjectModel } from '../../models/AtomicObject';
import { Session } from '../../models/Session';

jest.mock('axios');
jest.mock('../../models/AtomicObject');
jest.mock('../../models/Session');
jest.mock('../../db/connection', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;
const mockSession = Session as jest.Mocked<typeof Session>;

const ORIGINAL_ENV = process.env;

function resolvedModel(title: string) {
  return { toAtomicObject: () => ({ id: title, title, content: title, state: 'resolved' }) } as any;
}

describe('generateWeeklySynthesis — accomplished section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, ANTHROPIC_API_KEY: 'test-key' };

    mockSession.findSyntheses.mockResolvedValue([]);
    mockObj.findByUserId.mockResolvedValue({ objects: [], total: 0 } as any);
    mockObj.findResolvedInPeriod.mockResolvedValue([
      resolvedModel('Bought milk'),
      resolvedModel('Picked up package'),
    ]);

    mockedAxios.post.mockResolvedValue({
      data: { content: [{ text: JSON.stringify({
        narrative: 'You had a productive week.',
        patterns: [], open_threads: [], contradictions: [], actionable_insights: [], cited_refs: [],
      }) }] },
    });

    const fakeSession = { id: 's1', update: jest.fn().mockResolvedValue(undefined) };
    mockSession.create.mockResolvedValue(fakeSession as any);
  });

  afterEach(() => { process.env = ORIGINAL_ENV; });

  it('lists resolved-this-period notes as accomplished, independent of the corpus', async () => {
    const result = await generateWeeklySynthesis('u1', 7, true);
    expect(result.accomplished).toEqual(['Bought milk', 'Picked up package']);
    expect(result.accomplishedCount).toBe(2);
    expect(mockObj.findResolvedInPeriod).toHaveBeenCalledWith('u1', expect.any(Date), expect.any(Date));
  });

  it('populates accomplished even when no notes were created this week', async () => {
    const result = await generateWeeklySynthesis('u1', 7, true);
    expect(result.objectCount).toBe(0);
    expect(result.accomplishedCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tui/offload/backend/api && npm test -- synthesisAccomplished
```

Expected: FAIL — `result.accomplished` is `undefined`.

- [ ] **Step 3: Add the fields to the `WeeklySynthesis` interface**

In `backend/api/src/services/synthesisService.ts`, in the `WeeklySynthesis` interface, add after `domainBreakdown`:

```ts
  accomplished: string[];      // notes resolved during the period (deterministic, from DB)
  accomplishedCount: number;
```

- [ ] **Step 4: Mark resolved items in the corpus builder**

In `buildCorpus`, inside the `.map`, add a status marker and append it to the returned line:

```ts
    const action = obj.actionability?.isActionable && obj.actionability.nextAction
      ? ` [Next: ${obj.actionability.nextAction.slice(0, 80)}]`
      : '';
    const status = (obj.state === 'resolved' || obj.state === 'archived') ? ' [DONE]' : '';
    refsIndex.push({
      refNum,
      id: obj.id,
      title: obj.title || text.slice(0, 60),
      objectType: type,
      domain,
    });
    return `[${date}] ${type}/${domain} — ${titleStr}${text}${action}${status} [ref_${refNum}]`;
```

- [ ] **Step 5: Tell the LLM what `[DONE]` means**

In `SYNTHESIS_SYSTEM_PROMPT`, add a rule to the numbered RULES list (e.g. after rule 5):

```
6. Notes tagged [DONE] are already resolved — treat them as completed work, never as open threads.
```

(Renumber the subsequent rules if you want strict sequence; not required for correctness.)

- [ ] **Step 6: Compute `accomplished` in `generateWeeklySynthesis`**

After the corpus/prioritisation block and before assembling the `synthesis` object (i.e. after `const { corpus: corpusText, refsIndex } = buildCorpus(corpus);` and its `domainSummary`), add:

```ts
  // Deterministic "Accomplished" — what the user actually resolved during the period,
  // by resolution time (state_updated_at), independent of the created-this-week corpus.
  const resolvedModels = await AtomicObjectModel.findResolvedInPeriod(userId, periodStart, periodEnd);
  const accomplished = resolvedModels
    .map((m) => m.toAtomicObject())
    .map((o) => o.title || (o.cleanedText ?? o.content).slice(0, 80))
    .filter(Boolean);
```

Then add the two fields to the `synthesis` object literal (before the `...parsed` spread so they are not overwritten):

```ts
  const synthesis: WeeklySynthesis = {
    sessionId: '', // filled after save
    generatedAt: periodEnd.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    objectCount: corpus.length,
    domainBreakdown: breakdown,
    accomplished,
    accomplishedCount: accomplished.length,
    ...parsed,
  };
```

(`AtomicObjectModel` is already imported. The whole `synthesis` object is persisted into Session metadata downstream, so no persistence change is needed.)

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd /Users/tui/offload/backend/api && npm test -- synthesisAccomplished
```

Expected: PASS (2 tests).

- [ ] **Step 8: Run the full backend suite to confirm no regressions**

```bash
cd /Users/tui/offload/backend/api && npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/api/src/services/synthesisService.ts backend/api/src/__tests__/services/synthesisAccomplished.test.ts
git commit -m "feat(api): deterministic Accomplished list in weekly synthesis"
```

### Task C3: Render the "Accomplished" section in the mobile recap

**Files:**
- Modify: `mobile/src/services/api.ts`
- Modify: `mobile/src/screens/SynthesisScreen.tsx`

**Interfaces:**
- Consumes: `synthesis.accomplished: string[]` from the `POST /synthesis/weekly` response.
- Produces: an "Accomplished" `<Section>` rendered above Patterns when non-empty.

Mobile-only (no test runner): edit → typecheck → commit. Fields are optional to stay backward-compatible with same-day cached syntheses generated before this change.

- [ ] **Step 1: Add the optional fields to the mobile `WeeklySynthesis` interface**

In `mobile/src/services/api.ts`, in the `WeeklySynthesis` interface, add after `domainBreakdown`:

```ts
  accomplished?: string[];
  accomplishedCount?: number;
```

- [ ] **Step 2: Add the Accomplished section to the screen**

In `mobile/src/screens/SynthesisScreen.tsx`, immediately before the `{/* Patterns */}` block, add:

```tsx
            {/* Accomplished */}
            {synthesis.accomplished && synthesis.accomplished.length > 0 && (
              <Section title="Accomplished" icon="🏆">
                <BulletList items={synthesis.accomplished} color="#22c55e" />
              </Section>
            )}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/tui/offload/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/services/api.ts mobile/src/screens/SynthesisScreen.tsx
git commit -m "feat(mobile): show Accomplished section in weekly recap"
```

- [ ] **Step 5: Manual verification**

Resolve a couple of notes, then trigger the weekly recap with `?force=true` (the screen's refresh/regenerate path) → confirm an "Accomplished" section lists them. Note: same-day cached syntheses won't show it until regenerated with force — expected and handled by the optional-field guard.

---

## Final verification

- [ ] **Backend full suite green:**

```bash
cd /Users/tui/offload/backend/api && npm test
```

- [ ] **Mobile typecheck green:**

```bash
cd /Users/tui/offload/mobile && npx tsc --noEmit
```

- [ ] **Migrations applied** (`011`, `012`) to the target DB by the user, the same way `006`–`010` were applied.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Done + Delete, two actions, both place & geofence | A1 |
| Done = global resolve (`state='resolved'`) | A1 (`updateObjectState('resolved')`) |
| Delete = soft-delete, recoverable 30d | A1 (`deleteObject`) |
| Retire dismiss/snooze/unlink/done-here from UI | A1 |
| Manual geofence ~1h cooldown + trigger state | B1–B5 |
| Cooldown re-fires later if notes still open | B3 (returns objects after window) + B5 |
| Recap "Accomplished" section, count + items | C1–C3 |
| Counts notes resolved this week even if created earlier | C1 (`state_updated_at` window) |
| Resolved items not mislabeled as open threads | C2 (`[DONE]` corpus marker + prompt rule) |
| Snooze dropped (flag for review) | A1 (removed); noted in spec Open Questions |

## Notes / deviations

- **Accomplished is deterministic, not LLM-generated** (Task C2 design note) — an intentional improvement over the spec's "prompt block" wording; same user-facing result, more reliable.
- **Snooze removed** per the approved two-action model. The `snoozePlaceObject`/`dismissPlaceObject`/`unlinkPlaceObject`/`markPlaceObjectDone` API methods and their backend endpoints remain (now unused by this screen) — removing them is out of scope for this round.
- **Two migration systems** exist; this plan uses the raw-SQL system where all place/geofence schema already lives. The user applies `.sql` migrations out-of-band.
