# Phase 8.2 — Time Triggers: Design

**Date:** 2026-07-01
**Status:** Approved
**Roadmap:** Phase 8 Memory Layer, slice 2 ("Time triggers — highest-ROI new trigger")

## Problem

The parser already captures `temporal_hints` (`has_date`, `date_text`, `urgency`) on every atomic object, but `date_text` is free text ("Friday", "tomorrow at 2pm") that is never resolved to a timestamp and never fires anything. A note like "remind me to call the dentist Friday" is captured and then sits inert. This slice makes spoken dates actually remind.

## Scope (decided in brainstorm)

- **Push only.** Server job fires an Expo push at the right time with the note text, deep-linking to the note. No new mobile screens.
- **Actionable types only.** Only `task`, `reminder`, and `commitment` objects get reminders. Journal/reference/idea/preference/concern notes never fire, even with dates.
- **Date-only defaults to 9:00 AM HST** on the day itself.
- **New notes only.** No backfill of existing production notes (old `date_text` values are relative to when they were spoken; resolving them now would mostly produce wrong/past dates).
- **Deterministic parsing via chrono-node** at ingest in the backend. No LLM, no ml-service changes — avoids the 4-layer `object_type`-style contract drift trap from Phase 8.1.

### Non-goals (explicitly deferred)

- Recurring reminders, re-nagging after the single fire
- Snooze / edit-remind_at UI
- Per-user timezones (single-user app; HST hardcoded, same as `weeklySynthesisJob`)
- Vague-phrase handling ("soon", "eventually", "next few weeks") — unparseable text simply produces no reminder
- Backfill of existing notes

## Design

### 1. Data model — migration 016 (`016_time_triggers.sql`)

Two columns on `hub.atomic_objects`:

```sql
ALTER TABLE hub.atomic_objects ADD COLUMN remind_at TIMESTAMPTZ NULL;
ALTER TABLE hub.atomic_objects ADD COLUMN reminder_fired_at TIMESTAMPTZ NULL;
CREATE INDEX idx_atomic_objects_pending_reminders
  ON hub.atomic_objects (remind_at)
  WHERE remind_at IS NOT NULL AND reminder_fired_at IS NULL;
```

