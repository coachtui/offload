# Recording UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the screen awake while recording, return Home immediately on stop with the enhance/save running in the background + a completion notification, and stop surfacing weakly-related "related notes."

**Architecture:** `stopRecording` captures the transcript then kicks the gpt-4o enhance + save + related/contradiction checks off as a non-awaited background task that fires a local notification; the record screen navigates Home as soon as `stopRecording` returns. `expo-keep-awake` guards the recording. The proactive related-notes call passes a stricter `minScore` to a `/rag/search` that now honors it.

**Tech Stack:** React Native/Expo (`expo-keep-awake`, `expo-notifications`), Node/Express + Jest.

## Global Constraints

- Keep-awake: **recording only** (activate on record start, release on stop AND every error/cleanup path). `expo-keep-awake` added as a direct dep — native already bundled with `expo@54`, so **OTA-shippable, no new build**.
- Background save: navigate Home once the transcript is captured; enhance/save/related run non-awaited. App stays foregrounded → async continues. If the phone is locked mid-save the save may fail (→ failure notification); transcript retained in memory best-effort. **No iOS background-audio mode is added.**
- Completion notification: local `expo-notifications` `scheduleNotificationAsync({ trigger: null })`. Success `✅ Saved` + title (+ related/contradiction hint when strong). Failure `⚠️ Couldn't save your note` (tap opens app; **no auto-retry this slice**).
- Related-notes precision: proactive call uses `minScore: 0.6`; explicit user search unchanged at `0.4`. `/rag/search` `minScore` is optional and defaults to `0.4` (no behavior change for existing callers).
- Backend deploys on merge (Railway); mobile via `eas update --branch preview --clear-cache`.

---

### Task 1: Backend — `/rag/search` honors optional `minScore`

**Files:**
- Modify: `backend/api/src/routes/rag.ts` (search schema ~line 24; handler score filter ~line 109-129)
- Create: `backend/api/src/services/ragScore.ts` (pure helper)
- Test: `backend/api/src/__tests__/services/ragScore.test.ts`

**Interfaces:**
- Produces: `applyMinScore<T extends { score: number }>(rows: T[], minScore?: number): T[]` (default 0.4; keeps rows with `score >= minScore`).

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/ragScore.test.ts`:

```typescript
import { applyMinScore } from '../../services/ragScore';

const rows = [{ score: 0.9 }, { score: 0.61 }, { score: 0.6 }, { score: 0.59 }, { score: 0.4 }];

