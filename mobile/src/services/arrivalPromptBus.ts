/**
 * One-slot signal from the record flow to whatever screen is showing.
 *
 * The "you saved a note about a place" event originates in RecordScreen's save
 * callback, but RecordScreen navigates to Home before the save resolves — so it
 * is unmounted by the time we'd want to show the escalation sheet. The event
 * therefore has to outlive its emitter, which rules out a prop or a hook.
 *
 * Deliberately not a general event emitter: exactly one pending signal, and it
 * is consumed on read. A second place-note arriving before the first is shown
 * just overwrites the name, which is the behaviour we want.
 */

type Listener = (placeNames: string[]) => void;

let pending: string[] | null = null;
let listener: Listener | null = null;

/** Signal that a saved note produced place candidates. */
export function emitArrivalPromptCandidate(placeNames: string[]): void {
  if (listener) {
    listener(placeNames);
    return;
  }
  // No one listening yet (Home still mounting after the navigate) — hold it.
  pending = placeNames;
}

/**
 * Subscribe, immediately draining any signal that arrived before mount.
 * Returns an unsubscribe function.
 */
export function subscribeArrivalPrompt(fn: Listener): () => void {
  listener = fn;

  if (pending) {
    const names = pending;
    pending = null;
    // Defer so the subscriber isn't called during its own render pass.
    setTimeout(() => fn(names), 0);
  }

  return () => {
    if (listener === fn) listener = null;
  };
}
