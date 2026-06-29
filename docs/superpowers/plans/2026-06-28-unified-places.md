# Unified Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the "Places" and "Place reminders" home-screen features into one "Places" hub where each place is a single card with a reminder bell toggle.

**Architecture:** Pragmatic thin-glue over the existing `hub.places` and `hub.geofences` tables. The existing `/api/v1/places/overview` merged list already returns both as `PlaceOverviewItem`s keyed by `kind`. We add `enabled` to that payload, add one backend helper + route (`promotePlaceToGeofence` / `POST /places/:id/promote`) that creates a manual geofence at a detected place's location AND migrates its note links, then rebuild `PlacesScreen` as sectioned cards with a bell toggle and remove the second home card.

**Tech Stack:** Node/Express + Postgres (`pg`) backend with Jest (mocked models); React Native / Expo mobile (TypeScript, no unit-test runner — verification is `tsc --noEmit`).

## Global Constraints

- Backend tests: Jest with **mocked models** (`jest.mock('../../models/...')`) — never hit a real DB. Run with `npm test` in `backend/api`.
- Mobile has no Jest runner; verify mobile changes with `npx tsc --noEmit` from `mobile/`.
- Geofence smart defaults for a promoted/added place: `radius: 200`, `notifyOnEnter: true`, `notifyOnExit: false`, no quiet hours, `type: 'custom'`, `createdBy: 'manual'`, name = place name.
- Bell OFF on a saved place = `enabled: false` (disable), **never delete**.
- Mobile API methods use loose `any` payloads (existing convention in `services/api.ts`) — match it; do not over-type.
- Commit after every task.

---

### Task 1: Add `enabled` to the places overview payload

**Files:**
- Modify: `backend/api/src/services/geofenceService.ts` (the `PlaceOverviewItem` interface ~line 257 and `getPlacesOverview` ~line 270)
- Test: `backend/api/src/__tests__/services/placesOverviewEnabled.test.ts` (create)

**Interfaces:**
- Produces: `PlaceOverviewItem` now has `enabled: boolean`. Geofence rows carry their real `enabled`; place rows are always `false`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/api/src/__tests__/services/placesOverviewEnabled.test.ts
import { getPlacesOverview } from '../../services/geofenceService';
import * as db from '../../db'; // adjust to the module exporting queryMany

jest.mock('../../db');
const mockedDb = db as jest.Mocked<typeof db>;

describe('getPlacesOverview — enabled flag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // First queryMany call = geofences, second = places
    (mockedDb.queryMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'gf-1', name: 'The Gym', open_count: '8', enabled: false }])
      .mockResolvedValueOnce([{ id: 'pl-1', name: 'Costco', open_count: '3' }]);
  });

  it('returns enabled from the geofence row and false for inferred places', async () => {
    const result = await getPlacesOverview('u-1');
    const gym = result.find((r) => r.id === 'gf-1');
    const costco = result.find((r) => r.id === 'pl-1');
    expect(gym).toMatchObject({ kind: 'geofence', enabled: false });
    expect(costco).toMatchObject({ kind: 'place', enabled: false });
  });
});
```

> Note: confirm the actual import path/name of `queryMany` used inside `geofenceService.ts` (it imports from a `db`/`pool` helper) and adjust the `jest.mock` target to match.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend/api && npx jest placesOverviewEnabled -v`
Expected: FAIL — `enabled` is `undefined` on the geofence row (property not yet selected/mapped).

- [ ] **Step 3: Add `enabled` to the interface and query**

In `geofenceService.ts`, update the interface:

```ts
export interface PlaceOverviewItem {
  kind: 'geofence' | 'place';
  id: string;
  name: string;
  openCount: number;
  labeled: boolean;
  enabled: boolean;
}
```

Add `g.notification_enabled` to the geofence SELECT and type, and map it:

```ts
const geofences = await queryMany<{ id: string; name: string; open_count: string; notification_enabled: boolean }>(
  `SELECT g.id, g.name, g.notification_enabled,
          COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL) AS open_count
   FROM hub.geofences g
   LEFT JOIN hub.geofence_objects go ON go.geofence_id = g.id
   LEFT JOIN hub.atomic_objects ao ON ao.id = go.object_id
   WHERE g.user_id = $1 AND g.created_by = 'manual'
   GROUP BY g.id, g.name, g.notification_enabled
   ORDER BY open_count DESC, g.created_at DESC`,
  [userId]
);
```

Then in the return map:

```ts
return [
  ...geofences.map((g) => ({
    kind: 'geofence' as const, id: g.id, name: g.name,
    openCount: parseInt(g.open_count, 10), labeled: true,
    enabled: g.notification_enabled,
  })),
  ...places.map((p) => ({
    kind: 'place' as const, id: p.id, name: p.name,
    openCount: parseInt(p.open_count, 10), labeled: false,
    enabled: false,
  })),
];
```

> The test mock uses `enabled` as the column alias for brevity; in the real query the column is `notification_enabled`. Align the test's mock row key with whichever you select (use `notification_enabled` in both for fidelity).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend/api && npx jest placesOverviewEnabled -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/geofenceService.ts backend/api/src/__tests__/services/placesOverviewEnabled.test.ts
git commit -m "feat(places): expose enabled flag in places overview"
```

---

### Task 2: `promotePlaceToGeofence` service helper

**Files:**
- Modify: `backend/api/src/services/placeService.ts` (add exported function)
- Test: `backend/api/src/__tests__/services/promotePlace.test.ts` (create)

**Interfaces:**
- Consumes: `PlaceModel.findById`, `PlaceModel.getLinkedObjectIds`, `PlaceModel.setLinkInactive`, `GeofenceModel.create`, `GeofenceModel.addLinkedObject`.
- Produces:
  ```ts
  export async function promotePlaceToGeofence(
    userId: string,
    placeId: string
  ): Promise<GeofenceModel>
  ```
  Creates a manual geofence at the place's lat/lng with smart defaults, copies the place's active note links into `geofence_objects`, deactivates those place links, returns the new geofence.

- [ ] **Step 1: Write the failing test**

```ts
// backend/api/src/__tests__/services/promotePlace.test.ts
import { promotePlaceToGeofence } from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;

const USER_ID = 'u-1';
const PLACE_ID = 'pl-1';

