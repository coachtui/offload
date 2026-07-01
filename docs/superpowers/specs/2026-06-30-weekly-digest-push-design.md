# Weekly Digest Push — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan
**Slice of:** Phase 7 completion + shared foundation for Phase 8 (proactive resurfacing)

## Summary

The weekly synthesis engine and UI already exist (`generateWeeklySynthesis`, `SynthesisScreen`), but it is **pull-only** — the user must open the app to see it. This slice makes it **proactive**: a scheduled backend job generates the weekly synthesis and delivers a **push notification** when it's ready. It also introduces the first **server→device push infrastructure** (there is currently none — all notifications are local/on-device), which Phase 8's contextual resurfacing will reuse.

## Goals

- Deliver the weekly synthesis via push notification, once a week, without the user opening the app.
- Stand up reusable server→device push infrastructure (token registration + send service).
- Generate the synthesis *before* the push so the digest is ready when tapped.

## Non-Goals (v1)

- On/off toggle / notification preferences UI (deferred to Phase 8 trust controls).
- Per-user timezones and multi-user scheduling (single-user now; data model stays multi-user-friendly).
- The richer "Weekly Memory Brief" sections — People to Follow Up, Places w/ Open Items, Decisions, Stale Items (depend on Phase 8 primitives).
- Generalized push fan-out beyond the weekly-digest consumer (the service is reusable, but the digest is its only caller in v1).

## Context / Decisions

- **Single user** (personal app). Cron fires for the one user, one timezone.
- **Delivery time:** Sunday ~18:00 **HST** (UTC−10, no DST → Monday 04:00 UTC).
- **Default on**, no toggle in v1.
- **Expo project ID** exists: `6444b92a-4608-4106-8a94-5764a457cb72` (owner `talailima`) — required for `getExpoPushTokenAsync`.

## Architecture / Components

### 1. Push token registration
- **Mobile:** after successful login (and on app start when authenticated), request notification permission (already wired via the geofence flow), then `Notifications.getExpoPushTokenAsync({ projectId })`. POST the token to the backend. Re-register on token change.
  - New: `apiService.registerPushToken(token, platform)`.
- **Backend:** `POST /api/v1/push/register` `{ token, platform }` (authenticated). Upserts into a new table.
  - **`hub.push_tokens`**: `id uuid pk`, `user_id uuid fk`, `token text unique`, `platform text` (`'ios'|'android'`), `created_at`, `updated_at`. Unique on `token`; a user may have multiple devices. Raw-SQL migration in `backend/api/src/db/migrations/` (the place/geofence migration system), applied to prod via the documented `psql` flow.
  - **`hub.job_state`** (also created in this migration): `job_name text primary key`, `last_run_at timestamptz`. Generic scheduled-job dedup marker; the weekly digest uses `job_name = 'weekly_digest_push'`.

### 2. Reusable push service — `backend/api/src/services/pushService.ts`
- `sendToUser(userId, { title, body, data }): Promise<void>`
  - Look up all `push_tokens` for the user.
  - POST to Expo Push API `https://exp.host/--/api/v2/push/send` (batchable array of messages: `{ to, title, body, data, sound: 'default' }`).
  - Parse the ticket response; on `DeviceNotRegistered` (or `InvalidCredentials` for a token), delete that token row so dead tokens don't accumulate.
  - Never throws to the caller — logs and swallows (a failed push must not crash the cron).

### 3. Weekly cron — `backend/api/src/jobs/weeklySynthesisJob.ts` (mirrors `monthlyLongTermSynthesisJob.ts`)
- Hourly `setInterval` (`CHECK_INTERVAL_MS = 60*60*1000`).
- On each tick, compute HST from UTC (`utcHour − 10`, wrapping the day). If **day == Sunday && hstHour == 18**:
  - **Dedup:** a dedicated **`hub.job_state`** table — `job_name text primary key`, `last_run_at timestamptz`. The job reads `weekly_digest_push`'s `last_run_at`; it fires only if that timestamp is null or falls in a **prior ISO week** (compare ISO year+week in HST). On success it upserts `last_run_at = now()`. This prevents double-sends from overlapping 18:00-hour ticks and is reusable by other scheduled jobs.
  - Call `generateWeeklySynthesis(userId)` (existing; has same-day cache so re-gen is safe).
  - Build counts from the result (accomplished / still-open).
  - `pushService.sendToUser(userId, { title: '🧠 Your weekly brief is ready', body: '<n> accomplished · <m> still open', data: { screen: 'Insights' } })`.
  - Record the marker.
