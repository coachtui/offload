# Offload

Voice-first proactive personal memory layer for iOS. You talk; the app splits what you said into
separate notes, files them, and gives each one back to you at the moment it's
useful — when you arrive somewhere, or when the time you mentioned comes.

Product line: **"Say it once. It's handled."**

Status: shipped to TestFlight external testers (ASC app `6799952861`), pending
public App Store release. Live state of the work is in
[`plans/current-phase.md`](plans/current-phase.md) — that is the living
document, keep it updated.

---

## Layout

```
backend/api/         Node + TypeScript + Express  → Railway   (the main API)
backend/ml-service/  Python + FastAPI             → Railway   (transcript → objects)
                     ^ does NO machine learning despite the name — it prompts
                       an LLM over HTTP. See backend/ml-service/README.md.
mobile/              React Native + Expo, iOS     → EAS/TestFlight
frontend/web/        Next.js                      → Vercel    (marketing only)
shared/types/        TypeScript types shared by api + mobile
plans/               Living project state
docs/                Current reference docs; docs/archive/ is history
```

`frontend/web` has **no app functionality** — landing page, privacy, terms, App
Store CTA. Web auth was removed deliberately (PR #40). Don't add product
features there.

## The pipeline, end to end

1. **Record** (`mobile/src/screens/RecordScreen.tsx`) — Deepgram streams over a
   WebSocket straight from the device for the live preview. Token comes from
   `GET /api/v1/voice/deepgram-token`, prefetched on mount so the record tap
   never pays the round trip.
2. **Final transcript** — on stop, raw audio is POSTed base64 to
   `POST /api/v1/voice/transcribe-audio` and re-transcribed with
   `gpt-4o-transcribe` (higher accuracy than the live pass), then swapped into
   the UI. `whisper-1` is the legacy path in the same service.
3. **Save** — `POST /api/v1/voice/save-transcript` persists the raw transcript
   and **returns immediately**. Everything after this is background
   (`transcriptProcessingService.ts`), so a five-minute note can take as long as
   it needs without a user waiting.
4. **Parse** — the API calls the Python ML service at
   `POST /api/v1/parse-transcript`, which splits the transcript into typed
   *atomic objects* (task, reminder, commitment, idea, question, concern,
   journal, observation, preference, decision, reference) with domain tags,
   entities, and temporal/location hints.
5. **Classify intent** (`memoryIntent.ts`) — derives `retention_policy`
   (`until_done` / `long_term` / `decay` / `temporary`) and `trigger_context`
   (`place` / `time` / `none`) from the object type and signals. This is the
   product's core rule; it decides how and whether a note comes back.
6. **Arm the trigger**
   - **Place** — `arrivalTrigger.ts` decides if the note is an errand naming a
     destination, then `placeResolutionService.ts` geocodes the name (OSM first,
     Google as fallback) and a geofence is created. Unresolvable names go to a
     pending queue the user can resolve by dropping a pin.
   - **Time** — `chrono-node` parses the date; the device schedules a local
     notification and claims it so the server push skips it.
7. **Embed** — every object is embedded (`text-embedding-3-small`) into Weaviate
   Cloud for semantic search, RAG ("Ask Offload"), and contradiction detection.

## Ask Offload threads are standing queries, not chat logs

A saved thread (`hub.conversations`, migration 023) stores the **opening
question**, the **object ids its answers were grounded in**, and a
**watermark** — not just a transcript. Reopening one does not replay it:
`conversationService.resumeConversation` diffs live object state against the
watermark and reports what resolved, what's still open, what was deleted, and
what's been captured since. The fresh sweep re-runs the *opening* query, since
that's the question the user came back for, even if the thread wandered.

The diff buckets are computed in SQL and code; the LLM only narrates buckets it
is handed. Never let it decide what was resolved — "you finished this" is a
claim that has to be true, and this is the same rule `synthesisService` follows
for its deterministic "Accomplished" list.

Follow-up turns replay history (`sanitizeTurns` in `sparringService.ts` makes a
stored thread safe to send), but retrieval is always fresh per turn — history
shapes phrasing, never what gets retrieved.

## Two rules that are easy to break

**Reminders fire from the device, never from the network.** The instant a
reminder is due is the worst possible time to need connectivity. Both arrival
and time reminders are scheduled with the OS from a device-side snapshot and
fire in airplane dead zones and mid-deploy. The backend push is the *fallback*
for what the device couldn't claim, not the primary path. See the headers in
`mobile/src/services/timeReminderSync.ts` and `arrivalLedger.ts`.

**All note state mutations go through `mobile/src/services/noteLifecycle.ts`.**
Never call `apiService` directly to change note state from a screen. Closing a
note reaps its geofence; reopening re-arms it; deleting does either at scale —
and each must be followed by an OS re-sync or the device keeps firing for notes
the user already closed. Two call sites (decision review, bulk delete) were
missed exactly this way when the sync lived in screens.

## Commands

```bash
# Backend API
cd backend/api
npm run dev            # tsx watch
npm test               # jest
npm run migrate        # node-pg-migrate up
npm run lint

# Mobile
cd mobile
npm start              # expo start --dev-client
npm test               # jest (minimal ts-jest for pure service logic, not jest-expo)
npm run typecheck      # tsc --noEmit — has 3 KNOWN pre-existing errors
                       # (api.ts, locationService.ts, websocket.ts); only a
                       # growing count is a regression
npm run build:prev     # EAS internal build, preview channel
npm run build:prod     # EAS production build
npm run update         # eas update --auto  (OTA)

# Web
cd frontend/web && npm run dev
```

## There is no local stack — and no Docker

Don't look for one, and don't add one casually. Both services build on Railway
with **nixpacks**; there is no Dockerfile in the repo. A `docker-compose.dev.yml`
existed from the first commit but was never used: `.railwayignore` excluded it
from every deploy, no `backend/api/.env` was ever created, and it went untouched
for the project's whole life. It was deleted rather than repaired.

The real loop is:

1. Push to `main` → Railway auto-deploys the API and, when
   `backend/ml-service/**` changed, the ML service.
2. `eas update` or an EAS build → the app on a real iPhone.
3. The app talks to the deployed Railway API. **Every** EAS profile, including
   `development`, points `EXPO_PUBLIC_API_URL` at the Railway URL.

If you do want to run the API on your machine, it needs a reachable Postgres and
Weaviate plus the keys in `.env.example` — point it at the Railway instances
rather than standing up local containers.

## Deploy loop

- **Backend** — Railway auto-deploys on merge to `main`.
- **Mobile, JS-only change** — `eas update --branch <preview|production>`. Ships
  OTA in minutes, no review. **OTA bundles are built with the LOCAL machine's
  env** — `EXPO_PUBLIC_*` vars come from the shell / `mobile/.env`, NOT from
  EAS environment variables (those cover cloud builds only). Publishing
  without `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in the local env ships the
  placeholder key and silently disables purchases on every device that
  applies the update — this happened once (2026-08-17). The key lives in
  `mobile/.env` (gitignored); if it's missing there, re-add it before any
  `eas update`. **And if an `EXPO_PUBLIC_*` value changed since the last
  bundle, pass `--clear-cache`**: Metro's transform cache keeps the old
  inlined value, so the same incident's *corrective* republish still shipped
  the placeholder until the cache was cleared.
- **Mobile, native change** — needs a full build + TestFlight submission.
  Anything touching **entitlements or permissions** additionally needs a
  regenerated provisioning profile *per distribution type*.
- **Web** — Vercel auto-deploys. The project is named `brain-dump`; the domain
  is `useoffload.app`.

Testing happens on a real iPhone via **EAS internal builds, not Expo Go** — the
app depends on background location, geofence monitoring, and local
notifications, none of which behave correctly in Expo Go. The full runbook for
launching and verifying the app (simulator Release builds, UI driving, the OTA
loop, confirming what a device actually runs) is the `run-app` project skill
(`.claude/skills/run-app/SKILL.md`).

## Migrations — two systems, know which

- `backend/api/migrations/*.ts` — node-pg-migrate, `001`–`005`. The original set.
- `backend/api/src/db/migrations/*.sql` — plain SQL, `000` and `006`–`021`. This
  is where all recent schema work lives; `npm run build` copies these into
  `dist/`. **New migrations go here.**

## Conventions

- Non-obvious code carries a header comment explaining *why*, including the
  failure mode that motivated it. This is the most valuable documentation in the
  repo — read the header before changing a service, and write one when you add
  a rule that isn't self-evident. Good examples: `noteLifecycle.ts`,
  `timeReminderJob.ts`, `arrivalTrigger.ts`, `placeResolutionService.ts`.
- Design tokens live in `mobile/src/theme` ("Deep Lagoon"). **Coral is the
  record affordance only** — never use it for generic accents.
- Shared types come from `shared/types`, imported as `@shared/types`.
- Background jobs are registered in `backend/api/src/index.ts` and live in
  `backend/api/src/jobs/` — 8 of them: embedding retry, retention, importance
  score, weekly synthesis, monthly long-term synthesis, time reminders,
  lifecycle, transcript recovery.

## Known rough edges

- `redis` is in `backend/api/package.json` but nothing imports it. Dead dep.
- `.env.example` is stale — it still describes Redis, MinIO, and a local Whisper
  toggle. Real config is Railway/EAS environment variables.
- Timezones are per-user everywhere that matters: `remind_at` uses the device
  timezone (PR #49) and the weekly digest fires Sunday 18:00 in each user's
  `last_seen_timezone` (PR #50; HST only as fallback for accounts predating
  timezone capture). The monthly synthesis job still runs on a fixed
  server-time "1st of the month" — month-granularity, so nobody has cared yet.

## At public App Store release

Set `APP_STORE_URL` in `frontend/web/lib/appStore.ts` to
`https://apps.apple.com/app/id6799952861`. Every site CTA upgrades itself from
the TestFlight link automatically.
