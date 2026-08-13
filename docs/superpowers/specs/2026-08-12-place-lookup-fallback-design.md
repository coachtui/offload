# Place Lookup Fallback — Design Spec

**Date:** 2026-08-12
**Branch:** feature/place-lookup-fallback
**Status:** Approved design, ready for implementation plan

## Problem

A note that names a real, local business silently produces no place and no
reminder. Field-observed on 2026-08-12 with "Melaleuca" (Honolulu). Production
logs for the test note:

```
REMINDER_CANDIDATE_DETECTED {"placeNames":["Melaleuca"],"hasUserLocation":true}
[placeService] resolveObjectPlaces: 1 place(s) ... (user at 21.3498, -158.0145)
[PlaceResolution] Multi-resolving "Melaleuca" via Nominatim...
[PlaceResolution] No results for "Melaleuca"
PLACE_UNRESOLVABLE {"query":"Melaleuca","reason":"nominatim_no_results"}
```

Everything upstream worked — transcription, the ML parse, place extraction, the
errand gate, and the user's location was attached. The pipeline died at one
step: the geocoder.

### Root cause

It is **not** that these places are missing from OpenStreetMap. Verified against
Nominatim by hand:

| Query | Result |
|---|---|
| `Melaleuca`, bounded to ~50 km of Oʻahu | **0 results** |
| `Melaleuca`, unbounded | 4 Australian localities; in the US, offices in Idaho Falls / Rexburg, a building in Kansas City, two Florida features |
| `590 Paiea St, Honolulu, HI` | resolves — 21.3364, ‑157.9147 (`highway/unclassified`, i.e. **street centerline**; the house number is discarded — `50 Paiea St` returns the identical point) |
| `500 Ala Moana Blvd, Honolulu, HI` | resolves — Waterfront Plaza building, 21.3013, ‑157.8620 |

OSM has the street and it has the building. What it does not have is the
**business name attached to them**. Google indexes businesses; OSM indexes
geography contributed by volunteers. Chains get mapped, tenants of an
industrial-park warehouse do not.

Two secondary findings from the same investigation:

1. The user's hand-made "Melaleuca" geofence sits 81 m from where OSM puts
   50 Paiea St — the manual pin is correct. It failed to catch the note only
   because the test note was recorded on a different account (a fresh
   `POST /register` seconds earlier). Same-account, step 1 of
   `resolveAndLinkPlace` (`placeService.ts:114`) matches manual geofences by
   name and short-circuits before the geocoder. That path is fine.
2. **The failure is invisible.** `PLACE_UNRESOLVABLE` is a `console.log` and
   nothing else — no row, no flag on the note, no retry, no UI. Worse, the
   completion push still carries `hasGeofenceCandidates: true`, which means "we
   tried", not "we succeeded", so the client can show the Always-permission
   sheet for a reminder that does not exist. The only way to discover the miss
   is to drive somewhere and notice nothing fired.

Note also: `hub.reminder_lifecycle_events` (migration 010) is **read** by
`GET /api/v1/diagnostics/reminders` but never written — `logLifecycle` only
console-logs. The diagnostics endpoint returns an empty table today.

## Goal

A note that names a place either (a) gets a correctly-located place, or
(b) visibly asks the user one question. Never silence.

Non-goals: no change to extraction, the errand gate, the confidence threshold,
the 15-geofence cap, or the notification pipeline. No re-architecture of
`places`/`geofences`.

## Design

Three parts, independently shippable, in dependency order.

### Part 1 — Provider chain (backend)

`placeResolutionService` gains a provider abstraction. `resolvePlaceNameMulti`
becomes a chain, not a single call.

```ts
// backend/api/src/services/placeProviders/types.ts
export interface PlaceProvider {
  readonly name: 'osm' | 'google';
  search(query: string, near?: { lat: number; lng: number }): Promise<ProviderCandidate[]>;
}

export interface ProviderCandidate {
  name: string;          // provider's display name for the business
  address: string | null; // formatted address, shown in the confirm sheet
  lat: number;
  lng: number;
  providerPlaceId: string; // 'osm:123' | 'google:ChIJ...'
  category: string | null;
}
```

- `osmProvider` — today's Nominatim call, moved verbatim (viewbox, `bounded=1`,
  `limit=40`, the User-Agent that must stay a real contact).
- `googleProvider` — Places API **Text Search (New)**, `locationBias` circle at
  the user's coordinates with a 50 km radius, `includedType` unset,
  `languageCode: 'en'`. Requests only the fields we use
  (`places.id,places.displayName,places.formattedAddress,places.location`) —
  field masking is what keeps the SKU in the cheap tier.