describe('applyMinScore', () => {
  it('defaults to 0.4 (keeps >= 0.4)', () => {
    expect(applyMinScore(rows).map(r => r.score)).toEqual([0.9, 0.61, 0.6, 0.59, 0.4]);
  });
  it('excludes rows below an explicit minScore', () => {
    expect(applyMinScore(rows, 0.6).map(r => r.score)).toEqual([0.9, 0.61, 0.6]);
  });
  it('minScore=0 keeps everything', () => {
    expect(applyMinScore(rows, 0)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend/api && npx jest ragScore -v`
Expected: FAIL — cannot find module `../../services/ragScore`.

- [ ] **Step 3: Implement the helper**

Create `backend/api/src/services/ragScore.ts`:

```typescript
/**
 * Filter ranked RAG rows by a minimum similarity score (0-1, higher = closer).
 * Default 0.4 preserves the prior /rag/search behavior; proactive callers pass
 * a stricter value (e.g. 0.6) so only genuinely-related notes qualify.
 */
export function applyMinScore<T extends { score: number }>(rows: T[], minScore = 0.4): T[] {
  return rows.filter((r) => r.score >= minScore);
}
```

- [ ] **Step 4: Wire it into the search route**

In `backend/api/src/routes/rag.ts`:
(a) Add the import near the top with the other imports:
```typescript
import { applyMinScore } from '../services/ragScore';
```
(b) In the search request schema (the `z.object({...})` with `topK` ~line 24), add:
```typescript
  minScore: z.number().min(0).max(1).optional(),
```
(c) Pull it out where `topK`/`filters` are destructured in the search handler:
```typescript
    const { query, topK, filters, minScore } = validation.data;
```
(d) Replace the hardcoded threshold usage. Remove `const SCORE_THRESHOLD = 0.4;` and change the `.filter((r) => r.score >= SCORE_THRESHOLD)` to build the array then apply the helper:
```typescript
    const scored = fullObjects
      .map((obj) => {
        const atom = obj.toAtomicObject();
        return {
          score: Number(scoreMap.get(obj.id) ?? 0),
          objectId: obj.id,
          title: atom.title ?? null,
          cleanedText: atom.cleanedText ?? atom.content,
          type: atom.objectType ?? 'observation',
          domain: atom.domain ?? 'unknown',
          tags: atom.metadata?.tags ?? [],
          isActionable: atom.actionability?.isActionable ?? false,
          nextAction: atom.actionability?.nextAction ?? null,
          temporalHints: atom.temporalHints,
          createdAt: atom.createdAt,
          sourceTranscriptId: atom.source?.recordingId ?? null,
        };
      })
      .sort((a, b) => b.score - a.score);
    const results = applyMinScore(scored, minScore);
```

- [ ] **Step 5: Run tests + tsc**

Run: `cd backend/api && npx jest ragScore -v` → PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "rag.ts|ragScore" || echo ok` → `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/services/ragScore.ts backend/api/src/routes/rag.ts backend/api/src/__tests__/services/ragScore.test.ts
git commit -m "feat(api): /rag/search honors optional minScore (default 0.4)"
```

---

### Task 2: Mobile — `apiService.ragSearch` passes `minScore`

**Files:**
- Modify: `mobile/src/services/api.ts` (`ragSearch` options type, ~line 585)

**Interfaces:**
- Produces: `apiService.ragSearch(query, { topK?, minScore?, filters? })` — `minScore?: number` forwarded in the POST body.

- [ ] **Step 1: Add `minScore` to the options type**

In `mobile/src/services/api.ts`, in the `ragSearch` options object type (after `topK?: number;`), add:
```typescript
    minScore?: number;
```
No other change needed — the method already spreads `...options` into the request body, so `minScore` is forwarded automatically.

- [ ] **Step 2: Verify tsc**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "api.ts" | grep -v "267" || echo "no new api.ts errors"`
Expected: `no new api.ts errors` (line 267 is the known pre-existing baseline error).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/services/api.ts
git commit -m "feat(mobile): ragSearch accepts minScore"
```

---

### Task 3: Mobile — keep the screen awake while recording

**Files:**
- Modify: `mobile/package.json` (+`expo-keep-awake`)
- Modify: `mobile/src/hooks/useDeepgramTranscription.ts`

**Interfaces:**
- Consumes: `expo-keep-awake` `activateKeepAwakeAsync(tag)`, `deactivateKeepAwake(tag)`.

- [ ] **Step 1: Add the dependency (hoists the already-bundled native module to top-level JS)**

Run:
```bash
cd mobile && npx expo install expo-keep-awake
```
Expected: `expo-keep-awake` added to `package.json` at the SDK-matched version (~15.0.8) and resolvable. (If `expo install` is unavailable offline, add `"expo-keep-awake": "~15.0.8"` to `package.json` dependencies and run `npm install`.)

- [ ] **Step 2: Import + a stable tag**

In `mobile/src/hooks/useDeepgramTranscription.ts`, add near the top imports:
```typescript
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
```
And a module-level constant (top of file, after imports):
```typescript
const KEEP_AWAKE_TAG = 'offload-recording';
```

- [ ] **Step 3: Activate on record start**

In `startRecording`, right where status is set to `'recording'` (~line 238, the `setState({ ...prev, status: 'recording', ... })`), immediately before that `setState`, add:
```typescript
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
```

- [ ] **Step 4: Release on stop and on every error/cleanup path**

Add `deactivateKeepAwake(KEEP_AWAKE_TAG);` at:
- the start of `stopRecording` (so it's released as soon as the user stops), and
- the `catch` block of `startRecording` (release if start failed).
Use a safe form so a missing tag never throws:
```typescript
      try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
```

- [ ] **Step 5: Verify tsc + manual note**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "useDeepgramTranscription" || echo "no errors"` → `no errors`; total error count still baseline 5.
Manual (later, on device): screen stays lit while recording, returns to normal after stop.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/hooks/useDeepgramTranscription.ts
git commit -m "feat(mobile): keep screen awake while recording"
```

---

### Task 4: Mobile — background save + completion notification + return Home

**Files:**
- Create: `mobile/src/services/saveNotification.ts`
- Modify: `mobile/src/hooks/useDeepgramTranscription.ts` (`stopRecording` — make enhance/save/related non-awaited; fire notification; use `minScore: 0.6`)
- Modify: `mobile/src/screens/RecordScreen.tsx` (navigate Home on stop)

**Interfaces:**
- Consumes: `expo-notifications` `scheduleNotificationAsync`; `apiService.saveTranscript`, `apiService.ragSearch(query, { topK, minScore })`, `apiService.ragCheckContradictions`.
- Produces: `notifySaveResult({ ok, title, hint? })` in `saveNotification.ts`.

- [ ] **Step 1: Notification helper**

Create `mobile/src/services/saveNotification.ts`:

```typescript
/**
 * Local notification for a backgrounded transcript save. Reuses the app's
 * already-configured expo-notifications handler. Never throws.
 */
import * as Notifications from 'expo-notifications';

export async function notifySaveResult(opts: {
  ok: boolean;
  title?: string | null;
  hint?: string | null;
}): Promise<void> {
  try {
    const content = opts.ok
      ? {
          title: '✅ Saved',
          body: `${(opts.title || 'Note saved').trim()}${opts.hint ? ` — ${opts.hint}` : ''}`,
          data: { screen: 'Home' },
        }
      : {
          title: "⚠️ Couldn't save your note",
          body: 'Tap to open the app.',
          data: { screen: 'Home' },
        };
    await Notifications.scheduleNotificationAsync({ content: { ...content, sound: true }, trigger: null });
  } catch (e) {
    console.warn('[saveNotification] failed (non-fatal):', e);
  }
}
```

- [ ] **Step 2: Restructure `stopRecording` — capture transcript, then background the rest**

In `mobile/src/hooks/useDeepgramTranscription.ts`, in `stopRecording`, after the transcript (`transcriptToSave`) is determined and the mic/Deepgram are stopped, replace the awaited enhance/save block so it becomes a **non-awaited** background task and fires the notification instead of relying on screen state. Concretely:
- Import the helper at top: `import { notifySaveResult } from '../services/saveNotification';`
- Wrap the existing `if (transcriptToSave.trim()) { try { const result = await apiService.saveTranscript(...) ... } catch (error) {...} }` region in `void (async () => { ... })();` so `stopRecording` does not await it and returns promptly after the transcript is captured.
- On save **success**, after `saveTranscript` resolves, compute the hint and notify:
```typescript
          let hint: string | null = null;
          try {
            const [searchResp, contr] = await Promise.all([
              transcriptToSave.trim().length > 50
                ? apiService.ragSearch(transcriptToSave, { topK: 5, minScore: 0.6 })
                : Promise.resolve({ results: [] as any[] } as any),
              apiService.ragCheckContradictions(transcriptToSave, result.objectIds).catch(() => null),
            ]);
            const related = (searchResp.results ?? []).filter((r: any) => !result.objectIds.includes(r.objectId));
            if (contr?.hasConflict) hint = '⚠️ may conflict with an earlier note';
            else if (related.length > 0) hint = `relates to ${related.length} earlier note${related.length > 1 ? 's' : ''}`;
          } catch { /* hint is best-effort */ }
          await notifySaveResult({ ok: true, title: result.objectCount > 0 ? (transcriptToSave.slice(0, 60)) : 'Note saved', hint });
```
  (Use the note title if readily available; otherwise the transcript's first ~60 chars is fine.)
- On save **failure** (the existing `catch (error)`), replace the on-screen error state with:
```typescript
          await notifySaveResult({ ok: false });
```
- The hook no longer needs to drive `status: 'processing'|'done'` for the screen's benefit, but leaving those state updates in place is harmless; the screen will have navigated away. Do NOT remove `relatedNotes`/`contradictions` from state types in this task (RecordScreen still references them until Step 3 trims usage).

- [ ] **Step 3: Navigate Home on stop (RecordScreen)**

In `mobile/src/screens/RecordScreen.tsx`, in the record-button handler where `stopRecording` is called for the `isRecording` case, navigate Home right after it returns:
```typescript
    if (isRecording) {
      await stopRecording();
      navigation.navigate('Home');
      return;
    }
```
Remove the now-unreachable post-save UI branches that depend on `isDone` (the `isDone && ...` blocks for the gpt-4o swap, contradictions, and related notes) since the screen is left immediately on stop. Keep the recording/idle UI. (Leave `useGeofences` re-sync effect intact — it keys on `status === 'done'`; it will still run in the brief window or can be triggered from the background task. If simplest, move the `fetchGeofences()` re-sync call into the background save success path so it still fires after navigation.)

- [ ] **Step 4: Verify tsc**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "useDeepgramTranscription|RecordScreen|saveNotification" || echo "no new errors"` → `no new errors`; total error count still baseline 5.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/saveNotification.ts mobile/src/hooks/useDeepgramTranscription.ts mobile/src/screens/RecordScreen.tsx
git commit -m "feat(mobile): background save + return Home + completion notification"
```

---

### Task 5: Ship + verify

**Files:** none.

- [ ] **Step 1: Deploy backend + ship mobile** (after merge to main)
```bash
git push origin <branch>   # after merge
cd mobile && eas update --branch preview --message "feat: recording UX (keep-awake, background save, related precision)" --clear-cache
```
Confirm backend deploy SUCCESS + `/health` 200; verify the OTA `.hbc` bundles have `localhost` count 0.

- [ ] **Step 2: On-device verification**
- Start recording → confirm the screen does **not** dim/lock while recording.
- Stop → you land on **Home immediately**; within a few seconds a **✅ Saved** notification appears (with a related/conflict hint only when genuinely related).
- Confirm in prod DB the note persisted:
```bash
PGURL=$(cd backend/api && railway variables --json | jq -r '.DATABASE_PUBLIC_URL')
PGSSLMODE=require psql "$PGURL" -P pager=off -c "select object_type, left(coalesce(cleaned_text,content),40) from hub.atomic_objects order by created_at desc limit 2;"
```
- Record something clearly unrelated to prior notes → confirm the notification shows **no** "related" hint (precision fix).

---

## Notes for the implementer

- **Keep-awake must always be released** — if any error path leaves it active the screen stays on. Release at `stopRecording` start and in `startRecording`'s catch.
- The background save runs while the app is foregrounded on Home, so it completes normally. Only a phone-lock during the ~few-second window risks a failed save (→ failure notification). This is the accepted tradeoff (no background-audio mode).
- `minScore` default (0.4) means all existing `/rag/search` callers are unaffected; only the proactive related-notes call opts into 0.6.
- No mobile jest harness — mobile tasks verify via `tsc` (baseline 5) + the on-device checks in Task 5.
