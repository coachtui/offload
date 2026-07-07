# Instant Record Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recording starts capturing ~200ms after the tap — mic first, Deepgram catches up in parallel, and a dead socket degrades to "no live captions" instead of killing the recording.

**Architecture:** Reorder `startRecording` in `useDeepgramTranscription.ts`: mic + `recording` status + keep-awake immediately after permission; token fetch + WS connect run afterward, flushing the already-buffering `audioChunksRef` on open. Connect failure logs a warn and leaves the recording running (gpt-4o transcribes the buffer at stop). A module-level token cache (5-min TTL) + `prefetchDeepgramToken()` called from RecordScreen mount removes the token round-trip from the tap entirely.

**Tech Stack:** React Native/Expo, existing `@mykin-ai/expo-audio-stream` + Deepgram WS. **OTA-only, no backend changes.** Mobile has NO jest — verification is tsc baseline (exactly 5 pre-existing errors) + on-device.

**Spec:** `docs/superpowers/specs/2026-07-07-instant-record-start-design.md`

## Global Constraints

- Work on branch `feature/instant-record-start` off `main`.
- The mic MUST be capturing (chunks accumulating in `audioChunksRef`) before any network I/O begins; status `recording` is set at that moment.
- Degraded mode: token/WS failure after the mic started → `console.warn`, recording continues, NO error status, mic NOT stopped. Errors BEFORE the mic starts (auth, permission) still error out as today.
- Flush-on-open sends buffered chunks in order via a synchronous loop before returning from the open handler.
- Do NOT touch `useVoiceDictation.ts` (voice-ask keeps its current connect-first flow) or `backend/`.
- Mobile tsc baseline: exactly 5 pre-existing errors (`components/ui/index.tsx`, `SessionsScreen.tsx`, `api.ts`, `locationService.ts`, `websocket.ts`).
- The stop/background-save path must handle an EMPTY Deepgram transcript with non-empty audio chunks (pure degraded recording) — verify, and guard only if it doesn't.

---

### Task 1: Hook reorder — mic first, parallel connect, flush, degraded mode

**Files:**
- Modify: `mobile/src/hooks/useDeepgramTranscription.ts` (`startRecording`, ~lines 95–260)

**Interfaces:**
- Produces: same public API (`startRecording`/`stopRecording`/`reset` + state) — behavior change only. Task 2 adds `prefetchDeepgramToken` separately.

- [ ] **Step 1: Understand the current sequence**

Read `startRecording` fully. Current order: (1) auth check → (2) mic permission → (3) token fetch → (4) WS connect (awaited, 10s timeout) + handlers → (5) `startMicrophone` → keep-awake → status `recording`. Steps 3–4 are the dead air.

- [ ] **Step 2: Reorder**

Restructure `startRecording` to:

```
(1) auth check                      — unchanged, errors as today
(2) mic permission                  — unchanged, errors as today
(3) startMicrophone                 — moved up; onAudioStream callback unchanged
                                      (it already buffers to audioChunksRef always and
                                      sends to wsRef only when OPEN — no edit needed)
(4) duration timer + keep-awake + setState status:'recording'  — moved up
(5) connectDeepgram()               — NEW: everything network, extracted, NOT awaited
                                      by the caller path that sets 'recording'
```

Concretely: wrap the existing token-fetch + WS-connect + handler-wiring code (current steps 3–4, including the `keywords` URL construction and the `onmessage`/`onclose`/`onerror` handlers, all verbatim) in a local async function `connectDeepgram(): Promise<void>`, and call it fire-and-forget AFTER the state update:

```ts
      // Live-caption socket connects in parallel — capture is already running.
      connectDeepgram().catch((err) => {
        console.warn('[Recording] Deepgram connect failed — continuing without live captions:', err);
      });
```

Inside `connectDeepgram`, on successful open, flush the buffer BEFORE returning from the open path:

```ts
      // Flush chunks captured while connecting, in order. Synchronous loop —
      // live sends can't interleave until this handler returns.
      for (const chunk of audioChunksRef.current) {
        ws.send(base64ToArrayBuffer(chunk));
      }
      console.log(`[Recording] Deepgram open — flushed ${audioChunksRef.current.length} buffered chunks`);
```

(Place the flush where the old code resolved the connect promise — i.e. in the `onopen` continuation after `wsRef.current = ws` and handler wiring is complete, so `onmessage` is attached before the first flushed audio can produce a result.)