- `remind_at` — resolved fire time (UTC instant).
- `reminder_fired_at` — set when the push succeeds; per-row idempotency. This job does NOT use `hub.job_state` (that's for singleton crons like the weekly digest; here idempotency is naturally per-row).
- Partial index keeps the poll query cheap regardless of table growth.
- Applied manually to prod before deploy (established migration workflow).

### 2. Ingest parsing — `backend/api/src/services/temporalTrigger.ts`

Pure function, single source of truth, mirroring the `memoryIntent.ts` pattern:

```ts
deriveRemindAt(input: {
  dateText: string | null;
  objectType: ObjectType;
  createdAt: Date;   // reference instant for relative phrases
}): Date | null
```

Rules:
1. Non-actionable `objectType` (anything other than `task`/`reminder`/`commitment`) → `null`.
2. Empty/null `dateText` → `null`.
3. Parse with chrono-node: `chrono.parseDate(dateText, { instant: createdAt, timezone: -600 }, { forwardDate: true })`. HST is fixed UTC-10 with no DST, so a constant offset is correct year-round.
4. `forwardDate: true` — "Friday" always resolves to the *coming* Friday relative to note creation, never a past one.
5. If chrono reports no certain hour (date-only mention), set the time to **09:00 HST** that day.
6. Result in the past relative to `createdAt`, or unparseable text → `null`. The note saves normally either way; a null `remind_at` is not an error.

Call site: `AtomicObjectModel.create` (same place the `memoryIntent` derivation happens), so every ingest path (voice pipeline, direct object creation) gets it for free. `remind_at` is code-derived — the ml-service contract is untouched.

New dependency: `chrono-node` in `backend/api`.

### 3. Firing job — `backend/api/src/jobs/timeReminderJob.ts`

Mirrors the existing `setInterval` job pattern (registered alongside `weeklySynthesisJob` etc. at server start).

- **Tick:** every 5 minutes. A 9:00 AM reminder lands by ~9:05 — acceptable for voice-note reminders.
- **Poll query:**
  ```sql
  SELECT ... FROM hub.atomic_objects
  WHERE remind_at <= now()
    AND reminder_fired_at IS NULL
    AND state IN ('open', 'active')
    AND object_type IN ('task', 'reminder', 'commitment')
    AND deleted_at IS NULL
  ```
  Resolving/archiving a note before its time silently cancels the reminder — no extra cancel logic needed.
- **Per matching row:**
  1. `pushService.sendToUser(user_id, { title: '⏰ Reminder', body: <first line of content>, data: { screen: 'Objects', objectId } })`
  2. Set `reminder_fired_at = now()` **only if the push call succeeds**; on failure, leave it null so the next tick retries. (`pushService.sendToUser` currently swallows errors — it must signal success/failure to this caller; see Error handling.)
- **Fires once per note.** No re-nag in this slice.
- **Naturally multi-user:** the query carries `user_id` per row — no hardcoded user ID (unlike the digest job's `WEEKLY_DIGEST_USER_ID`).

### 4. Mobile — deep link (OTA-able)

One addition to the notification-tap router in `mobile/App.tsx`:

```ts
} else if (data?.screen === 'Objects' && data?.objectId) {
  navigationRef.navigate('Objects', { objectId: data.objectId });
}
```

`ObjectsScreen` already opens the detail view from `route.params.objectId` (`initialObjectId`) — no screen changes needed. Ships via `eas update` to the preview channel (with `.env` + `--clear-cache`, per established OTA workflow).

## Error handling

- **Parse failures are silent and safe:** any chrono miss → `remind_at = null`, note saves normally.
- **Push failure → retry next tick** via the unfired flag. `sendToUser` currently swallows errors internally; it needs to expose success/failure (return boolean or throw) so the job can decide whether to mark fired. Existing digest-job call site must keep its current swallow-and-continue behavior.
- **Duplicate-fire protection:** the `reminder_fired_at` flag; the 5-minute serial tick makes overlapping runs a non-issue in practice.
- **Job errors** are caught per-tick and logged, never crash the process (same as existing jobs).

## Testing

- **Unit — `deriveRemindAt`:** weekday forward resolution ("Friday" from a Tuesday → +3 days), "tomorrow at 2pm" keeps the explicit hour, date-only → 09:00 HST (19:00 UTC), past-resolving text → null, unparseable ("soon") → null, non-actionable type → null, null dateText → null.
- **Unit — job:** poll filter excludes resolved/archived/deleted/already-fired rows; `reminder_fired_at` set on push success only; push failure leaves the row eligible for the next tick.
- **Contract:** `AtomicObjectModel.create` persists a derived `remind_at` for an actionable note with a date, and null for a journal note with a date.
- **On-device after ship:** record "remind me to call the dentist tomorrow at 2pm" → verify `remind_at` in prod DB → verify push arrives and tapping it opens the note detail.

## Files touched

| Area | File | Change |
|---|---|---|
| DB | `backend/api/src/db/migrations/016_time_triggers.sql` | new |
| Service | `backend/api/src/services/temporalTrigger.ts` | new (pure) |
| Model | `backend/api/src/models/AtomicObject.ts` | persist + expose `remind_at`/`reminder_fired_at`, call `deriveRemindAt` in `create` |
| Job | `backend/api/src/jobs/timeReminderJob.ts` | new; register at server start |
| Push | `backend/api/src/services/pushService.ts` | `sendToUser` signals success/failure |
| Mobile | `mobile/App.tsx` | `Objects` + `objectId` deep-link branch |
| Deps | `backend/api/package.json` | add `chrono-node` |
