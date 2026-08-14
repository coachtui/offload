/**
 * One-slot signal from the save pipeline to Home: "the user's first recording
 * was just saved — session <id>".
 *
 * Same shape and same reason as arrivalPromptBus: the save resolves inside
 * useDeepgramTranscription's background pipeline *after* RecordScreen has
 * popped itself off the stack, so the event has to outlive its emitter. Home
 * subscribes, then polls the session's objects until the server's background
 * sort produces something to show in the first-recording explanation sheet.
 *
 * Exactly one pending signal, consumed on read — if a second recording lands
 * before the first was shown, the newer session wins, which is fine: the sheet
 * teaches with whichever recording is freshest.
 */

type Listener = (sessionId: string) => void;

let pending: string | null = null;
let listener: Listener | null = null;

export function emitFirstRecordingSaved(sessionId: string): void {
  if (listener) {
    listener(sessionId);
    return;
  }
  pending = sessionId;
}

/** Subscribe, draining any signal that arrived before mount. Returns unsubscribe. */
export function subscribeFirstRecording(fn: Listener): () => void {
  listener = fn;

  if (pending) {
    const sessionId = pending;
    pending = null;
    // Defer so the subscriber isn't called during its own render pass.
    setTimeout(() => fn(sessionId), 0);
  }

  return () => {
    if (listener === fn) listener = null;
  };
}