- Wire the job's `start()` into `backend/api/src/index.ts` beside the existing jobs (embeddingRetry, retention, importanceScore, monthlyLongTermSynthesis).

### 4. Delivery + tap handling (mobile)
- Notification content: title `🧠 Your weekly brief is ready`, body with counts, `data: { screen: 'Insights' }`.
- Tap: `App.tsx`'s existing `handleNotificationData` routes `data.screen` → the `Insights` route = `SynthesisScreen`. No new navigation code; confirm `Insights` maps to `SynthesisScreen` (it does in `AppNavigator`).
- Because the synthesis is generated before the push, opening the screen shows the ready digest (its normal `getSyntheses()` fetch returns today's cached synthesis).

## Data Flow

```
[Sunday 18:00 HST tick]
  weeklySynthesisJob → generateWeeklySynthesis(userId)  (existing, cached)
                     → pushService.sendToUser(userId, {title, body, data:{screen:'Insights'}})
                         → Expo Push API → device
[User taps notification]
  App.tsx handleNotificationData({screen:'Insights'}) → navigate SynthesisScreen
  SynthesisScreen getSyntheses() → shows today's synthesis
[App login/start]
  getExpoPushTokenAsync → POST /push/register → hub.push_tokens (upsert)
```

## Error Handling / Edge Cases

- No registered token → `sendToUser` no-ops (logs), cron still records the marker (nothing to deliver).
- Expo returns `DeviceNotRegistered` → delete that token.
- Synthesis generation fails → log, do not push, do not set the marker (so a later manual run can retry); must not crash the job loop.
- Duplicate ticks in the 18:00 hour → ISO-week marker prevents a second push.
- Permission not granted on device → `getExpoPushTokenAsync` throws; catch and skip registration (no crash); user simply won't get pushes until granted.

## Testing

- **Unit — `pushService`:** token lookup, Expo message payload shape, `DeviceNotRegistered` → token deletion, swallow-on-error.
- **Unit — cron time logic:** "should fire" is true only at Sunday-18-HST; weekly dedup marker prevents re-fire; injected clock (no `Date.now()` in test-unfriendly spots).
- **Manual/dev:** a dev-only trigger (`POST /api/v1/push/test` or a guarded flag) to send the digest immediately, to verify token registration + Expo delivery + tap-to-SynthesisScreen on a real device without waiting for Sunday.

## Files

- New: `backend/api/src/services/pushService.ts`, `backend/api/src/jobs/weeklySynthesisJob.ts`, `backend/api/src/routes/push.ts`, `backend/api/src/db/migrations/0NN_push_tokens.sql`, tests under `backend/api/src/__tests__/`.
- Edit: `backend/api/src/index.ts` (register route + start job), `mobile/src/services/api.ts` (`registerPushToken`), mobile push-token registration on login (likely `AuthContext` or App start), possibly `mobile/App.tsx` (confirm `Insights` deep-link).
- Reuse: `generateWeeklySynthesis`, `SynthesisScreen`, existing notification-permission flow, the raw-SQL migration + prod-apply process (see `infra_reference`).

## Rollout

- Backend deploys via push to `main` (Railway auto-deploy). Apply the `push_tokens` migration to prod via the documented `psql` flow.
- Mobile ships via `eas update` (preview channel) with `--clear-cache`; verify bundle.
- Verify end-to-end with the dev trigger before relying on the Sunday cron.
