/**
 * Note lifecycle mutations that can change what the device is set up to fire.
 *
 * Closing a note can reap its auto-created geofence, reopening one can re-arm
 * it, and deleting can do either at scale — so every one of these mutations
 * must be followed by an OS region re-sync, or the device keeps monitoring
 * regions the backend deleted (and, under fire-first arrivals, pings about
 * notes the user already closed). The same applies to time reminders now that
 * they're scheduled locally: a resolved note's dated notification is already
 * sitting in the OS and only a re-sync cancels it. Screens call these wrappers
 * instead of apiService directly so the re-sync cannot be forgotten at a new
 * call site — two paths (decision review, bulk delete) were missed exactly that
 * way when the sync lived in the screens.
 *
 * The re-sync is deliberately unconditional and fire-and-forget:
 *  - unconditional, because even when nothing was reaped it refreshes the
 *    persisted open-note snapshot the offline arrival fallback reads, and
 *    syncRegions never touches the OS when the region set didn't change (and
 *    never re-registers on a pure shrink), so a no-op sync can't cause the
 *    spurious iOS ENTER events a re-registration would;
 *  - fire-and-forget, because the user's action already succeeded — a failed
 *    sync must not surface as a failed mutation, and the next app launch or
 *    note action will sync again anyway.
 */
import { apiService } from './api';
import { syncGeofencesWithOS } from './geofenceSync';
import { syncTimeRemindersWithOS } from './timeReminderSync';
import { emitNotesChanged } from './notesBus';

export type NoteState = 'open' | 'active' | 'resolved' | 'archived';

function resyncTriggers(reason: string): void {
  syncGeofencesWithOS(reason).catch(() => {});
  // Same reasoning for time reminders: closing a note has to cancel the local
  // notification the device already scheduled for it, or the phone pings about
  // a note the user finished. Diffing, so a no-op costs nothing.
  syncTimeRemindersWithOS(reason).catch(() => {});
}

/** Transition a note's lifecycle state (Done / archive / reopen). */
export async function updateNoteState(
  objectId: string,
  state: NoteState,
  evolvedFromId?: string
): Promise<{ object: any }> {
  const result = await apiService.updateObjectState(objectId, state, evolvedFromId);
  resyncTriggers(`note-${state}`);
  emitNotesChanged('state');
  return result;
}

/** Delete a single note. */
export async function deleteNote(objectId: string): Promise<void> {
  await apiService.deleteObject(objectId);
  resyncTriggers('note-deleted');
  emitNotesChanged('deleted');
}

/** Delete several notes at once. */
export async function deleteNotes(ids: string[]): Promise<{ deleted: number }> {
  const result = await apiService.bulkDeleteObjects(ids);
  resyncTriggers('notes-bulk-deleted');
  emitNotesChanged('deleted');
  return result;
}

/** Record a decision outcome (resolves the note server-side). */
export async function reviewDecision(
  objectId: string,
  actualOutcome: string,
  outcomeAccuracy?: number
): Promise<{ object: any }> {
  const result = await apiService.reviewDecision(objectId, actualOutcome, outcomeAccuracy);
  resyncTriggers('decision-reviewed');
  emitNotesChanged('state');
  return result;
}
