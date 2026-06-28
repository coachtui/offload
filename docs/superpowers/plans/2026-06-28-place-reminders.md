# Place Reminders: Auto-Linking & Browse-by-Place — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice notes auto-link to the user's labeled geofences by name, notes become browsable by place, and arrival reminders re-fire every visit with the current open notes.

**Architecture:** Bridge the two existing link tables (`geofence_objects` for manual geofences, `object_place_links` for inferred places) rather than unifying them. Add a name-match step to the place-resolution pipeline; add a merged "places overview" read; generalize the existing per-place screen; retune the notify cooldown. No DB migration.

**Tech Stack:** Node/TypeScript + Express + Postgres (`node-pg-migrate`), Jest (ts-jest) on the backend; Expo/React Native + `@react-navigation/native-stack` on mobile.

## Global Constraints

- **Matching:** exact, case-insensitive label match only. No fuzzy/alias matching.
- **Open note** = `atomic_objects.state IN ('open','active')`. **Closed** = `'resolved'`/`'archived'`.
- **Ordering:** within a place, notes sorted newest-first (`ao.created_at DESC`).
- **No DB migration.** Reuse `geofence_objects`, `object_place_links`, `place_trigger_state`.
- **Backend tests are TDD** (Jest, `cd backend/api && npx jest <path>`). Mobile has no test harness — verify on device.
- **Jest env:** `src/test-setup.ts` already sets `JWT_SECRET`; models that hit Postgres are mocked in tests.
- **Commit** after each task with the message shown in its final step.

---

## File Structure

**Backend (modify):**
- `backend/api/src/models/Geofence.ts` — add `findByUserAndName`, add `getOpenLinkedObjectIds`.
- `backend/api/src/models/Place.ts` — add open-state filter + newest-first to `getLinkedObjectIds`.
- `backend/api/src/services/placeService.ts` — geofence-name match before geocoding; dedupe guard; cooldown constant.
- `backend/api/src/services/geofenceService.ts` — `getGeofenceObjects` uses open/newest method; add `getPlacesOverview`.
- `backend/api/src/routes/places.ts` — add `GET /overview`.

**Backend (create):**
- `backend/api/src/__tests__/models/geofenceFindByName.test.ts`
- `backend/api/src/__tests__/services/placeMatching.test.ts`
- `backend/api/src/__tests__/services/placesOverview.test.ts`

**Mobile (modify):**
- `mobile/src/services/api.ts` — add `getPlacesOverview`; PlaceSummary already has the object getters.
- `mobile/src/navigation/types.ts` — add `Places` route; widen `PlaceSummary` params.
- `mobile/src/navigation/AppNavigator.tsx` — register `Places`.
- `mobile/src/screens/HomeScreen.tsx` — add a "Places" nav item.
- `mobile/src/screens/PlaceSummaryScreen.tsx` — load from a geofence OR a place.

**Mobile (create):**
- `mobile/src/screens/PlacesScreen.tsx`

---

## Task 1: `GeofenceModel.findByUserAndName` (exact, case-insensitive)

**Files:**
- Modify: `backend/api/src/models/Geofence.ts` (add static method after `findByUserId`, ~line 104)
- Test: `backend/api/src/__tests__/models/geofenceFindByName.test.ts`

**Interfaces:**
- Produces: `GeofenceModel.findByUserAndName(userId: string, name: string): Promise<GeofenceModel[]>` — returns geofences whose `name` equals `name` case-insensitively (exact, not substring).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/models/geofenceFindByName.test.ts
import { GeofenceModel } from '../../models/Geofence';
import * as db from '../../db';

jest.mock('../../db');
const mockDb = db as jest.Mocked<typeof db>;

function row(name: string) {
  return {
    id: 'g1', user_id: 'u1', name, center_latitude: 21.3, center_longitude: -157.8,
    radius: 100, type: 'home', associated_objects: [], notification_enabled: true,
    notification_on_enter: true, notification_on_exit: false,
    notification_quiet_hours_start: null, notification_quiet_hours_end: null,
    place_id: null, created_by: 'manual', created_at: new Date(), updated_at: new Date(),
  };
}