Chain order: **OSM first** (free, already tuned, good on chains), Google only
when OSM returns zero candidates. Rationale: OSM handles the Costco/Foodland
majority at no cost; Google is the long tail. Chain is short-circuiting, not
merging — mixing two providers' results creates duplicate-branch problems the
proximity dedupe was not designed for.

`GOOGLE_PLACES_API_KEY` unset ⇒ chain degrades to OSM-only and everything falls
through to Part 2. The feature must be fully functional without the key.

**Search anchors — the reminder must not depend on standing near the place.**

Today's search hard-bounds to a 50 km box around the user at record time
(`bounded=1`). That was added for a real reason — unbounded, "McDonald's"
returned Spain — but it means a reminder set from the other side of the island,
or from the mainland, cannot resolve at all. "Remind me to grab poke at
Foodland" said from a hotel in Las Vegas is exactly the note a place reminder
is *for*.

Resolution runs against an ordered list of **anchors**, not a single point:

1. **A region named in the note.** "the Foodland in Hilo", "Costco in
   Kailua-Kona" — geocode the region token and anchor there. Highest priority:
   the user said it out loud.
2. **Current location**, when the note was recorded inside the user's home
   region.
3. **Home region** — a learned centroid (below). This is what makes the Las
   Vegas note resolve to a Honolulu Foodland.

Anchors are tried in order; the first that yields candidates wins. Google's
`locationBias` is a soft bias (unlike `locationRestriction`), so anchoring costs
nothing when the guess is wrong. For Nominatim, keep `bounded=1` per anchor
pass rather than going unbounded — the Spain failure mode returns the moment
the box comes off.

**Home region** is a centroid over the user's existing manual geofences and
places, falling back to the modal location of their last ~50 recording
sessions, cached on `hub.users` and recomputed weekly. A user with no history
has no home anchor and simply gets steps 1–2, which is today's behaviour.

Distance sanity gate replaces the hard bound: reject a candidate more than
100 km from **every** anchor. A Honolulu user gets Honolulu results whether
they are in Kapālama or Nevada; nobody gets Spain.

**Caching.** New table `hub.place_provider_cache`, keyed on
`(lower(query), round(lat,1), round(lng,1), provider)` — roughly an 11 km cell,
so a name looked up anywhere on Oʻahu hits one row. Value is the candidate
array as `jsonb`, TTL 30 days. Repeat lookups of the same name cost nothing,
which matters because the same user says "Melaleuca" every month.

### Part 2 — Candidate arbitration and the pending queue

The current fan-out arms geofences at the **nearest 3** candidates. That is
correct for a chain and wrong for Melaleuca, which has a warehouse (Paiea St)
and a corporate office (500 Ala Moana Blvd, 6.8 km apart). Auto-arming both
means being pinged about a will-call pickup while walking past an office tower.

**The question is not "how many candidates" — it is "are these interchangeable".**

For Foodland, the right answer is genuinely *all of them*: the user does not
know which branch they will pass, and asking forces a decision they cannot make
yet and will often get wrong. Fan-out is correct and asking would be a
downgrade. For Melaleuca, two hits 6.9 km apart share a name and only one is
where you pick up an order.

**`primaryType` cannot carry this distinction.** Measured against the live API
on 2026-08-12, 50 km bias at 21.3498, ‑158.0145:

| Query | Results | `primaryType` values returned |
|---|---|---|
| Foodland | 20 | `grocery_store`, `supermarket`, `gas_station`, `shopping_mall` |
| Costco | 20 | `warehouse_store`, `gas_station`, `food_court`, `tire_shop`, `pharmacy`, `bakery`, `store`, `None` |
| Longs Drugs | 20 | `drugstore`, `pharmacy` |
| Melaleuca | 2 | `store`, `cosmetics_store` |

A "same type ⇒ interchangeable" rule shatters Foodland into a question and
mis-sorts Costco. Type is descriptive metadata, not an identity signal.

The structure the data *does* expose is **name and co-location**, in three steps
before anything is counted:

1. **Name filter.** Keep candidates whose `displayName` matches the query
   (exact, or query-as-prefix). Drops the noise Text Search mixes in — a
   Foodland query returned "Ewa Town Center", "Waikiki Market" and "Kapolei
   Village Center".
2. **Co-location collapse.** Candidates sharing a street address, or within
   300 m, become one, keeping the member whose name is closest to the query.
   Costco returns its gas station, food court, tire centre, pharmacy, optical
   and bakery as separate rows *at the warehouse's own address*; these are
   departments, not destinations. This step is also the fix for the historical
   "Costco Gasoline" geofence 25 km from the intended store.
