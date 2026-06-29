# Unified Place Done/Delete Cleanup + Completion-Aware Recap

**Date:** 2026-06-29
**Status:** Approved design — ready for implementation plan
**Branch:** `feature/place-done-delete-recap`

## Problem

When a location notification fires and the user opens the place summary to see the
notes linked to that place, the available actions are inconsistent and overloaded:

- **Inferred Places** expose four actions: Done (link-inactive), Dismiss, Snooze, Unlink.
- **Manual Geofences** expose only **Done** (object `state = 'resolved'`).
- **Neither** offers a real **Delete**, so the user cannot clean up notes that have
  accumulated over weeks and are no longer wanted from the notification view.

Because location notes re-fire on every entry (manual geofences have **no cooldown**;
inferred places have a 1-hour cooldown), the user sees the same notes repeatedly and
has no clean way to clear handled or junk items.

Separately, the weekly AI recap (Weekly Synthesis) cannot distinguish a completed note
from an open one — it excludes soft-deleted notes but includes resolved ones with no
differentiation — so "what got done" is invisible.

## Goals

1. Give a single, consistent cleanup model at every place: **Done** and **Delete**.
2. Make "Done" mean genuine, global completion that is tracked.
3. Surface completions in the weekly recap as a dedicated "Accomplished" section.
4. Stop manual geofences from pinging on every single pass.

## Non-Goals

- No per-geofence configurable reminder frequency (possible later enhancement).
- No Snooze in the place screen (deliberately dropped — see Decisions).
- No change to hard-delete / 30-day retention behavior.
- No change to how geofences/places are registered or how the OS delivers events.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Action model | **Done + Delete only.** Retire done-here, dismiss, unlink, snooze from the place UI. |
| "Done" scope | **Global.** Done resolves the underlying object everywhere it's linked. |
| "Delete" semantics | **Soft-delete** the object (existing 30-day-recoverable behavior). |
| Recap treatment | **Dedicated "Accomplished this week" section** with count + items. |
| Manual geofence re-fire | **Add ~1-hour cooldown** matching inferred places. |
| Snooze | **Dropped** (user chose the two-action model). Flag on review if wanted back. |

## Design

### 1. Unified Done/Delete action model

Both inferred Places and manual Geofences expose exactly two actions per note in
`PlaceSummaryScreen.tsx`:

- **Done** → `POST /api/v1/objects/:id/state` with `{ state: 'resolved' }`.
  This is global: the open/active filter (`ao.state IN ('open','active')`) used by
  both place and geofence "objects shown here" queries drops it from every place.
  It remains queryable (not deleted) so the recap can count it.
- **Delete** → `DELETE /api/v1/objects/:id` (existing `deleteObject` → `softDelete()`,
  sets `deleted_at = NOW()`, recoverable 30 days). The `ao.deleted_at IS NULL` filter
  removes it from every place and from the recap corpus.

**Retired from the place UI** (backend endpoints may remain but unused by this screen):
done-here (`object_place_links.active = false`), dismiss (`dismissed_at`),
snooze (`snoozed_until`), unlink (`DELETE .../objects/:objectId` link row).

This is primarily a simplification of `PlaceSummaryScreen.tsx`'s `renderObject`
action row, plus pointing the manual-geofence path at the same global `state` +
soft-delete calls it does not currently use (today geofences only call
`updateObjectState(objectId, 'resolved')` and have no delete).

Affected files (from investigation):
- `mobile/src/screens/PlaceSummaryScreen.tsx` — action row (`renderObject`, ~184-248),
  handlers `handleDone`/`handleDismiss`/`handleSnooze`/`handleUnlink`. Replace with
  `handleDone` (global state→resolved) and `handleDelete` (soft-delete) for both branches.
- `mobile/src/services/api.ts` — reuse `updateObjectState` (`:736`) and `deleteObject`
  (`:438`); stop using the place-scoped link endpoints from this screen.

### 2. Manual geofence re-fire cooldown

Mirror the inferred-place cooldown for manual geofences so a frequently-passed place
does not notify on every entry.

- Add geofence trigger-state tracking analogous to `hub.place_trigger_state`
  (`last_entered_at`, `last_notified_at`, `cooldown_until`, `visit_count`,
  unique per `(user_id, geofence_id)`). New migration.
