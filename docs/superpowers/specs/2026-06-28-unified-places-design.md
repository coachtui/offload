# Unified Places — Design Spec

**Date:** 2026-06-28
**Branch:** feature/notes-categories-deletion (or a fresh feature/unified-places)
**Status:** Approved design, ready for implementation plan

## Problem

The home screen has two separate location cards:

- **"Place reminders"** (`notifications-outline` → `GeofencesScreen`) — "Get notified when you arrive somewhere."
- **"Places"** (`location-outline` → `PlacesScreen`) — "Your notes grouped by location."

To a user these are the same real-world thing. "The gym" is one place — not a reminder-gym and a notes-gym. The split forces the user to decide which feature they want before they've even thought about a place, and the two "add" flows feel identical (the Places screen even punts creation to the reminders screen: *"Create one under Place reminders."*). The user reported that adding a place in either spot "seems exactly the same."

## Goal

Collapse both into **one "Places" home card**. A place is a single card that owns everything about that location: its notes and a reminder bell. No more deciding "is this a Place or a Reminder?"

Non-goals: no refactor of the underlying `places`/`geofences` tables (pragmatic thin-glue approach); no change to how notes are captured, parsed, or linked; no change to the notification delivery pipeline.

## Key insight: the data already maps onto the card model

The backend already exposes a merged list via `GET /api/v1/places/overview`
(`geofenceService.getPlacesOverview`), returning `PlaceOverviewItem[]`:

```ts
interface PlaceOverviewItem {
  kind: 'geofence' | 'place';
  id: string;
  name: string;
  openCount: number;   // open/active linked notes
  labeled: boolean;
}
```

The two `kind`s already mean exactly what the unified card needs:

| Today's row | What it really is | Unified card state |
|---|---|---|
| `kind: 'geofence'` (manual geofence) | A **saved place** that accumulates notes (name-match dedup routes notes to it in `placeService`) **and** fires notifications | **🔔 ON** |
| `kind: 'place'` (inferred place w/ ≥1 open note) | A **detected place** with notes, no notifications | **🔔 off** |

So "a saved place with a reminder" and "a detected place" are not two features — they are two **states of one card**. The bell reflects whether a reminder (manual geofence) exists and is enabled.

## Design

### Home screen (`mobile/src/screens/HomeScreen.tsx`)

- **Remove** the "Place reminders" menu item (`route: 'Reminders'`, `notifications-outline`).
- **Keep** the "Places" item (`route: 'Places'`, `location-outline`) as the single entry point.
- Optionally update its description to reflect the merged purpose
  (e.g. "Your places, notes, and arrival reminders").

`GeofencesScreen` and `CreateGeofenceScreen` are **not deleted** — they are reused
as the reminder-settings editor and location picker (see below), just no longer
reachable as their own top-level home destination.

### Places screen (`mobile/src/screens/PlacesScreen.tsx`) — the single hub

Renders the merged overview as place cards, two sections:

- **"Your places"** — `kind: 'geofence'` rows (saved). Bell reflects `enabled`.
- **"Detected"** — `kind: 'place'` rows (inferred, notes only). Bell always off.

Each card:

```
┌─────────────────────────────────┐
│ 📍 The Gym              🔔 ON    │
│ 8 notes · last visit 2d ago     │
├─────────────────────────────────┤
│ 📍 Costco               🔔 off   │
│ 3 notes · detected              │
└─────────────────────────────────┘
        [ + Add a place ]
```

- Card body shows: name · note count · a recency/"detected" subtitle.
- A **🔔 toggle** on the right (see Bell behavior).
- **Tap the card** → `PlaceSummaryScreen` (already exists; supports both
  `placeId` and `geofenceId`) showing the place's notes plus an
  **"Edit reminder settings"** affordance.
- **"+ Add a place"** button at the bottom replaces the current
  "Manage / add a place → Reminders" punt.

### Bell behavior — one tap, smart defaults

**Detected place (bell off → ON):**
- Call `promotePlaceToGeofence` (see "Known wrinkle" below): creates a manual
  geofence at the place's location with defaults — `radius: 200`,
  `notifyOnEnter: true`, `notifyOnExit: false`, no quiet hours, `type: 'custom'`,
  name = place name, `createdBy: 'manual'` — **and migrates the place's existing
  notes onto it** so the detected row disappears and the saved card shows the right
  count immediately.
- Future notes name-match into the geofence automatically (existing `placeService`
  dedup). Show a lightweight confirmation:
  *"You'll be notified when you arrive at The Gym."*
- Card optimistically moves to "Your places" with bell ON.

**Saved place (bell ON → off): disable, do NOT delete.**
- Set the geofence `enabled: false` via `apiService.updateGeofence`.
- The geofence keeps its linked notes (`geofence_objects`) — nothing orphaned.
- Card stays a saved place but renders bell-off / "reminder paused"; can be
  re-enabled anytime.
- Rationale: deleting would orphan the place's notes and make it vanish.

**Edit reminder settings** (from `PlaceSummaryScreen`):
- Reuse the existing `CreateGeofenceScreen` fields as an edit form
  (radius, enter/exit, quiet hours) bound to the existing geofence via
  `updateGeofence`.

### Add a place (`+ Add a place`)

- Stripped-down form: **name + location** (reuse the location-picker portion of
  `CreateGeofenceScreen` — current location or map pick).
- Bell defaults **ON** → creates a manual geofence with the smart defaults above.
- (A future option could allow saving a place with the bell off, but YAGNI for v1;
  default-on matches the "add a place I care about" intent.)

## Backend changes (thin glue only)

Keep `places` and `geofences` tables as-is. Two small touches:

1. **Surface `enabled` in the overview.** Add `enabled: boolean` to
   `PlaceOverviewItem` and to the geofence branch of
   `geofenceService.getPlacesOverview` (the query already selects from
   `hub.geofences`; add `g.enabled`). For `kind: 'place'` rows, `enabled` is
   always `false`/`undefined`. The overview already includes manual geofences
   regardless of `enabled`, so a disabled saved place still appears in
   "Your places" — it just renders bell-off.

2. **Toggle path.**
   - bell ON for a **detected place** → new `promotePlaceToGeofence` helper +
     endpoint (e.g. `POST /api/v1/places/:id/promote`): create geofence at the
     place's lat/lng with defaults **and** migrate `object_place_links` →
     `geofence_objects`, deactivating the place links.
   - bell ON for **"+ Add a place"** (no existing place) → `POST /api/v1/geofences`
     (existing `createGeofence`).
   - bell OFF for a saved place → `PATCH/PUT` geofence with `enabled: false`
     (existing `updateGeofence`).

   Confirm `updateGeofence` accepts an `enabled` field; if not, extend it.

No DB migration (reuses existing `geofence_objects` / `object_place_links` tables).
No change to notification scheduling
(`GeofenceMonitoringService` already respects `enabled`).

## Components touched

| File | Change |
|---|---|
| `mobile/src/screens/HomeScreen.tsx` | Remove "Place reminders" menu item; tweak "Places" copy |
| `mobile/src/screens/PlacesScreen.tsx` | Rebuild as the hub: sectioned cards, bell toggle, "+ Add a place" |
| `mobile/src/screens/PlaceSummaryScreen.tsx` | Add "Edit reminder settings" affordance |
| `mobile/src/screens/CreateGeofenceScreen.tsx` | Reused as (a) reminder-settings edit form, (b) add-a-place location picker |
| `mobile/src/screens/GeofencesScreen.tsx` | No longer a home destination; kept/optionally retired as a route |
| `mobile/src/services/api.ts` | `PlaceOverviewItem.enabled?: boolean`; confirm `updateGeofence` enabled support |
| `mobile/src/hooks/useGeofences.ts` | Toggle helpers if not already covered by create/update |
| `backend/api/src/services/geofenceService.ts` | Add `g.enabled` to overview query + `PlaceOverviewItem` |
| `backend/api/src/services/placeService.ts` | New `promotePlaceToGeofence` helper (create geofence + migrate note links) |
| `backend/api/src/routes/places.ts` | New `POST /places/:id/promote` route |

## Data flow

```
PlacesScreen
  └─ GET /places/overview → [{kind, id, name, openCount, labeled, enabled}]
       ├─ kind 'geofence' → "Your places", bell = enabled
       └─ kind 'place'    → "Detected",    bell = off

Bell toggle
  ├─ detected → ON  : POST /geofences (defaults @ place location)
  └─ saved   → off  : PUT  /geofences/:id { enabled: false }

Tap card → PlaceSummaryScreen (placeId | geofenceId)
  └─ "Edit reminder settings" → CreateGeofenceScreen(edit) → PUT /geofences/:id
```

## Error handling

- Toggle uses optimistic update with rollback on failure (pattern already used in
  `ManageGeofenceObjectsScreen`); show a toast on error and revert the bell.
- "+ Add a place" requires a location; block save and prompt if none resolved.
- Overview load failure: keep the existing empty/error state in `PlacesScreen`.

## Testing

- Backend: `getPlacesOverview` returns `enabled` for geofence rows; disabled
  manual geofence still appears in the list.
- Toggle ON creates a geofence at the place's coordinates with the documented
  defaults; subsequent same-name notes link to it.
- Toggle OFF sets `enabled: false` and preserves `geofence_objects` linkage.
- Mobile: PlacesScreen renders both sections; bell state reflects kind/enabled;
  tapping a card opens PlaceSummary; "+ Add a place" creates a bell-on place.
- Home screen no longer shows "Place reminders"; "Places" is the sole entry.

## Known wrinkle: promoting a detected place (must resolve in the plan)

When a **detected place** (inferred, `kind: 'place'`) is promoted via the bell, its
existing notes are linked to the *place* (`object_place_links`), while the new
manual geofence starts with **zero** linked notes. `placeService` name-match dedup
only routes *future* notes to the labeled geofence. So immediately after toggling
on, the overview could show **two rows for the same place**: a saved "The Gym"
(0 notes) and a detected "The Gym" (8 notes).

**Resolution (decided): the migrate approach.**
On promote, migrate the inferred place's open note links to the new geofence — copy
`object_place_links` → `geofence_objects`, deactivate the original place links — so
the detected row disappears and the saved card shows the correct note count
immediately. This needs a small backend helper, e.g.
`promotePlaceToGeofence(userId, placeId, defaults)`, which:

1. Creates the manual geofence at the place's lat/lng with the smart defaults.
2. Copies the place's active `object_place_links` into `geofence_objects`.
3. Deactivates those `object_place_links` (so the inferred place drops out of the
   overview's `HAVING open_count >= 1` filter and no longer renders as a separate row).
4. Returns the new geofence.

The bell-ON path for a detected place calls this helper instead of a bare
`createGeofence`. The bell-ON path for "+ Add a place" (brand-new, no existing
inferred place) still uses plain `createGeofence`. This is a conscious step beyond
pure "thin glue" — it adds one backend helper and is the accepted trade for a clean
transition.

## Open questions / deferred

- Whether to fully retire `GeofencesScreen` as a route or keep it accessible for
  bulk management — deferred; not required for the unified UX.
- Deeper "Place is canonical" refactor (migrate standalone geofences under
  Place + placeId) — explicitly deferred in favor of the pragmatic approach.
