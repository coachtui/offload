# Architecture

How Offload is put together, and why it's put together that way.

For day-to-day setup and commands see [CLAUDE.md](./CLAUDE.md). For current
project state see [`plans/current-phase.md`](./plans/current-phase.md).

---

## The problem the architecture is solving

Offload's product promise is that a note comes back to you *at the moment it's
useful*. Almost every architectural decision here follows from taking that
literally:

- The moment a reminder is due is the **worst** possible moment to depend on the
  network. So reminders fire from the device, not from a server push.
- A person mid-thought will not wait on a spinner. So the save path returns
  immediately and all interpretation happens afterward.
- A note only comes back usefully if the system understood what *kind* of thing
  it was. So classification is a first-class step with its own rules, not a
  side effect of parsing.

## Components

```
┌──────────────────────────────┐
│  mobile  (React Native/Expo) │  iOS · EAS · TestFlight
│  • records + live transcript │
│  • OS geofence registration  │──── Deepgram WebSocket (live preview)
│  • local notification sched. │
└───────────┬──────────────────┘
            │ REST /api/v1  (JWT)
┌───────────▼──────────────────┐
│  backend/api  (Node/Express) │  Railway · auto-deploy on main
│  • auth, CRUD, RAG, places   │
│  • 8 background jobs         │
└──┬────────┬─────────┬────────┘
   │        │         │
   │        │         └──────────► Weaviate Cloud   (vectors)
   │        └────────────────────► PostgreSQL       (schema: hub)
   │
   └─► backend/ml-service (Python/FastAPI) · Railway
         POST /api/v1/parse-transcript → atomic objects

┌──────────────────────────────┐
│  frontend/web  (Next.js)     │  Vercel · useoffload.app
│  marketing only — no app fn  │
└──────────────────────────────┘
```

**Why a separate Python service.** Transcript parsing is prompt-heavy work with
its own model config, its own latency budget (90s for the LLM call), and its own
failure modes. Keeping it out of the API means a slow or failing parse degrades
one background step instead of holding an Express worker. The API's client
timeout is deliberately set *above* the ML service's internal budget (105s vs
90s) — nested budgets that don't decrease inward can never surface the inner
error, which is exactly the bug that existed when both were 60s.

**Why the web app has no product surface.** Web auth was removed in PR #40. The
value of Offload is proximity to the user's actual life — a browser tab is the
wrong place for it, and maintaining a second auth surface cost more than it
returned.

## Data model

PostgreSQL, schema `hub`:

| Table | Holds |
|---|---|
| `users` | account, timezone, terms acceptance |
| `sessions` | one recording — raw transcript, processing state |
| `atomic_objects` | the core entity: one discrete thing you said |
| `geofences` · `geofence_objects` | circular regions and what's pinned to them |
| `geofence_trigger_state` | per-region debounce/fire state |
| `places` · `object_place_links` · `place_trigger_state` | learned places, richer than raw geofences |
| `place_lookups` · `place_provider_cache` | pending name→location resolution, and geocoder cache |
| `relationships` | links between objects |
| `patterns` | synthesis output |
| `push_tokens` · `job_state` | delivery and scheduler bookkeeping |
| `reminder_lifecycle_events` | why a reminder did or didn't fire (diagnostics) |

An **atomic object** is the unit everything else hangs off. Beyond its text it
carries `object_type`, `domain`, actionability, temporal and location hints,
`embedding_status`, and the two derived fields that drive the whole proactive
layer:

- **`retention_policy`** — `until_done` (tasks, reminders, commitments),
  `long_term` (preferences, decisions), `decay` (concerns, journal,
  observations), `temporary` (everything else).
- **`trigger_context`** — `place`, `time`, or `none`.

Both are derived in `memoryIntent.ts`, which is the single source of truth and
is mirrored by the migration 014 backfill. If you change how a note comes back
to a user, you change it there.

### Migrations — two systems

`backend/api/migrations/*.ts` is node-pg-migrate (`001`–`005`, the original
set). `backend/api/src/db/migrations/*.sql` is plain SQL (`000`, `006`–`021`)
and is where all recent work lives; `npm run build` copies it into `dist/`.
**New migrations go in the SQL set.**

## The ingest path

`save-transcript` persists the raw transcript and returns. Everything below runs
in `transcriptProcessingService.ts`, off the request path, and is contractually
non-throwing — a session ends `completed` or `failed`, the transcript survives
either way, and a failed run is re-runnable.

1. **Parse** — ML service splits the transcript into atomic objects.
2. **Type entities** (`entityTyping.ts`) — people, places, dates.
3. **Classify** (`memoryIntent.ts`) — retention policy and trigger context.
4. **Resolve places** (`placeService.ts` → `placeResolutionService.ts`) — only
   when arrival rules say to.
5. **Write** — objects are inserted at `WRITE_CONCURRENCY = 5`. Bounded because
   each write is a Postgres insert plus a vector round trip, and a 30-wide burst
   from a five-minute note would starve live requests sharing the pool.
6. **Embed** — `text-embedding-3-small` into Weaviate. Failures are retried by
   the `embeddingRetry` job rather than blocking ingest.

## The trigger engine

This is the part that makes Offload different from a notes app, and the part
with the most hard-won rules.

### Arrival (place) triggers

