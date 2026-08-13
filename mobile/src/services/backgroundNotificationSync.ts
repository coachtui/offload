/**
 * Silent-push geofence arming.
 *
 * Registering a region with iOS requires running JS, so a brand-new place's
 * geofence has exactly the syncs that happen while the app is alive to get
 * armed. A user who records a note and immediately force-quits has none —
 * until now the region stayed unregistered until the next app open. The
 * backend closes that gap by sending a content-available (silent) push after
 * creating geofences; iOS wakes this task in the background — even from a
 * killed app — and the sync arms the new regions.
 *
 * Strictly additive to the working arming paths (post-save +12s/+35s syncs,
 * app-active sync, session-processed push receipt): those all still run, this
 * only adds a wake-up when none of them can. syncGeofencesWithOS is idempotent
 * — an unchanged region set never touches the OS (and a pure shrink never
 * re-registers), so a redundant wake cannot cause spurious ENTER events or
 * disturb monitoring in any way. iOS treats silent pushes as discretionary
 * (budgeted, may be delayed or dropped) — which is fine, because this is the
 * backstop, not the primary path.
 *
 * Requires the `remote-notification` UIBackgroundModes entry (app.json) — a
 * native capability, so it only becomes active in a build that includes it.
 * On older builds iOS simply never wakes the task; registration below is
 * guarded so it can also never break anything at startup.
 *
 * MUST be defined at module top level (Expo TaskManager requirement, same as
 * the geofence task) — imported for its side effects from App.tsx.
 */
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { syncGeofencesWithOS } from './geofenceSync';
import { syncTimeRemindersWithOS } from './timeReminderSync';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-geofence-sync';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[BackgroundNotificationSync] task error:', error);
    return;
  }
  // Payload shape differs per platform; we don't branch on it. The only remote
  // pushes this app sends are the visible "note sorted" push and the silent
  // geofence-sync push — both mean "the server-side geofence set may have
  // changed", so the right response to either is the same idempotent sync.
  console.log('[BackgroundNotificationSync] woken by remote push — syncing triggers');
  await syncGeofencesWithOS('silent-push');
  // Dated reminders have the identical gap: record a note for "tomorrow 9am",
  // force-quit, and no foreground sync will ever run to schedule it locally.
  // This wake is the only chance, and the server push still covers it either way.
  await syncTimeRemindersWithOS('silent-push');
});

export function registerBackgroundNotificationSync(): void {
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
    // Expected on builds without the remote-notification background mode —
    // the backstop is simply absent there; every existing arming path is
    // unaffected.
    console.log('[BackgroundNotificationSync] registration unavailable:', err?.message ?? err);
  });
}