3. **Count what survives.**

| Distinct locations | Reading | Action |
|---|---|---|
| 0 | Nothing found at any anchor | Write a **pending lookup** (below). No place, no geofence. |
| 1 | Unambiguous | Auto-create place + geofence, subject to the existing confidence threshold. |
| 2 | Same name, different destinations (Melaleuca) | **Ask.** Pending lookup carrying both candidates. |
| ≥3 | Chain (Foodland 17, Longs 18, Costco 5 warehouses) | Fan out to the nearest 3, as today. **Do not ask.** |

Request tuning: `maxResultCount: 10` and `rankPreference: DISTANCE`. Ranking by
distance puts the branches the user might actually reach at the top of the
window, and the smaller window cuts the noise the name filter would otherwise
have to discard.

OSM answers carry no `primaryType`; the same three steps apply using its
`name`/`display_name` and coordinates, which is all this rule needs.

**Fan-out stays silent but stops being invisible.** A chain note reports what it
did on the note itself — `📍 3 Foodlands armed ›` — opening the same sheet used
for pending lookups, where any branch can be removed. Visible and correctable,
without a blocking question.

New table:

```sql
-- migration 018_place_lookups.sql
CREATE TABLE IF NOT EXISTS hub.place_lookups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  object_id         uuid        NOT NULL REFERENCES hub.atomic_objects(id) ON DELETE CASCADE,
  query             text        NOT NULL,           -- the spoken name, e.g. 'Melaleuca'
  status            varchar(10) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','resolved','dismissed')),
  candidates        jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- ProviderCandidate[]
  provider          varchar(10),                    -- which one answered, null if none did
  recorded_lat      decimal(10,8),                  -- where the note was recorded
  recorded_lng      decimal(11,8),
  resolved_place_id uuid        REFERENCES hub.places(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(object_id, lower(query))
);

CREATE INDEX IF NOT EXISTS pl_user_pending_idx
  ON hub.place_lookups(user_id, created_at DESC) WHERE status = 'pending';
```

This one table is both the "needs your help" queue and the retry ledger: when a
provider is added later, or the user teaches a name, pending rows can be
re-run and back-link notes recorded weeks earlier.

API (`routes/places.ts`):

- `GET /api/v1/places/pending` → pending rows with candidates, note preview, and
  distance from the recorded point.
- `POST /api/v1/places/pending/:id/resolve` — body is one of
  `{ candidateIndex }` | `{ lat, lng, radius }` | `{ geofenceId }`. Creates the
  place (`created_by: 'manual'`, `user_confirmed: true`), creates or reuses the
  geofence, links the object, marks the row resolved.
- `POST /api/v1/places/pending/:id/dismiss` — "not a place" / "don't ask again".
  Also inserts the query into a per-user ignore list so the same word does not
  re-queue on every future note.

`PlaceOverviewItem` gains `kind: 'pending'` with `query` and `candidates`, so
the existing `GET /places/overview` carries it and `PlacesScreen` needs no new
fetch.

### Part 3 — Mobile: ask the question, and stop lying

**`PlacesScreen`** — a third section, **first** in the list, above "Your
places" and "Detected places":

```
NEEDS A LOCATION
┌─────────────────────────────────┐
│ 📍 Melaleuca                  › │
│    "pick up my order"           │
└─────────────────────────────────┘
```

**Confirm sheet** (tap a pending row, or the chip on the note):

```
Where is Melaleuca?
  ○ Melaleuca — 50 Paiea St, Honolulu        1.2 km
  ○ Melaleuca — 500 Ala Moana Blvd #4480     8.0 km
  ─────────────────────────────────────────
  📍 Use my current location
  🗺  Pick on the map
  ✕  Not a place
```

Candidate rows come from `place_lookups.candidates`. "Pick on the map" reuses
`CreateGeofenceScreen` with the name pre-filled. One tap and the manual-name
match at `placeService.ts:114` handles every future mention of that name
automatically — the user teaches the app once.

**Note detail** — a chip on any note with a pending lookup:
`📍 Melaleuca — set location`, opening the same sheet.

**Push honesty.** `processTranscript` currently reports
`hasGeofenceCandidates: true` when resolution was merely *attempted*. Split it:

- `arrivalArmed: string[]` — names that actually produced a geofence. Drives the
  Always-permission escalation sheet (which is pointless otherwise).
- `needsLocation: string[]` — names that queued a pending lookup. Completion
  push body becomes "Tap to set where Melaleuca is", deep-linking to the sheet.

### Telemetry

