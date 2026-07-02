# Voice Input for Ask Offload — Design

**Date:** 2026-07-01
**Status:** Approved
**Origin:** User feedback after Phase 8.3 verification — "the ask offload page should have voice as well, not only text."

## Problem

`AIQueryScreen` ("Ask Offload") accepts questions only via `TextInput`. In a voice-first app, asking should be speakable too — especially one-handed / on a jobsite.

## Scope (decided in brainstorm)

- **Fill–review–send:** tap mic → speak (live transcript streams into the text box) → tap again to stop → transcript sits in the box, editable → user taps send. No auto-send: the question drives RAG retrieval, so the user gets to catch transcription mistakes before spending an AI round-trip.
- **New lean dictation hook** rather than reusing `useDeepgramTranscription` — that hook is coupled to the note-save pipeline (background save, completion notifications, geofence re-sync). Dictation needs only mic → Deepgram stream → text. The Record flow's code path is untouched.
- **OTA-only.** No backend changes (the Deepgram token endpoint exists), no native modules.

### Non-goals (deferred)

- Auto-send on stop / hold-to-talk
- Voice output (spoken answers)
- Refactoring `useDeepgramTranscription` to share the streaming core (do it when a third consumer appears)
- Dictation on other text fields (search, edit note)

## Design

### 1. `mobile/src/hooks/useVoiceDictation.ts` (new)

```ts
interface UseVoiceDictationReturn {
  isDictating: boolean;
  liveTranscript: string;   // interim + finalized text while streaming
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<string>; // resolves with the final transcript
}
```

- Mirrors the proven setup from `useDeepgramTranscription`: mic permission + audio mode, `apiService.getDeepgramToken()`, Deepgram WebSocket (same URL/params pattern), interim + final transcript accumulation.
- Extracted lean — no save, no notifications, no geofences, no gpt-4o re-transcription pass (Deepgram live text is sufficient for a question).
- `expo-keep-awake` held while dictating; released on stop, error, and unmount (same discipline as the recording screen).
- Cleanup on unmount: close WS, stop recorder, release keep-awake.
- `stop()` finalizes: closes the stream, returns the accumulated transcript.

### 2. `AIQueryScreen` changes

- Mic button in the input row, left of the send button (`mic-outline` → `stop-circle` + accent color while dictating).
- Tap mic: `start()`; while dictating the TextInput shows `liveTranscript` (read-only during streaming) and send is disabled.
- Tap stop: `stop()` → final transcript replaces `inputText`, TextInput editable again, user sends normally.
- If the box already has text when dictation starts, dictation appends after a space (don't silently destroy typed text).
- Errors (permission denied, token fetch failure, WS failure): inline error text below the input (same styling as the screen's existing error display), input restored to its pre-dictation value.
- While an AI answer is loading, the mic button is disabled (same as send).

### 3. Error handling

- All failure paths release keep-awake and reset `isDictating`.
- `stop()` never rejects with user-visible consequence — worst case it resolves with whatever transcript accumulated.
- No transcript (stopped immediately / silence) → box unchanged, no error.

### 4. Testing

Mobile has no jest infrastructure (consistent with all existing mobile code):
- `npx tsc --noEmit` stays at the 5-error baseline.
- On-device verification: dictate a question → live text streams → stop → edit → send → answer arrives; existing typed-text flow unchanged; permission-denied shows the inline error; leaving the screen mid-dictation doesn't wedge the mic or keep-awake.

## Files touched

| Area | File | Change |
|---|---|---|
| Hook | `mobile/src/hooks/useVoiceDictation.ts` | new (~120 lines) |
| Screen | `mobile/src/screens/AIQueryScreen.tsx` | mic button + dictation wiring |