describe('promotePlaceToGeofence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findById.mockResolvedValue({
      id: PLACE_ID, userId: USER_ID, normalizedName: 'The Gym',
      lat: 1.23, lng: 4.56, radiusMeters: 150,
    } as any);
    mockPlace.getLinkedObjectIds.mockResolvedValue(['obj-1', 'obj-2']);
    mockGeo.create.mockResolvedValue({ id: 'gf-new' } as any);
    mockGeo.addLinkedObject.mockResolvedValue(undefined as any);
    mockPlace.setLinkInactive.mockResolvedValue(undefined as any);
  });

  it('creates a manual geofence at the place location with smart defaults', async () => {
    await promotePlaceToGeofence(USER_ID, PLACE_ID);
    expect(mockGeo.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      name: 'The Gym',
      center: expect.objectContaining({ latitude: 1.23, longitude: 4.56 }),
      radius: 200,
      type: 'custom',
      createdBy: 'manual',
      placeId: PLACE_ID,
      notificationSettings: expect.objectContaining({ enabled: true, onEnter: true, onExit: false }),
    }));
  });

  it('migrates active note links onto the new geofence and deactivates place links', async () => {
    await promotePlaceToGeofence(USER_ID, PLACE_ID);
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-new', 'obj-1');
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-new', 'obj-2');
    expect(mockPlace.setLinkInactive).toHaveBeenCalledWith(PLACE_ID, 'obj-1');
    expect(mockPlace.setLinkInactive).toHaveBeenCalledWith(PLACE_ID, 'obj-2');
  });

  it('throws when the place does not belong to the user', async () => {
    mockPlace.findById.mockResolvedValue({ id: PLACE_ID, userId: 'someone-else' } as any);
    await expect(promotePlaceToGeofence(USER_ID, PLACE_ID)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend/api && npx jest promotePlace -v`
Expected: FAIL — `promotePlaceToGeofence` is not exported.

- [ ] **Step 3: Implement the helper**

Add to `backend/api/src/services/placeService.ts` (import `GeofenceModel` at top if not present):

```ts
import { GeofenceModel } from '../models/Geofence';

/**
 * Promote a detected (inferred) place into a manual geofence reminder.
 * Creates the geofence at the place's location with smart defaults, migrates
 * the place's active note links onto it, and deactivates the original links so
 * the place stops appearing as a separate "detected" row in the overview.
 */
export async function promotePlaceToGeofence(
  userId: string,
  placeId: string
): Promise<GeofenceModel> {
  const place = await PlaceModel.findById(placeId);
  if (!place || place.userId !== userId) {
    const err: any = new Error('Place not found');
    err.status = 404;
    throw err;
  }

  const geofence = await GeofenceModel.create(userId, {
    name: place.normalizedName,
    center: { latitude: place.lat, longitude: place.lng },
    radius: 200,
    type: 'custom',
    notificationSettings: { enabled: true, onEnter: true, onExit: false },
    placeId,
    createdBy: 'manual',
  } as any);

  const objectIds = await PlaceModel.getLinkedObjectIds(placeId);
  for (const objectId of objectIds) {
    await GeofenceModel.addLinkedObject(geofence.id, objectId);
    await PlaceModel.setLinkInactive(placeId, objectId);
  }

  return geofence;
}
```

> Verify `GeofenceModel.create`'s `GeofenceCreateRequest` field names (`center`, `radius`, `type`, `notificationSettings.onEnter/onExit`) against `models/Geofence.ts`. The cast `as any` covers the extra `placeId`/`createdBy` already accepted by `create`'s signature; tighten if the project's type allows.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend/api && npx jest promotePlace -v`
Expected: PASS (all three cases)

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/placeService.ts backend/api/src/__tests__/services/promotePlace.test.ts
git commit -m "feat(places): add promotePlaceToGeofence helper with note migration"
```

---

### Task 3: `POST /api/v1/places/:id/promote` route

**Files:**
- Modify: `backend/api/src/routes/places.ts`
- Test: `backend/api/src/__tests__/routes/promotePlaceRoute.test.ts` (create)

**Interfaces:**
- Consumes: `promotePlaceToGeofence(userId, placeId)` from Task 2.
- Produces: `POST /api/v1/places/:id/promote` → `200 { geofence }` on success, `401` if unauthenticated, `error.status` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// backend/api/src/__tests__/routes/promotePlaceRoute.test.ts
import request from 'supertest';
import express from 'express';
import placesRouter from '../../routes/places';
import * as placeService from '../../services/placeService';

jest.mock('../../services/placeService');
const mockSvc = placeService as jest.Mocked<typeof placeService>;

function appWithUser(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = userId ? { id: userId } : undefined; next(); });
  app.use('/api/v1/places', placesRouter);
  return app;
}

describe('POST /api/v1/places/:id/promote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('promotes and returns the new geofence', async () => {
    mockSvc.promotePlaceToGeofence.mockResolvedValue({ id: 'gf-new', name: 'The Gym' } as any);
    const res = await request(appWithUser('u-1')).post('/api/v1/places/pl-1/promote');
    expect(res.status).toBe(200);
    expect(res.body.geofence).toMatchObject({ id: 'gf-new' });
    expect(mockSvc.promotePlaceToGeofence).toHaveBeenCalledWith('u-1', 'pl-1');
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(appWithUser(null)).post('/api/v1/places/pl-1/promote');
    expect(res.status).toBe(401);
  });
});
```

> Match the existing route tests' harness style if `backend/api/src/__tests__/routes/objectsBulk.test.ts` differs (e.g. how `req.user` is injected). Mirror it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend/api && npx jest promotePlaceRoute -v`
Expected: FAIL — route returns 404 (not registered).

- [ ] **Step 3: Add the route**

In `backend/api/src/routes/places.ts`, import the helper and add the route near the other POST handlers:

```ts
import { promotePlaceToGeofence } from '../services/placeService';

// ─── POST /api/v1/places/:id/promote ───────────────────────────────────────
// Promote a detected place into a manual geofence reminder (migrates notes).
router.post('/:id/promote', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const geofence = await promotePlaceToGeofence(userId, req.params.id);
    res.json({ geofence });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to promote place' });
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend/api && npx jest promotePlaceRoute -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/routes/places.ts backend/api/src/__tests__/routes/promotePlaceRoute.test.ts
git commit -m "feat(places): add POST /places/:id/promote route"
```

---

### Task 4: Mobile API client — `enabled` type, `promotePlace`, `setGeofenceEnabled`

**Files:**
- Modify: `mobile/src/services/api.ts`

**Interfaces:**
- Consumes: backend `POST /places/:id/promote`, existing `PUT /geofences/:id`.
- Produces (on `apiService`):
  ```ts
  promotePlace(placeId: string): Promise<{ geofence: any }>
  setGeofenceEnabled(geofenceId: string, enabled: boolean): Promise<{ geofence: any }>
  ```
  And `PlaceOverviewItem.enabled: boolean`.

- [ ] **Step 1: Add `enabled` to the `PlaceOverviewItem` type**

In `mobile/src/services/api.ts` (~line 146):

```ts
export interface PlaceOverviewItem {
  kind: 'geofence' | 'place';
  id: string;
  name: string;
  openCount: number;
  labeled: boolean;
  enabled: boolean;
}
```

- [ ] **Step 2: Add `promotePlace` and `setGeofenceEnabled` methods**

Add alongside the other geofence/place methods (after `getPlacesOverview` ~line 645):

```ts
async promotePlace(placeId: string): Promise<{ geofence: any }> {
  const res = await this.request<{ geofence: any }>(`/api/v1/places/${placeId}/promote`, {
    method: 'POST',
  });
  return { geofence: this.toMobileGeofence(res.geofence) };
}

async setGeofenceEnabled(geofenceId: string, enabled: boolean): Promise<{ geofence: any }> {
  return this.updateGeofence(geofenceId, { enabled });
}
```

> `updateGeofence` already routes `enabled` through `toBackendGeofence` (which sets `notificationSettings.enabled`). Confirm by reading `toBackendGeofence` ~line 460 — it destructures `enabled` and maps it. A partial `{ enabled }` body is acceptable because `toBackendGeofence` only spreads provided fields; if the backend `PUT` requires a full object, instead fetch-merge before sending. Verify against `routes/geofences.ts` PUT handler and adjust if it rejects partial bodies.

- [ ] **Step 3: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: No new errors referencing `api.ts` (pre-existing unrelated errors may remain — note them, don't fix here).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/services/api.ts
git commit -m "feat(mobile): add promotePlace + setGeofenceEnabled API methods and enabled type"
```

---

### Task 5: Remove the "Place reminders" home card

**Files:**
- Modify: `mobile/src/screens/HomeScreen.tsx` (the `NAV_ITEMS` array, ~lines 36–43)

**Interfaces:**
- Produces: a `HomeScreen` whose `NAV_ITEMS` no longer contains the `route: 'Reminders'` entry. The `Reminders` route itself stays registered in the navigator (still reachable from PlacesScreen edit flows).

- [ ] **Step 1: Remove the menu item**

Delete this object from the `NAV_ITEMS` array in `mobile/src/screens/HomeScreen.tsx`:

```ts
{
  icon: 'notifications-outline' as const,
  label: 'Place reminders',
  description: 'Get notified when you arrive somewhere',
  route: 'Reminders' as const,
  iconColor: '#0284C7',
  iconBg: '#E0F2FE',
},
```

- [ ] **Step 2: Update the "Places" item copy**

Change the `Places` entry's description to reflect the merged purpose:

```ts
{
  icon: 'location-outline' as const,
  label: 'Places',
  description: 'Your places, notes, and arrival reminders',
  route: 'Places' as const,
  iconColor: '#7C3AED',
  iconBg: '#F3E8FF',
},
```

- [ ] **Step 3: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: No new errors in `HomeScreen.tsx`.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/HomeScreen.tsx
git commit -m "feat(mobile): collapse Place reminders into the Places home card"
```

---

### Task 6: Rebuild PlacesScreen — bell toggle + "Add a place"

**Files:**
- Modify: `mobile/src/screens/PlacesScreen.tsx`

**Interfaces:**
- Consumes: `apiService.getPlacesOverview`, `apiService.promotePlace`, `apiService.setGeofenceEnabled`, `PlaceOverviewItem` (with `enabled`). Navigates to `CreateGeofence` for "Add a place".
- Produces: a screen with a 🔔 toggle per card and a "+ Add a place" footer button.

- [ ] **Step 1: Replace the card renderer and footer**

Update the imports to add `Alert` and `apiService` usage, then replace the `renderItem` and the footer `TouchableOpacity`. Full new `renderItem`:

```tsx
const toggleBell = async (item: PlaceOverviewItem) => {
  // optimistic update
  const prev = items;
  try {
    if (item.kind === 'geofence') {
      const next = !item.enabled;
      setItems((cur) => cur.map((i) =>
        i.kind === item.kind && i.id === item.id ? { ...i, enabled: next } : i));
      await apiService.setGeofenceEnabled(item.id, next);
    } else {
      // detected place → promote to a reminder
      await apiService.promotePlace(item.id);
    }
    await load();
  } catch (e) {
    console.warn('[PlacesScreen] toggle failed', e);
    setItems(prev); // rollback
    Alert.alert('Could not update reminder', 'Please try again.');
  }
};
```

`renderItem`:

```tsx
renderItem={({ item }) => {
  const bellOn = item.kind === 'geofence' && item.enabled;
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardMain} onPress={() => openPlace(item)} activeOpacity={0.7}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.count}>
          {item.openCount} {item.openCount === 1 ? 'note' : 'notes'}
          {item.kind === 'place' ? ' · detected' : ''}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => toggleBell(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons
          name={bellOn ? 'notifications' : 'notifications-off-outline'}
          size={22}
          color={bellOn ? '#0284C7' : '#9CA3AF'}
        />
      </TouchableOpacity>
    </View>
  );
}}
```

Replace the footer button (was "Manage / add a place" → `Reminders`):

```tsx
<TouchableOpacity style={styles.manage} onPress={() => navigation.navigate('CreateGeofence', {})}>
  <Text style={styles.manageText}>+ Add a place</Text>
</TouchableOpacity>
```

Update the empty state copy:

```tsx
<Text style={styles.empty}>No places yet. Tap "+ Add a place" to create one.</Text>
```

- [ ] **Step 2: Add the `cardMain` style**

In the `StyleSheet.create` block, add and adjust:

```ts
card: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
cardMain: { flex: 1, marginRight: 12 },
```

(The existing `card` already uses row layout; `cardMain` lets the text take available width and pushes the bell to the right.)

- [ ] **Step 3: Confirm the `CreateGeofence` route name + params**

Read `mobile/src/navigation/types.ts` and confirm the route is named `CreateGeofence` and that an empty/optional param object is valid. If the actual name differs (e.g. `Reminders` stack screen), use the correct name. Adjust the `navigation.navigate(...)` call accordingly.

- [ ] **Step 4: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: No new errors in `PlacesScreen.tsx`.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/PlacesScreen.tsx
git commit -m "feat(mobile): unified place cards with reminder bell toggle and add-a-place"
```

---

### Task 7: "Edit reminder settings" affordance on PlaceSummaryScreen

**Files:**
- Modify: `mobile/src/screens/PlaceSummaryScreen.tsx`

**Interfaces:**
- Consumes: the existing `geofenceId` route param (PlaceSummary already accepts it). Navigates to the existing reminder edit screen.
- Produces: a tappable "Edit reminder settings" row, shown only when the summary was opened for a geofence (`geofenceId` present).

- [ ] **Step 1: Read the screen to find its param + header layout**

Run: `sed -n '1,60p' mobile/src/screens/PlaceSummaryScreen.tsx`
Identify how `geofenceId` arrives via `route.params` and where the header/title renders.

- [ ] **Step 2: Add the conditional affordance**

Where the screen has a header or top action area, add (guarded by `geofenceId`):

```tsx
{geofenceId ? (
  <TouchableOpacity
    style={styles.editReminder}
    onPress={() => navigation.navigate('CreateGeofence', { geofenceId })}
  >
    <Ionicons name="settings-outline" size={16} color="#4F46E5" />
    <Text style={styles.editReminderText}>Edit reminder settings</Text>
  </TouchableOpacity>
) : null}
```

Add styles:

```ts
editReminder: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
editReminderText: { color: '#4F46E5', fontSize: 14, fontWeight: '600' },
```

> Confirm `CreateGeofenceScreen` accepts a `geofenceId` param for edit mode. If it currently only supports create, this affordance should instead navigate to the existing geofence edit entry point used by `GeofencesScreen` (read `GeofencesScreen.tsx` to see how it opens an existing geofence for editing) and reuse that route/param. Use whatever GeofencesScreen already uses — do not invent a new edit screen.

- [ ] **Step 3: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: No new errors in `PlaceSummaryScreen.tsx`.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/PlaceSummaryScreen.tsx
git commit -m "feat(mobile): edit reminder settings from place summary"
```

---

### Task 8: Full backend test pass + mobile typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend/api && npm test`
Expected: PASS, including the three new test files. If any pre-existing test now fails because of the overview query change (the added `notification_enabled` column / `GROUP BY`), fix the query — not the test.

- [ ] **Step 2: Mobile typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: Only pre-existing, unrelated errors remain (record them in the commit message if any touch the modified files; there should be none new).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test(places): full suite green for unified places"
```

---

## Self-Review Notes

- **Spec coverage:** Home card removal → Task 5; unified sectioned cards + bell → Task 6; one-tap-defaults promote with note migration → Tasks 2/3/6; bell-off = disable → Tasks 4/6; `enabled` in overview → Tasks 1/4; edit reminder settings → Task 7; "+ Add a place" → Task 6. All spec sections mapped.
- **Type consistency:** `promotePlaceToGeofence(userId, placeId)` defined in Task 2 and called identically in Task 3; `promotePlace`/`setGeofenceEnabled` defined in Task 4 and consumed in Task 6; `PlaceOverviewItem.enabled` added in both backend (Task 1) and mobile (Task 4).
- **Verification-required assumptions flagged inline** (route names, `queryMany` import path, `CreateGeofence` edit-mode param, partial-PUT acceptance) — the implementer must confirm each against the noted file before coding, since these come from the existing codebase rather than this plan.
