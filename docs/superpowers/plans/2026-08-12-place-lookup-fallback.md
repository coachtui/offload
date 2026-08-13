# Place Lookup Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A note that names a place either gets a correctly-located place, or visibly asks one question. Never silence. Field failure that motivated this: "Melaleuca" (Honolulu) produced `PLACE_UNRESOLVABLE` and nothing else — no place, no geofence, no UI, no retry.

**Architecture:** `placeResolutionService` becomes a **provider chain** (OSM → Google Places Text Search New) resolved against **ordered anchors** (region named in the note → current location → learned home region) instead of a hard 50 km box. Candidates are name-filtered, collapsed by co-location, then counted: 1 arms, 2 asks, ≥3 fans out. Anything unresolved or ambiguous becomes a row in a new `hub.place_lookups` table that is simultaneously the "needs your help" queue, the retry ledger, and the thing the UI renders. The ml-service is NOT touched.

**Tech Stack:** Node/TypeScript (backend/api), Google Places API (New) `places:searchText`, PostgreSQL (raw SQL migration 018), jest, React Native (PlacesScreen + a sheet + one App.tsx branch — all OTA-able).

**Spec:** `docs/superpowers/specs/2026-08-12-place-lookup-fallback-design.md`

## Global Constraints

- Work on branch `feature/place-lookup-fallback` off `main`.
- **Do NOT touch `backend/ml-service`** — extraction already works; it produced `["Melaleuca"]` correctly. The bug is entirely downstream.
- **Do NOT change** `arrivalTrigger.ts`, `GEOFENCE_CONFIDENCE_THRESHOLD` (0.45), `MAX_INFERRED_GEOFENCES` (15), or `INFERRED_RADIUS_METERS` (150). None were implicated.
- Migrations are raw SQL, idempotent (`IF NOT EXISTS`), and are applied **automatically at boot** by `src/db/migrate.ts`. Do not apply by hand. `npm run build` copies `.sql` into `dist/` — that copy step must keep working or migrations vanish in production.
- `GOOGLE_PLACES_API_KEY` lives on Railway → project `offload` → service `brain-dump` → production. **Every code path must work with the key absent** (chain degrades to OSM-only, everything unresolved queues). This is what lets Tasks 1–7 ship before the key is confirmed.
- Google key is server-side only. It must never reach `mobile/` or any client bundle.
- Baselines, measured on `main` at 2026-08-12: `cd backend/api && npx tsc --noEmit` is **clean (exit 0)**, and `npm test` is **56 suites / 362 tests, all passing** in ~3.7 s. Jest also prints a pre-existing "worker process failed to exit gracefully" warning traced to `reapEmptyInferredGeofences` (`placeService.ts:360`) via `routes/objects.ts:266` — a teardown leak, not a failure. Both baselines are green, so **any** new failure or type error is yours; do not explain one away as pre-existing.
- Column for note lifecycle is **`state`** (`open/active/resolved/archived`), not `status`.
- Place mutations go through `noteLifecycle.ts` where one exists — do not write link rows directly from new code paths.

---

### Task 1: `placeProviders` — provider interface + OSM extraction

Pure refactor. No behaviour change, no new dependency. Ships alone safely.

**Files:**
- Create: `backend/api/src/services/placeProviders/types.ts`
- Create: `backend/api/src/services/placeProviders/osmProvider.ts`
- Modify: `backend/api/src/services/placeResolutionService.ts`
- Test: `backend/api/src/__tests__/services/placeProviders.test.ts`

**Interfaces:**
- Produces: `PlaceProvider` and `ProviderCandidate` (consumed by Tasks 2, 3).

```ts
export interface ProviderCandidate {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  providerPlaceId: string;   // 'osm:123' | 'google:ChIJ...'
  category: string | null;   // OSM type | Google primaryType
}

export interface PlaceProvider {
  readonly name: 'osm' | 'google';
  search(query: string, near?: { lat: number; lng: number }): Promise<ProviderCandidate[]>;
}
```

