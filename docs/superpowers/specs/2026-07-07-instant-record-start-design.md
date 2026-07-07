# Instant Record Start — Design

**Date:** 2026-07-07
**Status:** Approved (design confirmed in conversation; investigation doc'd below)
**Origin:** User report — noticeable lag between tapping record and recording starting.

## Investigation summary (root cause)

No regression: the start path is unchanged since 6/28. The lag is architectural — `startRecording` serializes token fetch (~300ms+), Deepgram WS connect (TLS measured 180–515ms + upgrade, worse on LTE), and mic init (~100–300ms) BEFORE capture begins: ~1–2.5s of dead air by design. Variance in Deepgram TLS and an occasional 401→refresh→retry on the first authed request explain "worse than before."

## Design

Reorder so capture starts first; the network catches up in parallel.

1. **Mic first.** `startRecording`: after auth + permission checks, start the microphone immediately, set status `recording`, activate keep-awake. Chunks already accumulate in `audioChunksRef` regardless of socket state (existing behavior) — nothing spoken is lost.
2. **Connect in parallel.** Token fetch + Deepgram WS connect run after the mic is rolling. On socket open, flush all buffered chunks in order (synchronous loop — JS single-threading means no interleave with live sends), then live chunks flow as today. Deepgram accepts faster-than-realtime input; the live transcript catches up in a beat.
3. **Degraded mode (decided: keep recording).** If the token fetch or WS connect fails/times out, the recording CONTINUES with no live captions; the existing gpt-4o transcription pass at stop produces the saved note from the buffered audio. Log a warn; do not set error status; do not stop the mic. (Today this kills the attempt — strictly worse.)
4. **Token prefetch.** The hook exposes `prefetchDeepgramToken()`; RecordScreen calls it on mount. Cached `{token, keywords}` with a 5-minute TTL is used by `startRecording` when fresh (the "token" is a static key server-side, so staleness risk is nil; TTL is just hygiene).
5. **UI:** no RecordScreen changes beyond the prefetch call — status `recording` now arrives ~200ms after tap, which the existing UI already renders.

**Must verify during implementation:** the stop/background-save path handles a recording whose Deepgram transcript is EMPTY but whose audio chunks exist (pure degraded-mode recording) — the gpt-4o enhance path should already cover this; if the save rejects empty initial transcripts, guard it.

**Non-goals:** retrying the socket mid-recording, offline queueing, any change to the voice-ask dictation hook (its 0.5–1s connect before "listening" is acceptable for short questions — reconsider only if reported).

## Files touched

| File | Change |
|---|---|
| `mobile/src/hooks/useDeepgramTranscription.ts` | start reorder, flush-on-open, degraded mode, prefetch helper |
| `mobile/src/screens/RecordScreen.tsx` | prefetch call on mount |