**Detection** (`arrivalTrigger.ts`) — the parser's own `geofence_candidate` flag
keys off arrival phrasing and misses the most natural way to dictate an errand:
*"Go to Costco to buy chicken"* → true, but *"I need chicken from Costco"* →
false, same intent. Deterministic rules sit underneath as the safety net,
requiring **both** an errand verb *and* the place appearing as a destination.
Both halves matter — the verb alone sweeps in notes that merely mention places;
the destination alone sweeps in "cancel gym membership". Communication verbs
(call, email, text) are deliberately excluded: "call the Florida office" names a
place but isn't triggered by going there.

**Resolution** (`placeResolutionService.ts` + `placeProviders/`) — OpenStreetMap
first, Google as fallback, with confidence scoring and radius selection kept in
the shared module so adding a provider can't quietly change how candidates are
judged. Anything unresolvable goes to a **pending queue** the user can settle by
dropping a pin, rather than silently failing.

**Firing — fire-first, from the device.** The device holds a snapshot of open
notes and fires on region entry from that snapshot, with no remote dependency at
arrival time. This is a product decision, not an optimization: an arrival ping
that needs a round trip is an arrival ping that doesn't happen in a parking
garage.

**Reap and re-arm.** Regions are reaped when their note resolves, with a
stranded-region sweep as backstop. Region sync is **pure-shrink safe** — it
never re-registers on a shrink, because re-registration causes spurious iOS
ENTER events. See `mobile/src/services/geofenceSync.ts`.

### Time triggers

Dates are parsed with `chrono-node` at ingest and stored in the user's device
timezone (PR #49).

**The server scheduler** (`jobs/timeReminderJob.ts`) sleeps until the instant
the next reminder is due rather than polling. The previous 5-minute tick made
every reminder 0–5 minutes late with a phase that re-randomized on each deploy —
the difference between "9:00" meaning 9:00 and meaning "sometime after 9".
`AtomicObject.create` calls `rearmTimeReminderJob()` so a newly-created earlier
reminder pulls the wake-up in, and the scheduler never sleeps past `MAX_SLEEP_MS`
so a clock jump or out-of-band write heals itself.

Delivery is **claim-then-send**: a row is claimed before its push and marked
fired only on success. A failed push retries immediately, a crash mid-send
retries when the lease expires, and two concurrent runs can't double-push.

**The device owns the actual firing** (`mobile/src/services/timeReminderSync.ts`,
migration 021). The device schedules every pending reminder as a dated local
notification, then tells the backend which identifiers the OS *confirmed* — so
the claim is honest by construction, and anything it couldn't take (permission
denied, past iOS's pending-request budget) falls back to the server push
automatically instead of silently never firing. Local scheduling is also what
lets reminders break through Focus and Do Not Disturb, via the time-sensitive
entitlement.

### The invariant that ties it together

Closing a note must reap its geofence and cancel its scheduled notification;
reopening must re-arm both. Both live in the OS, not the server, so a state
change that skips the re-sync leaves the device firing for notes the user
already handled.

Every note-state mutation therefore goes through
`mobile/src/services/noteLifecycle.ts`, never `apiService` directly. The wrapper
exists specifically because the sync used to live in screens and two call sites
(decision review, bulk delete) were missed. The re-sync is unconditional (it
also refreshes the offline arrival snapshot) and fire-and-forget (the user's
action already succeeded; a failed sync must not surface as a failed mutation).

## Retrieval and synthesis

**Semantic search and RAG** — objects are embedded into Weaviate on write.
`/api/v1/rag/search` does retrieval; `/api/v1/rag/spar` builds a context pack
and asks an LLM (Claude Sonnet primary, GPT-4o fallback) to answer grounded in
the user's own notes with citations. `/api/v1/rag/contradictions` surfaces
conflicts between a new note and existing ones.

**Synthesis jobs** run weekly and monthly, looking for cross-domain patterns —
the "semantic bridge" idea: an efficiency noticed in one domain that applies in
another.

## Background jobs

Registered in `backend/api/src/index.ts`:

| Job | Does |
|---|---|
| `embeddingRetry` | re-embeds objects with `embedding_status = 'failed'` |
| `retentionJob` | hard-deletes soft-deleted objects after 30 days, hourly |
| `importanceScoreJob` | scores objects for surfacing priority |
| `weeklySynthesisJob` | weekly cross-domain digest |
| `monthlyLongTermSynthesisJob` | longer-horizon pattern pass |
| `timeReminderJob` | event-driven reminder scheduler (above) |
| `lifecycleJob` | note state transitions and decay |
| `transcriptRecoveryJob` | re-runs sessions whose processing failed |

## Auth

JWT (HS256), stored in Expo SecureStore on device, decoded client-side for
expiry. IP rate limiting on register/login/refresh. Account deletion
(`accountService.ts`) purges relational rows, vectors, and stored objects.

## Known gaps

- Weekly synthesis is still HST-fixed while `remind_at` is device-timezone.
  Mainland users exist, so this is a real correctness gap.
- Audio is not persisted. The S3/storage path exists and is exercised by the
  legacy WebSocket voice session flow, but the live Deepgram + `transcribe-audio`
  path never writes it. Intentional today; note it before building anything that
  assumes recoverable audio.
- `redis` is a dependency of `backend/api` that nothing imports.
- End-to-end encryption was designed in the original architecture and is not
  implemented.