Make `logLifecycle` write to `hub.reminder_lifecycle_events` as well as the
console — the table and the diagnostics endpoint already exist and have been
dark since migration 010. New event types:

`PLACE_PROVIDER_FALLBACK` (osm miss → google hit/miss),
`PLACE_NEEDS_USER` (pending row written, with candidate count),
`PLACE_USER_RESOLVED` (which affordance the user picked),
`PLACE_LOOKUP_DISMISSED`.

The success metric is the ratio of `PLACE_NEEDS_USER` to `PLACE_RESOLVED`, and
how many pending rows are ever answered. If most are ignored, the sheet is in
the wrong place.

## Alternative considered: LLM address lookup via the existing Anthropic key

Attractive because `ANTHROPIC_API_KEY` is already configured — no billing setup,
no new vendor. Rejected as the resolution path, on two pieces of evidence from
the Melaleuca case:

1. **Word-sense ambiguity.** Asked cold, the model read "Melaleuca" as the
   paperbark tree genus and reported no location. It found 590 Paiea St only
   after a human said "it's the health and beauty store." The pipeline has no
   second turn; whatever comes back first is what arms a geofence. Google's
   location bias disambiguates structurally — an index of businesses near a
   coordinate cannot return a tree.
2. **The address cannot be validated.** The model returns a string we must then
   geocode, and OSM has **no house numbers on Paiea Street** — `590 Paiea St`
   and `50 Paiea St` return the byte-identical street-centerline result. The
   number is discarded, so a hallucinated one is undetectable: a confidently
   wrong address geocodes just as cleanly as the right one. (In this instance
   the model's 590 was correct; the point is that nothing downstream could have
   told us either way.) Google returns coordinates directly, with no
   string-to-coordinate step for a hallucination to hide in.

**Retained role:** when both providers return zero candidates, one Claude call
may *suggest* candidates into the confirm sheet, clearly marked as a
suggestion, requiring a tap. It never writes a place and never arms a geofence,
so a hallucinated address costs a rejected row rather than a reminder that
fires in the wrong place. Ship this after Parts 1–3, behind its own flag.

## Rollout

1. Migration 018 + provider chain + arbitration, `GOOGLE_PLACES_API_KEY` unset.
   Everything unresolvable queues. Verify pending rows appear for Melaleuca.
2. Mobile Parts 3 (sections, sheet, chip, push split).
3. Set the key in Railway. Verify "Melaleuca" now returns 2 candidates and the
   sheet offers both rather than auto-arming either.
4. Backfill: re-run pending rows created before the key existed.

## Testing

- **Regression, the case that started this:** "Melaleuca" at 21.3498, ‑158.0145
  → OSM 0 → Google 2 (590 Paiea St `store`; 500 Ala Moana Blvd #4480
  `cosmetics_store`) → pending row with both candidates → no geofence until a
  tap. Assert specifically that nothing auto-arms at the Ala Moana suite.
  The Paiea St hit lands within ~100 m of the user's hand-made pin.
- **Name filter:** a "Foodland" query drops "Ewa Town Center", "Waikiki Market",
  "Kapolei Village Center" before counting.
- **Co-location collapse:** a "Costco" query yields 5 warehouses, not 20 rows —
  gas station, food court, tire centre, pharmacy, optical and bakery fold into
  the warehouse sharing their address, and the surviving name is "Costco
  Wholesale", never "Costco Gasoline".
- **Away-from-home:** the same note recorded at a mainland coordinate resolves
  against the home anchor and produces the same Honolulu candidates.
- **Cross-island:** "Foodland in Hilo" recorded in Honolulu anchors on the named
  region, not on the user's current position.
- Chain fan-out unchanged: ≥3 surviving locations still arm the nearest 3 with
  no question asked.
- Exactly 2 surviving locations ask, regardless of their types.
- Co-located pair (<300 m) collapses to 1 and arms silently — never asks.
- Distance gate: no candidate more than 100 km from every anchor is ever kept.
- No key configured ⇒ OSM-only, pending queue still works, no crash.
- Cache hit path makes zero provider calls.
- `resolve` with `{lat,lng}` from "use my current location" produces a manual
  place, links the note, and marks the row resolved.

## Open questions

1. Should a resolved pending lookup also write into `vocabulary.json` for
   Deepgram biasing? "Melaleuca" is ASR-fragile, and the user has just told us
   the exact string. Probably yes, per-user, in a later pass.
2. Pending rows have no expiry. If a note is completed or deleted, its pending
   row should probably go with it (`ON DELETE CASCADE` handles deletion; note
   completion needs an explicit sweep alongside `reapEmptyInferredGeofences`).
