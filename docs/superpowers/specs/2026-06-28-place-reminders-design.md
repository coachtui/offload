# Place Reminders: Auto-Linking & Browse-by-Place — Design

- **Date:** 2026-06-28
- **Status:** Approved (design); pending implementation plan
- **Author:** Tui + Claude

## Problem / Current State

The user wants a hands-free "second brain for places": name a place once (e.g. "Home"),
then speak notes naturally, and have the right notes resurface every time they arrive
there. Today the system falls short in three ways:

1. **Voice notes never link to manually-labeled geofences.** When a place name is
   extracted from a transcript, `placeService.resolveAndLinkPlace()` checks only the
   inferred-places table (`hub.places`) and then **geocodes the name via OSM Nominatim**,
   creating a brand-new inferred place/geofence. It never consults the user's manual
   geofences (`hub.geofences`). Result: a hand-labeled "Home" and a spoken "home" become
   two unrelated geofences at different coordinates, and geocoding a personal word like
   "home" is meaningless.

2. **Notes can only be attached to a place by hand.** Manual geofences get linked notes
   only via the "Manage Objects" screen (`geofence_objects` join table). There is no
   automatic path from voice → manual geofence.

3. **No way to browse notes by place, and arrival feels one-time.** The Notes tab
   (`ObjectsScreen`) groups everything by date only. The per-place view
   (`PlaceSummaryScreen`) exists but is reachable *only* by tapping an arrival
   notification. Inferred places carry a 2-hour notify cooldown; manual geofences have
   none and rely on the OS re-firing on exit/re-enter — so a reminder that "only happened
   once" is usually a resolved note (nothing left to show) or an incomplete region exit.

There are two parallel linking systems that never talk: `object_place_links`
(voice → inferred places) and `geofence_objects` (manual geofences).

## Goals

- The only manual step is **naming a place and setting its location** (one-time, per place).
- Voice notes auto-attach to labeled places by name — no manual linking.
- Notes are browsable **by place**, anytime, in-app.
- Arrival reminders fire on **every genuine visit** and always reflect the **current open
  notes** for that place.

## Non-Goals (out of scope for this spec)

- Alias / fuzzy matching (e.g. "the house" → "Home"). Exact label match only for v1.
- Unifying the two link tables into one schema (bigger migration; not needed now).
- Changing how geofences are physically created/edited beyond what's stated.

## Requirements (decisions made during brainstorming)

- **Matching:** exact, case-insensitive label match. Non-matches keep today's Nominatim
  geocoding (so "try that ramen place" still works).
- **Browse:** a dedicated **Places list** screen you tap into; the flat date-grouped Notes
  tab is unchanged.
- **Places list contents:** labeled geofences pinned on top (always shown); auto-detected
  inferred places below, shown only if they have **≥1 open note** (self-cleaning).
- **Ordering:** within any place (tap-in view *and* arrival notification), notes are sorted
  **newest first** (most recent at top).
- **Closed notes drop off:** notes marked done/resolved are excluded from per-place views and
  arrival notifications — only open notes ever appear.
- **Arrival:** re-notify on **every** arrival (OS re-fires on exit→re-enter); always pull
  **live open notes**; **no open notes → no notification**; a short anti-spam window so one
  visit yields one ping.

## Design

### Approach

**Bridge the two linking systems** (chosen over unifying them). Add a name-match step so
voice notes link to manual geofences when the name matches; everything else keeps working
as today. The new Places screen reads both tables and merges. No data migration.

### Section 1 — Backend matching & linking

- **New model method** `GeofenceModel.findByUserAndName(userId, name)` — exact,
  case-insensitive match on `hub.geofences.name` (`WHERE lower(name) = lower($2)`).
- **New precedence in `placeService.resolveAndLinkPlace()`** for each extracted place name:
  1. **Labeled geofence match first.** If the name exactly matches a manual geofence, link
     the note via `geofence_objects` (`GeofenceModel.addLinkedObject`) and **return** — no
     geocoding, no inferred place created.
  2. **Else** fall back to existing behavior: inferred-place name dedupe → Nominatim
     geocode → create/link inferred place.
- **Duplicate guard in `maybeCreateInferredGeofence()`:** before creating an inferred
  geofence, skip if a manual geofence with the same name already exists, so the labeled
  geofence stays the single source of truth.
- Matching is **name-based, not GPS-based** — saying "home" while at work still links to
  Home.

### Section 2 — Places screen & navigation

- **New `PlacesScreen`** reached from a new **"Places"** item on the Home screen
  (separate from "Place reminders", which remains the create/label/edit surface).
  - Section "Your places": labeled geofences, always shown, each with open-note count.
  - Section "Detected places": inferred places with ≥1 open note, each with count.
- **New backend endpoint** (`places overview`) returning the merged list with open-note
  counts in a single call. "Open" = note state `open`/`active` (not resolved/archived).
- **Tap a place → its notes:** reuse `PlaceSummaryScreen`, generalized to load from either
  a labeled geofence (`getGeofenceObjects`) or an inferred place (`getPlaceObjects`). Shows
  **open notes only, newest first**. Same note cards and actions (Done / Dismiss / Snooze /
  Unlink) plus the capture date. Note: the per-place object queries currently order oldest-
  first (`created_at ASC`) — flip to `DESC` for newest-first.
- **"Manage / add a place"** link from the Places list over to the geofence screen.
- The **Manage Objects** screen demotes to an optional manual override, not the primary path.

### Section 3 — Arrival notifications

- **Re-notify every visit:** each OS geofence enter (after a real exit) fires a reminder.
- **Live notes every time:** each arrival fetches the place's **current open notes**,
  **newest first** — resolved/closed notes drop off, newly added notes appear automatically.
- **No open notes → no notification.**
- **Anti-spam window:** replace the inferred-place 2-hour cooldown with a shorter, uniform
  window (~1 hour, exact value TBD in plan) applied to **both** manual geofences and
  inferred places, so one visit = one ping but a genuine later return re-fires.
- **Honest constraint:** phone geofencing only re-fires after the device actually leaves
  and re-enters the region; this is OS behavior, not something we control.

## Data Model

- No migration. Continue using `geofence_objects` (manual) and `object_place_links`
  (inferred). The Places overview and detail read whichever applies. The 2-hour cooldown
  in `place_trigger_state` is retuned, not restructured.

## Testing

- **Backend (TDD):** `findByUserAndName` (exact/case-insensitive, no false matches);
  precedence in `resolveAndLinkPlace` (label match links to geofence and skips geocoding;
  non-match still geocodes); duplicate-guard skips inferred geofence when a manual one
  exists; overview endpoint returns correct merged counts and excludes zero-open inferred
  places.
- **Mobile:** no unit harness — verify on device (Places list shows correct sections/counts;
  tap → correct notes; arrival re-notifies with current open notes).

## Open Questions / Risks (to resolve during planning/implementation)

- Confirm the precise current "one-time" cause on the user's device (resolved-note vs.
  incomplete region exit vs. cooldown) and validate the re-notify fix against it.
- Final anti-spam window value.
- `PlaceSummaryScreen` action wiring differs slightly between `object_place_links` and
  `geofence_objects` (e.g. Unlink); confirm both paths during implementation.