- Gate the manual-geofence notification on the cooldown, mirroring `placeService`'s
  `getPlaceNotifyPayload` cooldown check (`COOLDOWN_MS = 60 * 60 * 1000`). The mobile
  `showManualGeofenceNotification` path (`geofenceMonitoringService.ts` ~516-575) must
  consult a backend cooldown the way the place path consults `POST /places/:id/notify`.
  Preferred shape: a `POST /api/v1/geofences/:id/notify` endpoint returning
  `{ objects, count, cooldown }` parallel to the place notify payload, so the mobile
  background task suppresses when `cooldown` is true.
- Cooldown still re-fires later if notes are still open (state in open/active).

Affected files:
- `backend/api/src/db/migrations/<next>_geofence_trigger_state.sql` — new table.
- `backend/api/src/models/Geofence.ts` — trigger-state upsert/read (mirror `Place.ts`
  `getTriggerState` / `upsertTriggerState`).
- `backend/api/src/services/geofenceService.ts` — cooldown gate + notify payload.
- `backend/api/src/routes/geofences.ts` — `POST /:id/notify` endpoint.
- `mobile/src/services/geofenceMonitoringService.ts` — call notify endpoint and honor
  `cooldown` for the manual path (mirror `fetchPlaceNotify` usage).

### 3. Completion-aware weekly recap

Add an **"Accomplished this week"** section to the Weekly Synthesis.

Key subtlety: the recap currently fetches objects by *creation* date within the period
(`AtomicObjectModel.findByUserId(userId, { dateFrom, dateTo, limit: 200 })`,
`synthesisService.ts:261`), filtering only `deleted_at IS NULL` — no `state` filter,
no completion-by-date. A note **created** before the window but **completed** during it
would be missed. So completions need a **separate query**, not a reuse of the corpus fetch.

- Add a model method to fetch objects where `state = 'resolved'` AND
  `state_updated_at` falls within `[periodStart, periodEnd]` AND `deleted_at IS NULL`,
  for the user. (`state` and `state_updated_at` exist via migration `008_object_lifecycle.sql`.)
- Feed that list to the synthesis as the `accomplished` set (count + titles/short text).
- Extend `SYNTHESIS_SYSTEM_PROMPT` and the structured output schema with an
  `accomplished` block: a count and the list of completed items, rendered as its own
  section ahead of open threads/patterns.
- The existing open-threads/patterns corpus is unchanged except that the prompt should
  be aware which corpus items are still open vs resolved (pass `state` through the
  corpus line builder so the model does not describe a resolved item as an open thread).

Affected files:
- `backend/api/src/models/AtomicObject.ts` — new `findResolvedInPeriod` (or similar).
- `backend/api/src/services/synthesisService.ts` — fetch completions, corpus line
  builder includes `state` (`:53-72`), prompt assembly (`:282-289`), system prompt
  (`:89-116`), structured output handling.

### 4. Emergent benefit

The user's "every note every time" concern is resolved by (1): Done/Deleted notes leave
the open/active list, so each arrival shows only genuinely-open items. (2) ensures the
notification frequency itself is not noisy.

## Data Model Summary

- **Done** = `atomic_objects.state = 'resolved'`, `state_updated_at = NOW()`,
  `deleted_at` stays NULL. Global. Counted in recap.
- **Delete** = `atomic_objects.deleted_at = NOW()`. Global. Excluded from recap.
- **New:** `hub.geofence_trigger_state` (cooldown tracking for manual geofences).

## Testing

- **Done at a place** resolves the object globally; it disappears from every linked
  place's list and the geofence/place open-count queries.
- **Delete at a place** soft-deletes; object is gone from all lists and from the recap
  corpus; still recoverable within 30 days.
- **Manual geofence cooldown**: entering twice within the cooldown window notifies once;
  re-fires after the window if notes remain open; suppressed entirely when zero open notes.
- **Recap accomplished section**: a note created before the week but resolved during it
  appears in "Accomplished"; a resolved note is not described as an open thread; a
  soft-deleted note appears nowhere.
- Consistency: inferred Places and manual Geofences expose identical Done/Delete actions
  and identical cooldown behavior.

## Open Questions / Flags for Review

- **Snooze dropped.** If recurring "remind me again later at this place" is still wanted,
  add Snooze back as a third action.
- **Retired backend endpoints** (dismiss/snooze/unlink/done-here) are left in place but
  unused. Decide later whether to remove them once the new UI ships.