- [ ] **Step 3: Degraded-mode semantics**

Inside `connectDeepgram`, failures must NOT touch recording state: remove/avoid any `setState(status:'error')` or keep-awake release on token/WS failure — the catch at the call site only warns. The existing post-connect `ws.onerror` (sets `error` string but not status) may remain, but verify it does not stop the mic or change `status`. Errors thrown BEFORE `startMicrophone` (auth/permission) keep today's full error path (status `error`, keep-awake release).

Guard `stopRecording` interplay: if `stopRecording` runs while `connectDeepgram` is still in flight, the late-arriving socket must not leak. Add a session guard: capture `const session = ++sessionIdRef.current` at the top of `startRecording` (the ref already exists), and in `connectDeepgram` immediately after the socket opens, check `if (sessionIdRef.current !== session) { ws.close(); return; }`. Also apply the same check before assigning `wsRef.current = ws`.

- [ ] **Step 4: Verify the empty-transcript degraded save path**

Trace `stopRecording`: with `finalTranscript === ''` and `audioChunksRef` non-empty, confirm the background enhance+save path (gpt-4o over chunks) still produces and saves a transcript. Check what `save-transcript` receives when Deepgram produced nothing — if any guard rejects an empty string BEFORE the gpt-4o result replaces it, fix minimally (e.g. proceed when `audioChunks.length > 0`). Report what you found either way.

- [ ] **Step 5: Typecheck + commit**

Run: `cd /Users/tui/offload/mobile && npx tsc --noEmit 2>&1 | grep -c "error TS"` — expect exactly `5`.

```bash
cd /Users/tui/offload && git add mobile/src/hooks/useDeepgramTranscription.ts && git commit -m "feat(recording): mic-first start — parallel Deepgram connect, buffered flush, degraded captions"
```

---

### Task 2: Token prefetch

**Files:**
- Modify: `mobile/src/hooks/useDeepgramTranscription.ts` (module scope + token-fetch site inside `connectDeepgram`)
- Modify: `mobile/src/screens/RecordScreen.tsx` (mount effect)

**Interfaces:**
- Consumes: Task 1's `connectDeepgram` structure.
- Produces: exported `prefetchDeepgramToken(): void` (fire-and-forget).

- [ ] **Step 1: Module-level cache in the hook file**

```ts
// Deepgram token cache — the "token" is a static server key, so a short TTL is
// hygiene, not a security boundary. Prefetched on RecordScreen mount so the
// record tap never pays this round-trip.
const TOKEN_TTL_MS = 5 * 60 * 1000;
let cachedToken: { token: string; keywords: string[]; fetchedAt: number } | null = null;

async function fetchDeepgramToken(): Promise<{ token: string; keywords: string[] }> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  const result = await apiService.getDeepgramToken();
  cachedToken = { token: result.token, keywords: result.keywords ?? [], fetchedAt: Date.now() };
  return cachedToken;
}

export function prefetchDeepgramToken(): void {
  fetchDeepgramToken().catch(() => {}); // best-effort; startRecording refetches on miss
}
```

Replace the direct `apiService.getDeepgramToken()` call inside `connectDeepgram` with `fetchDeepgramToken()` (keep the same empty-token error handling).

- [ ] **Step 2: RecordScreen mount prefetch**

In `RecordScreen.tsx`, import `prefetchDeepgramToken` from the hook module and add:

```ts
  useEffect(() => {
    prefetchDeepgramToken();
  }, []);
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd /Users/tui/offload/mobile && npx tsc --noEmit 2>&1 | grep -c "error TS"` — expect exactly `5`.

```bash
cd /Users/tui/offload && git add mobile/src/hooks/useDeepgramTranscription.ts mobile/src/screens/RecordScreen.tsx && git commit -m "feat(recording): prefetch Deepgram token on RecordScreen mount"
```

---

### Task 3: Verification

- [ ] Scope: `git diff main --stat` → exactly the 2 mobile files; nothing in backend or `useVoiceDictation.ts`.
- [ ] `npx tsc --noEmit` → 5 baseline errors, none in touched files.
- [ ] Report. Do NOT merge/OTA (finishing flow handles it). On-device after ship: tap record → "recording" UI near-instant and first words captured (speak immediately, verify they appear in the SAVED note even if live captions lag); airplane-mode-after-permission test → recording continues, note saves via gpt-4o on reconnect… (that last one needs network at stop; simpler degraded test: verify a recording whose captions never appeared still saves).