describe('GeofenceModel.findByUserAndName', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries with an exact case-insensitive name match and returns models', async () => {
    mockDb.queryMany.mockResolvedValue([row('Home')] as any);
    const result = await GeofenceModel.findByUserAndName('u1', 'home');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Home');
    const sql = mockDb.queryMany.mock.calls[0][0] as string;
    expect(sql).toMatch(/lower\(name\)\s*=\s*lower\(\$2\)/i);
    expect(mockDb.queryMany.mock.calls[0][1]).toEqual(['u1', 'home']);
  });

  it('returns empty array when nothing matches', async () => {
    mockDb.queryMany.mockResolvedValue([] as any);
    const result = await GeofenceModel.findByUserAndName('u1', 'nowhere');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest src/__tests__/models/geofenceFindByName.test.ts`
Expected: FAIL — `findByUserAndName` is not a function / not exported.

- [ ] **Step 3: Write minimal implementation**

Add after `findByUserId` (after line ~104) in `backend/api/src/models/Geofence.ts`:

```typescript
  /**
   * Find geofences by user with an EXACT case-insensitive name match.
   * Used to link a spoken place name to a manually-labeled geofence.
   */
  static async findByUserAndName(userId: string, name: string): Promise<GeofenceModel[]> {
    const rows = await queryMany<GeofenceRow>(
      `SELECT * FROM hub.geofences
       WHERE user_id = $1 AND lower(name) = lower($2)
       ORDER BY created_at DESC`,
      [userId, name]
    );
    return rows.map((row) => new GeofenceModel(row));
  }
```

(Confirm `queryMany` is already imported at the top of the file — it is, used by `findByUserId`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/api && npx jest src/__tests__/models/geofenceFindByName.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/models/Geofence.ts backend/api/src/__tests__/models/geofenceFindByName.test.ts
git commit -m "feat(geofence): exact case-insensitive findByUserAndName"
```

---

## Task 2: Match labeled geofence before geocoding + dedupe guard

**Files:**
- Modify: `backend/api/src/services/placeService.ts` (`resolveAndLinkPlace` ~line 84; `maybeCreateInferredGeofence` ~line 170)
- Test: `backend/api/src/__tests__/services/placeMatching.test.ts`

**Interfaces:**
- Consumes: `GeofenceModel.findByUserAndName` (Task 1), `GeofenceModel.addLinkedObject(geofenceId, objectId)` (exists), `PlaceModel.findByUserAndName`, `resolvePlaceNameMulti`.
- Behavior added: in `resolveAndLinkPlace`, after the existing-place check, check labeled geofences; on match, link via `geofence_objects` and return (no geocoding). In `maybeCreateInferredGeofence`, skip creation if a manual geofence with the same name exists.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/services/placeMatching.test.ts
import { resolveObjectPlaces } from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';
import * as resolution from '../../services/placeResolutionService';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');
jest.mock('../../services/placeResolutionService');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockRes = resolution as jest.Mocked<typeof resolution>;

describe('resolveObjectPlaces — labeled geofence matching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findByUserAndName.mockResolvedValue([]); // no existing inferred place
  });

  it('links to a labeled geofence by name and skips geocoding', async () => {
    mockGeo.findByUserAndName.mockResolvedValue([{ id: 'g-home', name: 'Home' } as any]);

    await resolveObjectPlaces('u1', 'obj1', ['home']);

    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('g-home', 'obj1');
    expect(mockRes.resolvePlaceNameMulti).not.toHaveBeenCalled(); // no Nominatim
    expect(mockPlace.create).not.toHaveBeenCalled();
  });

  it('falls back to geocoding when no labeled geofence matches', async () => {
    mockGeo.findByUserAndName.mockResolvedValue([]);
    mockRes.resolvePlaceNameMulti.mockResolvedValue([]); // unresolvable, but path was taken

    await resolveObjectPlaces('u1', 'obj1', ['some ramen shop']);

    expect(mockGeo.addLinkedObject).not.toHaveBeenCalled();
    expect(mockRes.resolvePlaceNameMulti).toHaveBeenCalledWith('some ramen shop', undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest src/__tests__/services/placeMatching.test.ts`
Expected: FAIL — `addLinkedObject` not called / `resolvePlaceNameMulti` still called (matching not implemented).

- [ ] **Step 3: Add the geofence-match step**

In `backend/api/src/services/placeService.ts`, inside `resolveAndLinkPlace`, insert this block immediately AFTER the existing place-name match block (after the `if (nameMatches.length > 0) { ... return; }` at ~line 93) and BEFORE the "2. Geocode via OSM Nominatim" comment:

```typescript
  // ─── 1b. Match a manually-labeled geofence by exact name ───────────────────
  const geofenceMatches = await GeofenceModel.findByUserAndName(userId, normalizedQuery);
  if (geofenceMatches.length > 0) {
    const geofence = geofenceMatches[0];
    console.log(`[placeService] Matched labeled geofence "${geofence.name}" (${geofence.id}) — linking object ${objectId}`);
    logLifecycle('PLACE_DEDUPED', { objectId, placeId: geofence.id, name: geofence.name, reason: 'manual_geofence_name_match' });
    await GeofenceModel.addLinkedObject(geofence.id, objectId);
    return; // labeled place is authoritative — do not geocode or create an inferred place
  }
```

(`GeofenceModel` is already imported at the top of placeService.ts — confirm line 9.)

- [ ] **Step 4: Add the dedupe guard in `maybeCreateInferredGeofence`**

In `maybeCreateInferredGeofence`, insert at the very top of the function body (before the `currentCount` check at ~line 174):

```typescript
  // Never shadow a user's labeled place with an inferred duplicate.
  const manualMatch = await GeofenceModel.findByUserAndName(userId, place.normalizedName);
  if (manualMatch.length > 0) {
    console.log(`[placeService] Manual geofence "${place.normalizedName}" exists — skipping inferred duplicate`);
    return;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend/api && npx jest src/__tests__/services/placeMatching.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `cd backend/api && npx jest`
Expected: same pass count as before + the new tests; only the pre-existing `voiceSessionService.test.ts` compile failure remains.

- [ ] **Step 7: Commit**

```bash
git add backend/api/src/services/placeService.ts backend/api/src/__tests__/services/placeMatching.test.ts
git commit -m "feat(places): link voice notes to labeled geofences by name; guard inferred duplicates"
```

---

## Task 3: Open-notes-only + newest-first for per-place objects

**Files:**
- Modify: `backend/api/src/models/Place.ts` (`getLinkedObjectIds` ~line 241)
- Modify: `backend/api/src/models/Geofence.ts` (add `getOpenLinkedObjectIds`)
- Modify: `backend/api/src/services/geofenceService.ts` (`getGeofenceObjects` uses the new method)
- Test: extend `backend/api/src/__tests__/models/geofenceFindByName.test.ts` → rename intent covered by a new test file `backend/api/src/__tests__/models/openLinkedObjects.test.ts`

**Interfaces:**
- Produces: `GeofenceModel.getOpenLinkedObjectIds(geofenceId: string): Promise<string[]>` — IDs of linked objects whose state is open/active, newest-first.
- Changes: `PlaceModel.getLinkedObjectIds` now also filters `ao.state IN ('open','active')` and orders `ao.created_at DESC`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/models/openLinkedObjects.test.ts
import { GeofenceModel } from '../../models/Geofence';
import * as db from '../../db';

jest.mock('../../db');
const mockDb = db as jest.Mocked<typeof db>;

describe('GeofenceModel.getOpenLinkedObjectIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('selects only open/active notes, newest first', async () => {
    mockDb.queryMany.mockResolvedValue([{ object_id: 'o2' }, { object_id: 'o1' }] as any);
    const ids = await GeofenceModel.getOpenLinkedObjectIds('g1');
    expect(ids).toEqual(['o2', 'o1']);
    const sql = mockDb.queryMany.mock.calls[0][0] as string;
    expect(sql).toMatch(/state\s+IN\s*\(\s*'open'\s*,\s*'active'\s*\)/i);
    expect(sql).toMatch(/ao\.created_at\s+DESC/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest src/__tests__/models/openLinkedObjects.test.ts`
Expected: FAIL — `getOpenLinkedObjectIds` is not a function.

- [ ] **Step 3: Add `getOpenLinkedObjectIds` to `Geofence.ts`**

Insert after `getLinkedObjectIds` (~line 313) in `backend/api/src/models/Geofence.ts`:

```typescript
  /**
   * IDs of linked objects that are still OPEN (state open/active, not deleted),
   * newest-first. Used for arrival notifications and the browse-by-place view.
   */
  static async getOpenLinkedObjectIds(geofenceId: string): Promise<string[]> {
    const rows = await queryMany<{ object_id: string }>(
      `SELECT go.object_id
       FROM hub.geofence_objects go
       JOIN hub.atomic_objects ao ON ao.id = go.object_id
       WHERE go.geofence_id = $1
         AND ao.deleted_at IS NULL
         AND ao.state IN ('open','active')
       ORDER BY ao.created_at DESC`,
      [geofenceId]
    );
    return rows.map((r) => r.object_id);
  }
```

- [ ] **Step 4: Point `getGeofenceObjects` at the new method**

In `backend/api/src/services/geofenceService.ts`, change the line in `getGeofenceObjects`:

```typescript
  const linkedIds = await GeofenceModel.getLinkedObjectIds(geofenceId);
```
to:
```typescript
  const linkedIds = await GeofenceModel.getOpenLinkedObjectIds(geofenceId);
```

- [ ] **Step 5: Add open filter + newest-first to `Place.getLinkedObjectIds`**

In `backend/api/src/models/Place.ts`, replace the SQL in `getLinkedObjectIds` (~line 245) with:

```typescript
    const rows = await queryMany<{ object_id: string }>(
      `SELECT opl.object_id
       FROM hub.object_place_links opl
       JOIN hub.atomic_objects ao ON ao.id = opl.object_id
       WHERE opl.place_id = $1
         AND opl.active = true
         AND ao.deleted_at IS NULL
         AND ao.state IN ('open','active')
         AND (opl.snoozed_until IS NULL OR opl.snoozed_until < NOW())
         AND ($2::timestamptz IS NULL OR opl.dismissed_at IS NULL OR opl.dismissed_at < $2)
       ORDER BY ao.created_at DESC`,
      [placeId, sinceEnteredAt ?? null]
    );
```

- [ ] **Step 6: Run the test + full suite**

Run: `cd backend/api && npx jest src/__tests__/models/openLinkedObjects.test.ts`
Expected: PASS.
Run: `cd backend/api && npx jest`
Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/api/src/models/Geofence.ts backend/api/src/models/Place.ts backend/api/src/services/geofenceService.ts backend/api/src/__tests__/models/openLinkedObjects.test.ts
git commit -m "feat(places): per-place objects are open-only, newest-first"
```

---

## Task 4: Places overview service + endpoint

**Files:**
- Modify: `backend/api/src/services/geofenceService.ts` (add `getPlacesOverview`)
- Modify: `backend/api/src/routes/places.ts` (add `GET /overview`)
- Test: `backend/api/src/__tests__/services/placesOverview.test.ts`

**Interfaces:**
- Produces: `getPlacesOverview(userId: string): Promise<PlaceOverviewItem[]>` where
  `PlaceOverviewItem = { kind: 'geofence' | 'place'; id: string; name: string; openCount: number; labeled: boolean }`.
  Returns all of the user's `created_by='manual'` geofences (always, even at openCount 0), labeled first, then inferred places with `openCount >= 1`. Sorted: labeled before unlabeled, then by openCount desc.
- Endpoint: `GET /api/v1/places/overview` → `{ places: PlaceOverviewItem[] }`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/services/placesOverview.test.ts
import { getPlacesOverview } from '../../services/geofenceService';
import * as db from '../../db';

jest.mock('../../db');
const mockDb = db as jest.Mocked<typeof db>;

describe('getPlacesOverview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns labeled geofences (always) and inferred places with open notes', async () => {
    // First query: labeled geofences with open counts
    mockDb.queryMany
      .mockResolvedValueOnce([
        { id: 'g-home', name: 'Home', open_count: '2' },
        { id: 'g-gym', name: 'Gym', open_count: '0' },
      ] as any)
      // Second query: inferred places with open_count >= 1
      .mockResolvedValueOnce([
        { id: 'p-ramen', name: 'Ramen Shop', open_count: '1' },
      ] as any);

    const result = await getPlacesOverview('u1');

    expect(result).toEqual([
      { kind: 'geofence', id: 'g-home', name: 'Home', openCount: 2, labeled: true },
      { kind: 'geofence', id: 'g-gym', name: 'Gym', openCount: 0, labeled: true },
      { kind: 'place', id: 'p-ramen', name: 'Ramen Shop', openCount: 1, labeled: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx jest src/__tests__/services/placesOverview.test.ts`
Expected: FAIL — `getPlacesOverview` not exported.

- [ ] **Step 3: Implement `getPlacesOverview`**

Add to `backend/api/src/services/geofenceService.ts` (top imports already include `queryMany` via the db module; if not, add `import { queryMany } from '../db';`). Append:

```typescript
export interface PlaceOverviewItem {
  kind: 'geofence' | 'place';
  id: string;
  name: string;
  openCount: number;
  labeled: boolean;
}

/**
 * Merged browse list: every manually-labeled geofence (always shown) plus every
 * inferred place that still has >=1 open note. Labeled first, then by open count.
 */
export async function getPlacesOverview(userId: string): Promise<PlaceOverviewItem[]> {
  const geofences = await queryMany<{ id: string; name: string; open_count: string }>(
    `SELECT g.id, g.name,
            COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL) AS open_count
     FROM hub.geofences g
     LEFT JOIN hub.geofence_objects go ON go.geofence_id = g.id
     LEFT JOIN hub.atomic_objects ao ON ao.id = go.object_id
     WHERE g.user_id = $1 AND g.created_by = 'manual'
     GROUP BY g.id, g.name
     ORDER BY g.created_at DESC`,
    [userId]
  );

  const places = await queryMany<{ id: string; name: string; open_count: string }>(
    `SELECT p.id, p.normalized_name AS name,
            COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL AND opl.active = true) AS open_count
     FROM hub.places p
     JOIN hub.object_place_links opl ON opl.place_id = p.id
     JOIN hub.atomic_objects ao ON ao.id = opl.object_id
     WHERE p.user_id = $1
     GROUP BY p.id, p.normalized_name
     HAVING COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL AND opl.active = true) >= 1
     ORDER BY open_count DESC`,
    [userId]
  );

  return [
    ...geofences.map((g) => ({
      kind: 'geofence' as const, id: g.id, name: g.name,
      openCount: parseInt(g.open_count, 10), labeled: true,
    })),
    ...places.map((p) => ({
      kind: 'place' as const, id: p.id, name: p.name,
      openCount: parseInt(p.open_count, 10), labeled: false,
    })),
  ];
}
```

- [ ] **Step 4: Run the test**

Run: `cd backend/api && npx jest src/__tests__/services/placesOverview.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route**

In `backend/api/src/routes/places.ts`, add (near the other GET routes, before `export default`):

```typescript
router.get('/overview', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { getPlacesOverview } = await import('../services/geofenceService');
    const places = await getPlacesOverview(userId);
    res.json({ places });
  } catch (error: any) {
    res.status(error.status ?? 500).json({ error: error.message || 'Failed to load places overview' });
  }
});
```

NOTE: `/overview` must be registered BEFORE any `/:id` route in this file so Express doesn't treat "overview" as an `:id`. Verify ordering — move it above `/:id/objects` and `/:id/notify` if present.

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/services/geofenceService.ts backend/api/src/routes/places.ts backend/api/src/__tests__/services/placesOverview.test.ts
git commit -m "feat(places): merged places-overview service + GET /api/v1/places/overview"
```

---

## Task 5: Retune the notify cooldown (every-visit reminders)

**Files:**
- Modify: `backend/api/src/services/placeService.ts` (`COOLDOWN_MS` ~line 28)

**Interfaces:** none changed; behavior only.

**Rationale:** The 2-hour cooldown made inferred-place reminders feel one-time across a day's errands. Shorten to a 1-hour anti-spam window so one visit = one ping but a genuine later return re-fires. (Manual geofences have no backend cooldown; their re-fire is driven by the OS exit/re-enter and now show open-only notes via Task 3.)

- [ ] **Step 1: Change the constant**

In `backend/api/src/services/placeService.ts`, replace:

```typescript
// Cooldown duration in milliseconds (2 hours)
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
```
with:
```typescript
// Anti-spam window: one ping per visit, but a genuine later return re-fires (1 hour)
const COOLDOWN_MS = 60 * 60 * 1000;
```

- [ ] **Step 2: Run the full suite (sanity)**

Run: `cd backend/api && npx jest`
Expected: no new failures.

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/services/placeService.ts
git commit -m "fix(places): shorten notify cooldown to 1h so reminders re-fire each visit"
```

---

## Task 6: Mobile API client — `getPlacesOverview`

**Files:**
- Modify: `mobile/src/services/api.ts` (near `getPlaces`, ~line 630)

**Interfaces:**
- Produces: `apiService.getPlacesOverview(): Promise<{ places: PlaceOverviewItem[] }>` with
  `PlaceOverviewItem = { kind: 'geofence' | 'place'; id: string; name: string; openCount: number; labeled: boolean }`.

- [ ] **Step 1: Add the type + method**

In `mobile/src/services/api.ts`, add the interface near the top type declarations (or just above the `ApiService` class) and the method next to `getPlaces`:

```typescript
export interface PlaceOverviewItem {
  kind: 'geofence' | 'place';
  id: string;
  name: string;
  openCount: number;
  labeled: boolean;
}
```

```typescript
  async getPlacesOverview(): Promise<{ places: PlaceOverviewItem[] }> {
    return this.request<{ places: PlaceOverviewItem[] }>('/api/v1/places/overview');
  }
```

- [ ] **Step 2: Type-check the changed file**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep "services/api.ts" | grep -v "headers\['Authorization'\]"`
Expected: no output (no new errors; the pre-existing `Authorization` index error is ignored).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/services/api.ts
git commit -m "feat(mobile): api client getPlacesOverview"
```

---

## Task 7: Generalize `PlaceSummaryScreen` to open from a geofence

**Files:**
- Modify: `mobile/src/navigation/types.ts` (`PlaceSummary` params)
- Modify: `mobile/src/screens/PlaceSummaryScreen.tsx` (load by place OR geofence)

**Interfaces:**
- `PlaceSummary` route params become:
  `{ placeId?: string; geofenceId?: string; placeName: string; eventType?: 'enter' | 'exit' }`.
  Exactly one of `placeId`/`geofenceId` is provided. Existing notification callers pass `placeId` — still valid.

- [ ] **Step 1: Widen the route param type**

In `mobile/src/navigation/types.ts`, replace the `PlaceSummary` line with:

```typescript
  PlaceSummary: { placeId?: string; geofenceId?: string; placeName: string; eventType?: 'enter' | 'exit' };
```

- [ ] **Step 2: Load from whichever id is present**

In `mobile/src/screens/PlaceSummaryScreen.tsx`, in `loadObjects` replace the fetch line:

```typescript
      const { objects: loaded } = await apiService.getPlaceObjects(placeId);
```
with:
```typescript
      const { objects: loaded } = geofenceId
        ? await apiService.getGeofenceObjects(geofenceId)
        : await apiService.getPlaceObjects(placeId!);
```

And update the route destructuring near the top of the component:

```typescript
  const { placeId, geofenceId, placeName, eventType } = route.params;
```

NOTE for the implementer: the existing per-note actions (Done/Dismiss/Snooze/Unlink) call `placeId`-based endpoints. When opened from a geofence (`geofenceId` set, no `placeId`), those place actions don't apply. For this task, guard them: if `geofenceId` is set, the only note action shown is **Done** (mark the note resolved) via the existing object-state endpoint `apiService.updateObject(id, { state: 'resolved' })` — reuse the pattern already in `ObjectsScreen.tsx` for changing state. Hide Dismiss/Snooze/Unlink when `geofenceId` is set. (Verify `updateObject` signature in `api.ts` before wiring.)

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep "PlaceSummaryScreen.tsx"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/navigation/types.ts mobile/src/screens/PlaceSummaryScreen.tsx
git commit -m "feat(mobile): PlaceSummary opens from a geofence or an inferred place"
```

---

## Task 8: `PlacesScreen` + navigation + Home entry

**Files:**
- Create: `mobile/src/screens/PlacesScreen.tsx`
- Modify: `mobile/src/navigation/types.ts` (add `Places: undefined;`)
- Modify: `mobile/src/navigation/AppNavigator.tsx` (register `Places`)
- Modify: `mobile/src/screens/HomeScreen.tsx` (add nav item)

**Interfaces:**
- Consumes: `apiService.getPlacesOverview` (Task 6); navigates to `PlaceSummary` with `{ geofenceId | placeId, placeName }` (Task 7).

- [ ] **Step 1: Add the route to types**

In `mobile/src/navigation/types.ts`, add inside `RootStackParamList`:

```typescript
  Places: undefined;
```

- [ ] **Step 2: Create the screen**

Create `mobile/src/screens/PlacesScreen.tsx`. Mirror the styling/header pattern of `GeofencesScreen.tsx` (same colors, card layout, SafeAreaView). Core logic:

```tsx
import React, { useCallback, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiService, PlaceOverviewItem } from '../services/api';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Places'>;

export default function PlacesScreen({ navigation }: { navigation: Nav }) {
  const [items, setItems] = useState<PlaceOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { places } = await apiService.getPlacesOverview();
      setItems(places);
    } catch (e) {
      console.warn('[PlacesScreen] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = [
    { title: 'Your places', data: items.filter((i) => i.labeled) },
    { title: 'Detected places', data: items.filter((i) => !i.labeled) },
  ].filter((s) => s.data.length > 0);

  const openPlace = (item: PlaceOverviewItem) => {
    navigation.navigate('PlaceSummary',
      item.kind === 'geofence'
        ? { geofenceId: item.id, placeName: item.name }
        : { placeId: item.id, placeName: item.name });
  };

  if (loading && items.length === 0) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ marginTop: 40 }} color="#3b82f6" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#3b82f6" />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openPlace(item)} activeOpacity={0.7}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>{item.openCount} {item.openCount === 1 ? 'note' : 'notes'}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No places yet. Create one under “Place reminders.”</Text>}
        contentContainerStyle={{ padding: 16 }}
      />
      <TouchableOpacity style={styles.manage} onPress={() => navigation.navigate('Reminders')}>
        <Text style={styles.manageText}>Manage / add a place</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  sectionHeader: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  count: { color: '#64748b', fontSize: 13 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
  manage: { padding: 16, alignItems: 'center' },
  manageText: { color: '#3b82f6', fontSize: 15, fontWeight: '600' },
});
```

(Adjust palette to match `GeofencesScreen.tsx` if it differs from the dark theme above.)

- [ ] **Step 3: Register the screen**

In `mobile/src/navigation/AppNavigator.tsx`, add the import with the other screen imports and a `Stack.Screen` next to the others:

```tsx
import PlacesScreen from '../screens/PlacesScreen';
```
```tsx
      <Stack.Screen name="Places" component={PlacesScreen} />
```

- [ ] **Step 4: Add the Home nav item**

In `mobile/src/screens/HomeScreen.tsx`, add to `NAV_ITEMS` (e.g. just before "Notes"):

```tsx
  {
    icon: 'location-outline' as const,
    label: 'Places',
    description: 'Your notes grouped by location',
    route: 'Places' as const,
    iconColor: '#7C3AED',
    iconBg: '#F3E8FF',
  },
```

- [ ] **Step 5: Type-check the app**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "PlacesScreen.tsx|AppNavigator.tsx|HomeScreen.tsx|navigation/types.ts"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/PlacesScreen.tsx mobile/src/navigation/types.ts mobile/src/navigation/AppNavigator.tsx mobile/src/screens/HomeScreen.tsx
git commit -m "feat(mobile): Places browse screen (labeled + detected), Home entry"
```

---

## Task 9: Suppress notifications when there are zero open notes

**Files:**
- Modify: `mobile/src/services/geofenceMonitoringService.ts` (`showPlaceNotification` ~line 383; `showManualGeofenceNotification` ~line 451)

**Interfaces:** none changed; behavior only.

**Rule:** when a place/geofence has **confirmed zero open notes**, fire no notification. Distinguish from the *backend-unreachable* fallback (Task from prior commit) — that still fires a generic ping because the count is unknown.

- [ ] **Step 1: Suppress the inferred-place path on confirmed-empty**

In `showPlaceNotification`, the `data` payload is non-null only when the backend answered. After the `data === null` fallback block and the `data.cooldown` block, the code computes `objects` and `count`. Add immediately after `const count = objects.length;`:

```typescript
      if (count === 0) {
        console.log(`[GeofenceMonitoring] Place ${placeId} has no open notes — suppressing notification`);
        return;
      }
```

(Remove the now-dead `if (count === 0) { body = 'Tap to view your notes'; }` branch from the body-building block, leaving the `count === 1` and `else` cases.)

- [ ] **Step 2: Suppress the manual-geofence path on confirmed-empty**

In `showManualGeofenceNotification`, after it computes `count` from `getLinkedObjectsSummary`, add:

```typescript
    if (count === 0) {
      console.log(`[GeofenceMonitoring] Geofence ${event.region.identifier} has no open notes — suppressing notification`);
      return;
    }
```

(`getLinkedObjectsSummary` now reflects open-only notes because Task 3 changed `getGeofenceObjects` to `getOpenLinkedObjectIds`.)

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep "geofenceMonitoringService.ts"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/services/geofenceMonitoringService.ts
git commit -m "feat(mobile): no arrival notification when a place has no open notes"
```

---

## Task 10: Device verification

**Files:** none (manual QA on a real device, per project convention).

- [ ] **Step 1:** Deploy backend (Railway) and publish mobile OTA (`eas update`, `EXPO_PUBLIC_API_URL` set in shell, `--clear-cache`).
- [ ] **Step 2:** Create a labeled geofence "Home" at your location.
- [ ] **Step 3:** Record a voice note: "remind me to grab the drill when I'm home." Confirm (backend logs) it matched the labeled geofence (`manual_geofence_name_match`) and did NOT geocode.
- [ ] **Step 4:** Open Home → Places. Confirm "Home" appears under "Your places" with a count of 1.
- [ ] **Step 5:** Tap "Home" → confirm the drill note shows, newest-first, with its date.
- [ ] **Step 6:** Mark it done → re-open Places → confirm "Home" shows 0 and the note is gone from the per-place view.
- [ ] **Step 7:** Leave and re-enter the area → confirm a fresh arrival notification fires only when there's an open note, and not again within ~1 hour.

---

## Self-Review Notes

- **Spec coverage:** Section 1 → Tasks 1,2. Section 2 → Tasks 4,6,7,8. Section 3 → Tasks 3,5,9 (+ device check in 10). Ordering/open-only → Task 3. No-open→no-notify → Task 9 (suppresses both notification paths on confirmed-empty).
- **Open item for implementer:** confirm `apiService.updateObject` signature before wiring the geofence-path "Done" action in Task 7; confirm `/overview` is registered before `/:id` routes in Task 4.
- **Risk:** OS geofence re-entry requires a real exit; not controllable in code (documented in spec).
