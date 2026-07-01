# Recording UX — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan

## Summary

Three recording-flow improvements: (1) keep the screen awake while recording so a screen lock can't cut off capture; (2) after you stop, return to Home immediately and finish enhancing/saving in the background; (3) notify on save completion, and stop surfacing weakly-related "related notes."

## Goals

- Recording is not lost if the phone would auto-lock mid-capture.
- User isn't held on the "enhancing/saving" screen — they land Home right after stopping.
- Save status reaches the user via a local notification (success/failure).
- Proactive "related notes / contradictions" only surface when *genuinely* related.

## Non-Goals

- Background *recording* (recording while the app is backgrounded/locked). We only keep the screen awake during active recording; we do NOT add an iOS background-audio mode.
- Reworking the RAG engine — only the proactive relevance threshold changes.
- New build: keep-awake ships via OTA (native module already bundled with `expo`).

## Decisions (from brainstorming)

- Save status surfaced via **local notification on completion** (success and failure).
- Related-notes: **raise the proactive relevance cutoff** (only show if really related); fold a hint into the success notification when a strong match/contradiction exists; drop the inline record-screen panel.
- Keep-awake active during **recording only**, not during the background save.

## Components / Changes

### 1. Keep screen awake (mobile, OTA)
- Add `expo-keep-awake` as a direct dependency (its native module is already bundled via `expo@54` at `node_modules/expo/node_modules/expo-keep-awake` — adding it top-level just makes the JS import resolve; no native rebuild).
- In `mobile/src/hooks/useDeepgramTranscription.ts`: call `activateKeepAwakeAsync()` when recording starts (status → 'recording' / mic started) and `deactivateKeepAwake()` on stop and in cleanup/error paths (must always release). Use a stable tag.

### 2. Background save + return Home (mobile)
- In `stopRecording` (useDeepgramTranscription) / `RecordScreen`: once the mic is stopped and the Deepgram final transcript is in hand, trigger navigation to Home instead of holding the screen through the `processing → done` phase.
- The gpt-4o enhance + `saveTranscript` + related-check run in the background (the app remains foregrounded on Home, so the async chain continues). Do not block navigation on them.
- The record screen's `processing`/`done` UI and the inline related/contradiction panel are removed from the blocking path.
- **Known limitation (documented):** if the app is suspended (phone locked) during the ~few-second background save, the save may fail — surfaced via the failure notification; the transcript is retained so nothing is silently lost.

### 3. Completion notification (mobile)
- On successful `saveTranscript`: fire a local notification via `expo-notifications` `scheduleNotificationAsync({ trigger: null })` — title e.g. `✅ Saved` , body = the note title (or first line). If a strong related note / contradiction was found (see #4), append a hint (e.g. `— ⚠️ may conflict with an earlier note` or `— relates to N earlier note(s)`).
- On failure: `⚠️ Couldn't save your note`. Tapping opens the app (Home) via the existing notification-response handler. **Auto-retry is out of scope for this slice** — we keep the transcript in memory (best-effort) but do not promise one-tap retry in the copy; a real retry flow is a later follow-up.
- Reuse the existing local-notification setup (handler already configured for geofences).

### 4. Related-notes precision (backend + mobile)
- Backend `POST /api/v1/rag/search` (`routes/rag.ts`): add an optional `minScore` to the request schema (default = current `0.4`, preserving existing behavior); the score filter uses `minScore` instead of the hardcoded `SCORE_THRESHOLD`.
- Mobile proactive related-check (in the background save path) calls search with `minScore: 0.6` so only genuinely-related notes qualify. If none clear the bar, no related hint (silent). Explicit user search is unchanged (0.4).
- Contradiction check reuses the existing `ragCheckContradictions` path; only surface if it reports a conflict.

## Data Flow

```
[stop recording]
  deactivateKeepAwake()
  capture final Deepgram transcript
  navigate Home                     ← user is free immediately
  (background) gpt-4o enhance → saveTranscript
                 ├─ success → related-check(minScore 0.6) + contradiction-check
                 │             → local notification "✅ Saved: <title>" (+hint if strong)
                 └─ failure → local notification "⚠️ Couldn't save your note" (tap opens app; transcript retained best-effort)
```

## Error Handling / Edge Cases

- Keep-awake released on every stop/error path (no stuck-on screen).
- Background save failure → failure notification; transcript preserved in-memory (best-effort) for a possible future retry flow (not built this slice).
- App suspended mid-save → treated as failure (notification). Documented tradeoff of not adding background-audio mode.
- `minScore` omitted by any existing caller → defaults to 0.4 (no behavior change).
- No related notes / no contradiction → success notification with no hint.

## Testing

- **Backend (jest):** `/rag/search` honors `minScore` (results below cutoff excluded; default 0.4 when omitted) — unit test on the filter.
- **Mobile (tsc + manual, no jest harness):**
  - keep-awake: `activateKeepAwakeAsync` on record start, `deactivateKeepAwake` on stop/error (verify via code + manual: screen stays on while recording, dims after stop).
  - background flow: stopping navigates Home without waiting; success/failure notification fires; tapping the failure notification opens the app (Home).
  - related hint only appears for a genuinely-related note.

## Files

- Mobile: `mobile/package.json` (+`expo-keep-awake`), `mobile/src/hooks/useDeepgramTranscription.ts` (keep-awake + background save + notification + minScore call), `mobile/src/screens/RecordScreen.tsx` (navigate Home on stop; remove blocking panel), `mobile/App.tsx` (retry route for the failure notification), `mobile/src/services/api.ts` (`ragSearch` passes `minScore`).
- Backend: `backend/api/src/routes/rag.ts` (optional `minScore` on search) + test.

## Rollout

- Backend deploys on merge (Railway). Mobile via `eas update --branch preview --clear-cache`; verify bundle. Keep-awake is OTA (native already present).
