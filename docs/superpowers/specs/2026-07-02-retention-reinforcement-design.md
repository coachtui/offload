# Phase 8.4 — Retention & Reinforcement: Design

**Date:** 2026-07-02
**Status:** Approved
**Roadmap:** Phase 8 Memory Layer, slice 4 ("Retention/lifespan + real reinforcement")

## Problem

Two gaps make the memory layer behave like an append-only log instead of a memory:
1. **No reinforcement.** Saying "I still need to send Justin that quote" three times creates three fragments, none stronger than the others. `mention_count` only counts retrievals (AI context fetches), never re-captures. `evolved_from_id` (+ partial index) has existed since migration 008 and is completely dormant.
2. **No lifespan.** The retention policies captured in 8.1 (`until_done`/`temporary`/`long_term`/`decay`) are stored but enforced nowhere. Resolved tasks, fired reminders, and stale journal entries accumulate in the working set forever.

## Scope (decided in brainstorm)

- **Supersede chain** on re-capture: the new note is always saved (spoken words never discarded) and becomes the living version; the matched old note is auto-archived and linked via `evolved_from_id`; reinforcement (`mention_count`) carries forward +1.
- **Moderate lifecycle windows** (archive is reversible — archived notes remain searchable and reopenable via the existing state machine).
- **Backend-only.** Zero mobile/UI changes — a design refresh is planned and this slice must not collide with it.
- **Forward-only.** No backfill/dedupe sweep of historical duplicates (possible later fast-follow).

### Non-goals (explicitly deferred)

- User confirmation / trust controls (forget, always-remember, keep-but-don't-remind) — slice 8.5
- Any UI: supersede badges, chain history view, archive-reason display
- Changes to `importanceScoreJob` (it already weights mentions 40%; supersede inheritance feeds it automatically)
- Historical dedupe sweep
- Cross-type supersede (a task never supersedes a journal entry, etc.)

## Design

### 1. Supersede-on-recapture — `backend/api/src/services/reinforcementService.ts` (new)

**Where it runs:** inside the existing post-save relationship pass (`relationshipService.detectRelationships` call path) — the embedding is already stored by then, `findSimilar` is already computed there, and it adds zero latency to the save itself. NOT in the `createObject` hot path; NOT a batch job (reinforcement should be immediate).

**Gate — pure function `shouldSupersede(candidate, match)`, all conditions required:**
1. Vector similarity score **≥ 0.85** (`SUPERSEDE_MIN_SCORE`) — deliberately above the existing 0.75 "similar-relationship" and 0.6 "related-notes" thresholds.
2. Same `object_type` (exact match).
3. Same user.
4. Match state is `open` or `active`.
5. Match is not the candidate itself and is not already superseded (no other note has `evolved_from_id` pointing FROM it being archived — concretely: match.state check covers this since superseded notes are archived).
6. Candidate's type is in the supersede-eligible set: `task`, `reminder`, `commitment`, `concern`. (Preferences/decisions/journal/reference/idea/observation/question never supersede — restating a preference is not a duplicate errand.)

Only the **top-scoring** qualifying match is superseded (one supersede per capture).

**Action (ordering matters — new note first, so a crash cannot orphan the chain):**
1. New note: `evolved_from_id = match.id`, `mention_count = match.mention_count + 1`.
2. Old note: state → `archived` (with `state_updated_at = NOW()`), using the same direct-update mechanism other jobs use (server-side; the route-level transition guard applies to user requests, not system actions).
3. Log: `[reinforcement] note <new> supersedes <old> (score X, count N)`.

**Emergent behavior (by design, verify in tests):** if the old note had a pending `remind_at`, archiving cancels it (the time-reminder poll filters on open/active) while the new note derives its own fresh `remind_at` at ingest — re-speaking a commitment with a new date updates the reminder for free.

**Failure isolation:** the supersede pass is wrapped so any error is logged and swallowed — a reinforcement failure must never break note saving or relationship detection (same discipline as the geofence/notification side-effects).

### 2. Lifecycle enforcement — `backend/api/src/jobs/lifecycleJob.ts` (new)

Hourly `setInterval` job mirroring the existing pattern (`running` guard, per-run summary log). Set-based UPDATEs, each moving rows to `archived` with `state_updated_at = NOW()`; all exclude `deleted_at IS NOT NULL`:

| Rule | Filter | Window |
|---|---|---|
| Resolved done-items | `retention_policy = 'until_done'` AND `state = 'resolved'` | `state_updated_at` older than **7 days** |
| Fired reminders | `object_type = 'reminder'` AND `reminder_fired_at IS NOT NULL` AND `state IN ('open','active')` | `reminder_fired_at` older than **3 days** |
| Decayed notes | `retention_policy = 'decay'` AND `state IN ('open','active')` | `created_at` older than **90 days** AND (`last_accessed_at IS NULL OR last_accessed_at` older than 90 days) |

- `long_term` and `user_confirmed` policies: never touched by any rule.
- The existing `retentionJob` (30-day purge of soft-deleted) is unchanged and unrelated: lifecycle archives, retention purges deletions.
- Logs counts per rule each run; a run that archives nothing logs nothing beyond the summary at debug level.

### 3. Data model

**No migration.** Every column already exists: `evolved_from_id` (+ index, migration 008), `mention_count` (008), `retention_policy` (014), `state`/`state_updated_at` (008), `reminder_fired_at` (016), `last_accessed_at` (existing, bumped by `buildContextPack`).

### 4. Error handling

- Supersede errors logged + swallowed; save and relationship detection unaffected.
- Lifecycle job errors caught per-tick; `running` guard prevents overlap.
- Supersede ordering (new-first) means the worst crash artifact is a new note pointing at a still-open old note — harmless (the old note simply didn't archive; next re-capture supersedes it).

### 5. Testing

- **Unit — `shouldSupersede`:** each gate condition independently (score below threshold, cross-type, resolved match, self-match, non-eligible type, happy path top-match selection).
- **Unit — supersede action:** ordering (new updated before old archived); mention_count inheritance (+1); wrapped-error swallowing.
- **Unit — lifecycle rules:** each rule's SQL filter (mocked queries asserting WHERE-clause content, mirroring the timeReminderJob test style): windows, exempt policies (`long_term`/`user_confirmed` never match), deleted excluded.
- **Contract:** relationship detection still produces its normal output when the gate does not fire.
- **On-device/DB after ship:** record "need to send Justin the quote" twice reworded → old archived + `evolved_from_id` chain + count bumped in DB; a resolved 7+-day task archives on the next tick; AI queries still find archived content (search includes archived — verify).

## Files touched

| Area | File | Change |
|---|---|---|
| Service | `backend/api/src/services/reinforcementService.ts` | new (pure gate + action) |
| Wiring | `backend/api/src/services/relationshipService.ts` (or its caller in voice flow) | invoke supersede pass post-detection |
| Job | `backend/api/src/jobs/lifecycleJob.ts` | new; register in `index.ts` |
| Tests | `backend/api/src/__tests__/services/reinforcement.test.ts`, `__tests__/jobs/lifecycleJob.test.ts` | new |
