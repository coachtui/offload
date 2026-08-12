/**
 * "The note set changed" signal.
 *
 * Every screen that lists notes fetched once on mount and then went stale: the
 * recorder navigates Home before the save resolves, marking a note Done in the
 * detail modal left the card behind it reading "open", and a delete elsewhere
 * never reached Home's "For you right now". Closing and reopening the app was
 * the only refresh, which is what this replaces.
 *
 * Unlike arrivalPromptBus (one pending slot, consumed on read) this is a plain
 * multi-listener broadcast: several lists can be mounted at once and all of
 * them need the same nudge. Nothing is buffered — a screen that isn't mounted
 * fetches on mount anyway.
 *
 * Emit AFTER the server mutation resolves, never optimistically: the listeners
 * refetch, so an early emit just re-reads the pre-mutation state.
 */

export type NotesChangedReason =
  | 'saved'          // a recording was stored
  | 'sorted'         // the server finished sorting a recording into notes
  | 'state'          // Done / archived / reopened
  | 'deleted'
  | 'updated';       // edit, recategorise, bulk move

type Listener = (reason: NotesChangedReason) => void;

const listeners = new Set<Listener>();

export function emitNotesChanged(reason: NotesChangedReason): void {
  console.log(`[notesBus] notes changed (${reason}) — ${listeners.size} listener(s)`);
  for (const fn of Array.from(listeners)) {
    try {
      fn(reason);
    } catch (err) {
      console.warn('[notesBus] listener threw:', err);
    }
  }
}

/** Subscribe to note-set changes. Returns an unsubscribe function. */
export function subscribeNotesChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Saving is only half the story: the server returns as soon as the transcript
 * is durably stored and sorts it into notes in the background (~10–30s), so the
 * refresh that follows the save can legitimately find nothing new. The "sorted"
 * push covers that — but only when notification permission was granted and the
 * app is running to receive it. These staggered re-emits are the fallback, so a
 * user who denied notifications still watches their note appear.
 */
const SORT_SETTLE_DELAYS_MS = [8_000, 20_000, 40_000];

export function emitNotesChangedAfterSort(): void {
  for (const delay of SORT_SETTLE_DELAYS_MS) {
    setTimeout(() => emitNotesChanged('sorted'), delay);
  }
}