- [x] **Step 1: Write the failing test** — `osmProvider.search` maps a stubbed Nominatim payload to `ProviderCandidate[]`, preserving `osm:<place_id>` prefixing, and returns `[]` on a non-200 or a timeout.
- [x] **Step 2: Move the Nominatim call verbatim** out of `resolvePlaceNameMulti` into `osmProvider`. Keep the `viewbox`/`bounded=1`/`limit=40` behaviour and **keep the User-Agent exactly as-is** — a placeholder contact domain is on OSM's blocklist and silently 403'd all place resolution once already (see the comment at `placeResolutionService.ts:11`). A test now asserts the contact address is present, so it cannot be edited back to a placeholder unnoticed.
- [x] **Step 3: Have `resolvePlaceNameMulti` call the provider** and map `ProviderCandidate[]` → `ResolvedPlace[]` via the existing `computeConfidence` / `pickRadius`. Existing tests must pass unchanged.
- [x] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm test` 57 suites / 371 tests passing (was 56/362 — the 9 new ones). No existing test file needed editing.

**Deviation from plan, for Task 3's author:** `resolvePlaceName` (the single-result variant) was a second raw Nominatim call site in the same file. It is exported but has **no callers anywhere in the codebase**, and leaving it would have kept a duplicate `USER_AGENT` and fetch — the exact thing whose divergence caused the 403 outage. It now delegates to the same provider. That changes its unused semantics: it is hard-bounded to the viewbox where before it biased with `bounded=0`, and it draws from 40 candidates rather than 3. Delete it outright if Task 3 does not find a use for it.

`ProviderCandidate.relevance` is the one piece of provider-specific data that had to survive the abstraction: `computeConfidence`'s base term was OSM's `importance`. It is optional and falls back to a neutral 0.5, so Google's lack of an equivalent scores neutrally rather than at zero.

---

### Task 2: `googleProvider` — Places API (New) Text Search

**Files:**
- Create: `backend/api/src/services/placeProviders/googleProvider.ts`
- Test: `backend/api/src/__tests__/services/googleProvider.test.ts`

**Interfaces:**
- Consumes: `PlaceProvider` (Task 1).
- Produces: `googleProvider` (consumed by Task 3's chain).

Request shape, verified live 2026-08-12:

```
POST https://places.googleapis.com/v1/places:searchText
X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>
X-Goog-FieldMask: places.id,places.displayName,places.location,places.primaryType
{
  "textQuery": "<query>",
  "maxResultCount": 10,
  "rankPreference": "DISTANCE",
  "locationBias": { "circle": { "center": { "latitude": <lat>, "longitude": <lng> }, "radius": 50000.0 } }
}
```

- [x] **Step 1: Write the failing test** using the real captured payload for "Melaleuca" (two results: 590 Paiea St `store` 21.3366/‑157.9150; 500 Ala Moana Blvd #4480 `cosmetics_store` 21.3011/‑157.8623). Assert two `ProviderCandidate`s with `google:` -prefixed ids.
- [x] **Step 2: Assert the key-absent contract** — with `GOOGLE_PLACES_API_KEY` unset, `search()` returns `[]` and does **not** throw or fetch. The whole feature must degrade, never crash.
- [x] **Step 3: Implement**, with a 5 s `AbortSignal.timeout` matching the OSM call. Non-200 → log and return `[]`; a provider outage must never fail a note save.
- [x] **Step 4: Field mask discipline** — request `formattedAddress` **only** when the caller signals it is about to ask the user (Task 4). Address pushes the request into a costlier SKU and is needed only for the confirm sheet. Exposed as `search(query, near, opts?: { withAddress?: boolean })`.
- [x] **Step 5: Verify** — `npx tsc --noEmit` clean; `npm test` 58 suites / 384 tests (was 57/371 — the 13 new ones).

**Implementation notes for Task 3's author:**
- The key is read at **call time**, not module scope — a key added to Railway takes effect on the next request, and tests can vary it per-case. Do not "optimise" it into a module constant; that reintroduces the restart-ordering hazard `test-setup.ts` documents for `OPENAI_API_KEY`.
- Tests additionally pin: key travels in `X-Goog-Api-Key` (never the URL, where it would land in request logs); a zero-result search returns `{}` with **no `places` key** (live-verified shape); `rankPreference`/`locationBias` are omitted entirely when there is no anchor; `relevance` stays `undefined` so Google candidates score at the neutral 0.5.

---

### Task 3: Anchors, chain, and candidate arbitration

The behavioural core. Everything else is plumbing around it.

**Files:**
- Create: `backend/api/src/services/placeAnchors.ts`
- Create: `backend/api/src/services/candidateArbitration.ts`
- Modify: `backend/api/src/services/placeResolutionService.ts`
- Test: `backend/api/src/__tests__/services/placeAnchors.test.ts`
- Test: `backend/api/src/__tests__/services/candidateArbitration.test.ts`

**Interfaces:**
- Produces: `resolveAnchors(userId, noteText, recordedAt?): Promise<Anchor[]>` and
  `arbitrate(query, candidates): { verdict: 'none'|'single'|'ambiguous'|'chain'; locations: ProviderCandidate[] }` — consumed by Task 5.

- [x] **Step 1: Write the failing arbitration tests** from the captured API data. These four cases are the specification:
  - `Melaleuca` (2 rows, exact-name, 6.9 km apart) → `ambiguous`, 2 locations.
  - `Foodland` (20 rows incl. "Ewa Town Center", "Waikiki Market", "Kapolei Village Center") → `chain`; the three non-matching names are filtered out before counting.
  - `Costco` (20 rows incl. gas station, food court, tire centre, pharmacy, optical, bakery sharing warehouse addresses) → `chain` with **5** locations, no department name surviving, "Costco Wholesale" at all four warehouse clusters.
  - `[]` → `none`.
- [x] **Step 2: Implement `arbitrate`** in three ordered stages — (a) name filter: exact or query-as-whole-word-prefix ("Long" does not claim "Longs Drugs"); (b) co-location collapse: 300 m, any-member linkage; (c) count → `single` (1) / `ambiguous` (2) / `chain` (≥3). **Deviation:** the representative is picked by *name frequency across the result set* (ties → shorter name), not "closest name to the query" — by edit distance "Costco Bakery" beats "Costco Wholesale", while frequency exploits the fact a chain repeats its primary name at every branch.
- [x] **Step 3: Write the failing anchor tests** — a note naming a region ("the Foodland in Hilo") anchors on Hilo; a mainland recording with no named region anchors on the home centroid; a user with no history yields only the current-location anchor. Plus: a *shop* that geocodes from a region token must not anchor (category gate); a lone Vegas trip must not drag the modal fallback; no history + no location → `[]`, never a throw.
- [x] **Step 4: Implement `resolveAnchors`** in priority order: region named in the note → current location → home region. Home = centroid of manual geofences and places, falling back to the *modal ~5 km cell* of the last 50 sessions (modal, not mean — one trip must not drag the centroid into the ocean). **Two refinements over the plan text:** recorded *at home* → current-location anchor only (home would re-search the same 50 km circle); recorded *away* → home first but current kept second, so a genuinely local errand while travelling still resolves after home misses. Caching on `hub.users` deferred to Task 4's migration as planned — currently computed per call (2 indexed selects).
- [x] **Step 5: Chain the providers** — new `searchPlaceCandidates(query, anchors, opts?)` returning `{provider, anchor, candidates}`; per anchor OSM→Google, first hit wins, short-circuit never merge. `resolvePlaceNameMulti` became a compatibility wrapper (bare userLocation → one current_location anchor), so existing callers gained the Google fallback with no signature churn; Task 5 moves the pipeline onto the full anchor list.
- [x] **Step 6: Replace the hard bound with the distance gate** — a candidate survives within 100 km of *any* anchor (not just the winning one); an anchor whose candidates all gate out counts as a miss and the chain continues; zero anchors → gate stands down (scoring's own >100 km clamp still applies). `bounded=1` kept per-anchor inside `osmProvider`.
- [x] **Step 7: Verify** — `npx tsc --noEmit` clean; `npm test` 61 suites / 414 tests (was 58/384 — +30: 9 arbitration, 12 anchors, 9 chain). `placeMatching.test.ts` and `reapInferredGeofences.test.ts` untouched and green. `resolvePlaceName` (zero callers, flagged in Task 1's deviation note) deleted.

**Note for Task 5's author:** `placeAnchors` imports `haversineKm` from `placeResolutionService` at runtime; `placeResolutionService` imports `Anchor` from `placeAnchors` **type-only** — keep it that way or you create an import cycle.

---

### Task 4: Migration 018 + `PlaceLookup` model

**Files:**
- Create: `backend/api/src/db/migrations/018_place_lookups.sql`
- Create: `backend/api/src/models/PlaceLookup.ts`
- Test: `backend/api/src/__tests__/models/placeLookup.test.ts`

- [x] **Step 1: Write the migration** — `hub.place_lookups` and `hub.place_provider_cache` per the spec, plus `home_lat`/`home_lng`/`home_computed_at` on `hub.users`. Idempotent throughout; unique **expression index** on `(object_id, lower(query))` (a table `UNIQUE` constraint cannot hold an expression); pending partial index. **Deviation: no separate ignore table** — `status='dismissed'` rows ARE the ignore list, served by their own partial index on `(user_id, lower(query))`; one less table to drift out of sync.
- [x] **Step 2: Confirm it self-applies** — `migrate.test.ts` reads the real migrations directory, so 018 is inside its order/skip/failure assertions as of this commit; the boot-time runner applies it on deploy (failure = failed deploy, previous deployment keeps serving, by the runner's design). No psql by hand.
- [x] **Step 3: Model methods** — `create` (upsert on the conflict target, guarded `WHERE status='pending'` so re-processing a transcript can never resurrect a resolved/dismissed row), `findById`, `findPendingByUser`, `findByObject`, `markResolved`/`markDismissed` (both pending-only), `findRetryable`, `isQueryIgnored`.
- [x] **Step 4: Provider cache** — `PlaceProviderCacheModel.get/put`, 30-day TTL enforced in the SQL, wired into `searchPlaceCandidates`. Contracts pinned by tests: a cached `[]` is an answer ("this provider has nothing here" — no re-fetch); the **raw** response is cached and the distance gate re-applies per read (the gate depends on the anchor set, which varies); `withAddress` bypasses in both directions (cheap-mask entries lack addresses; sheet-bound lookups must not poison the cache); unanchored searches bypass (no cell to key on); cache outage degrades to a live call.
- [x] **Step 4b (carried over from Task 3): home-region cache live** — `computeHomeRegion` now reads `hub.users.home_*`, recomputes past 7 days, writes back. Null centroids are deliberately never cached, so a user's first manual geofence gives them a home region immediately rather than a week later.
- [x] **Step 5: Verify** — `npx tsc --noEmit` clean; `npm test` 62 suites / 434 tests (was 61/414 — +9 model, +7 chain-cache, +4 home-cache).

---

### Task 5: Wire arbitration into `placeService`

**Files:**
- Modify: `backend/api/src/services/placeService.ts`
- Test: `backend/api/src/__tests__/services/placeResolutionOutcomes.test.ts`

- [x] **Step 1: Write the failing outcome tests** (`placeResolutionOutcomes.test.ts`, 11 tests) — for each arbitration verdict, exactly what gets written: `single` → place + geofence; `chain` → nearest 3 of 4 with the far branch excluded by id; `ambiguous` → **no place, no geofence**, one pending row with both candidates; `none` → one pending row, no candidates. `arbitrate` and the confidence scoring are deliberately REAL in these tests — only I/O is mocked.
- [x] **Step 2: Branch `resolveAndLinkPlace` on the verdict.** Steps 1/1b untouched and pinned by a test (manual match short-circuits before any anchor or search work). Added step 1c: the ignore list — a dismissed word never reaches the geocoder again.
- [x] **Step 3: Replace the `PLACE_UNRESOLVABLE` dead end** with a pending-row write. **Addition:** on `ambiguous`, a second `withAddress` search enriches the stored candidates — the sheet needs addresses to tell two same-name rows apart, and this is exactly the "about to ask the user" case the field-mask discipline was built for. Best-effort: bare candidates still queue if the second pass fails. A failed queue write is logged, never thrown — other names on the note still process.
- [x] **Step 4: Persist lifecycle events.** New `ReminderLifecycleEventModel.record` (never throws); `logLifecycle` now console-logs AND persists, with `userId` added to every call site so the diagnostics endpoint's per-user filter actually matches. New events wired: `PLACE_PROVIDER_FALLBACK` (google answered), `PLACE_NEEDS_USER`; `PLACE_USER_RESOLVED`/`PLACE_LOOKUP_DISMISSED` reserved for Task 6. `PLACE_UNRESOLVABLE` kept in the type union for historical rows, no writer.
- [x] **Step 5: Verify** — `npx tsc --noEmit` clean; `npm test` 63 suites / 445 tests (was 62/434 — the 11 outcome tests).

**Deviations & notes:**
- `resolvePlaceNameMulti` is gone (Task 3's compat wrapper included) — `placeMatching.test.ts` and `reapInferredGeofences.test.ts` were migrated to the `searchPlaceCandidates` seam with every behavioural assertion preserved; the reap test's arbitration + scoring now run REAL through the geocode path.
- `resolveObjectPlaces` gained an optional `noteText` param, threaded from both transcriptProcessing call sites (transcript on the degraded path, the object's own text on the parsed path) — this is what feeds named-region anchoring ("the Foodland in Hilo").
- Jest gotcha recorded for future editors: `clearAllMocks` keeps implementations, so per-test `mockResolvedValue` leaks into later describes — outcome tests re-pin defaults in the global `beforeEach`.

---

### Task 6: Pending-lookup API

**Files:**
- Modify: `backend/api/src/routes/places.ts`
- Modify: `backend/api/src/services/geofenceService.ts` (`PlaceOverviewItem`)
- Modify: `backend/api/src/services/placeService.ts` (resolve/dismiss handlers)
- Test: `backend/api/src/__tests__/routes/placesPending.test.ts`

- [x] **Step 1: Write the failing tests** — service level (`placePendingLookups.test.ts`, 13) covering ownership (403), unknown row (404), already-handled (409), plus route level (`placesPendingRoute.test.ts`, 10) covering the three body shapes, a 400 for none-of-the-above, and forwarding of service rejections.
- [x] **Step 2:** `GET /api/v1/places/pending` — rows with note previews (title-or-content, 80-char cap) and per-candidate `distanceKm` from the recorded point; `[]` short-circuits before touching objects.
- [x] **Step 3:** `POST /pending/:id/resolve` with the three shapes. All three converge on a **manual** geofence (reusing a same-name manual one when present) so the name-match step answers every future mention — the teach-once promise. Coordinates resolve under the SPOKEN name, not the provider's, for the same reason. Notes link via `geofence_objects`, mirroring `promotePlaceToGeofence` and for the same reason (that is the table manual detail views read). `markResolved` takes `placeId: null` for the existing-geofence shape. Emits `PLACE_USER_RESOLVED` with the method used.
- [x] **Step 4:** `POST /pending/:id/dismiss` — the dismissed row itself is the ignore-list entry (Task 4's design), so there is no list to append to; emits `PLACE_LOOKUP_DISMISSED`.
- [x] **Step 5: Extend `PlaceOverviewItem`** with `kind: 'pending'` + `query`/`candidates`, rendered FIRST in the overview — a one-tap question outranks rows that already work. Pending rows come via `PlaceLookupModel` (not a fourth inline query) so the overview tests' ordered `queryMany` mocks stay valid; both overview test files gained the model mock.
- [x] **Step 6: Verify** — `npx tsc --noEmit` clean (one cast where this zod version's union inference widens members to optionals); `npm test` 65 suites / 469 tests (was 63/445 — +13 service, +10 route, +1 overview).

---

### Task 7: Push honesty

**Files:**
- Modify: `backend/api/src/services/transcriptProcessingService.ts`
- Modify: `mobile/App.tsx`
- Test: `backend/api/src/__tests__/services/transcriptProcessing.test.ts`

- [ ] **Step 1: Write the failing test** — a note whose place could not be resolved must NOT report an armed arrival.
- [ ] **Step 2: Split the flag.** `hasGeofenceCandidates` currently means "we tried", not "we succeeded", so the client shows the Always-permission sheet for reminders that do not exist. Replace with `arrivalArmed: string[]` (names that produced a geofence) and `needsLocation: string[]` (names that queued a lookup). Keep `hasGeofenceCandidates` in the payload as `arrivalArmed.length > 0` for older installs.
- [ ] **Step 3: Gate the escalation sheet on `arrivalArmed`** in `App.tsx`; route `needsLocation` to the pending sheet instead.
- [ ] **Step 4: Completion push copy** — when `needsLocation` is non-empty, body becomes "Tap to set where Melaleuca is", deep-linking to the sheet.
- [ ] **Step 5: Verify** — `npx tsc --noEmit`, `npm test`.

---

### Task 8: Mobile — ask the question

**Files:**
- Modify: `mobile/src/screens/PlacesScreen.tsx`
- Create: `mobile/src/components/SetPlaceLocationSheet.tsx`
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (note-detail chip)
- Modify: `mobile/src/services/api.ts`

- [ ] **Step 1: API client methods** — `getPendingPlaces`, `resolvePendingPlace`, `dismissPendingPlace`.
- [ ] **Step 2: "Needs a location" section** in `PlacesScreen`, rendered **first**, above "Your places" and "Detected places" (the sections array at `PlacesScreen.tsx:36`).
- [ ] **Step 3: `SetPlaceLocationSheet`** — candidate rows (name, address, distance), then "Use my current location", "Pick on the map" (reuses `CreateGeofenceScreen` with the name pre-filled), "Not a place". Follow Deep Lagoon tokens from `mobile/src/theme`; coral is record-only, so it must not appear here.
- [ ] **Step 4: Note-detail chip** — `📍 Melaleuca — set location` on any note with a pending lookup, opening the same sheet.
- [ ] **Step 5: Fan-out visibility** — a chain note shows `📍 3 Foodlands armed ›`, opening the same sheet with branches removable. Visible and correctable without a blocking question.
- [ ] **Step 6: Verify on the simulator** per `offload-simulator-driving` — Release build, record a Melaleuca note, confirm the section appears, tap through both resolution paths.

---

### Task 9: Backfill and rollout

- [ ] **Step 1: Deploy Tasks 1–8** with `GOOGLE_PLACES_API_KEY` still absent. Everything unresolvable queues; confirm a pending row appears for a fresh Melaleuca note and that nothing regressed for Costco/Foodland.
- [ ] **Step 2: Confirm the key is live** — `railway variables --service brain-dump --environment production` should list `GOOGLE_PLACES_API_KEY`. It was **not** present as of 2026-08-12; check it did not land on the similarly-named Vercel project by mistake.
- [ ] **Step 3: Re-run pending rows** created before the key existed (`findRetryable`), so notes already recorded get their places.
- [ ] **Step 4: Field-test** per the arrival-reminder protocol — record a Melaleuca note, resolve it to 590 Paiea St, drive there, confirm the ping. This is the only step that proves the whole chain.
- [ ] **Step 5: Watch cost** — the free monthly allotment plus the provider cache should keep this near zero. Reassess after the TestFlight run; add a hard per-API daily quota if volume surprises.

---

## Out of scope

- LLM-suggested candidates via the existing `ANTHROPIC_API_KEY` (spec: "Alternative considered"). Only after Tasks 1–8, behind its own flag, and it may never arm a geofence — suggestions require a tap.
- Per-user ASR vocabulary from resolved lookups (spec: Open Question 1).
- Pending-row cleanup when a note is completed (spec: Open Question 2) — deletion already cascades; completion needs a sweep alongside `reapEmptyInferredGeofences`.
