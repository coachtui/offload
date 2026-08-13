/**
 * Time reminders, fired from the device.
 *
 * Same principle as arrival reminders: the moment a reminder is due is the
 * worst possible moment to need the network. A server push has to traverse
 * Railway and APNs while the phone might be in a dead zone or the API mid
 * deploy; an OS-scheduled local notification needs neither, and fires to the
 * second even in airplane mode.
 *
 * So the device schedules every pending reminder as a dated local notification
 * and tells the backend which ones it owns, and the push job skips those (see
 * migration 021). The claim is honest by construction — we report exactly the
 * identifiers the OS confirmed, after scheduling — so anything we couldn't take
 * (permission denied, or past iOS's pending-request budget) falls back to the
 * push automatically rather than silently never firing.
 *
 * Idempotent and cheap to over-call: it diffs the OS's scheduled set against
 * the server's pending set and only touches the difference. Callers are
 * fire-and-forget UI paths, so it never throws.
 */
import * as Notifications from 'expo-notifications';
import { apiService } from './api';

/**
 * Must match REMINDER_TITLE in the backend's services/reminderContent.ts — the
 * user shouldn't be able to tell whether a reminder came from the device or the
 * server. The body doesn't need copying: it arrives pre-rendered from there.
 */
const REMINDER_TITLE = '⏰ Reminder';

/** Namespaces our requests so a diff never touches a geofence or save notification. */
const ID_PREFIX = 'time-reminder:';

/**
 * iOS keeps only the 64 soonest-firing pending requests per app and silently
 * drops the rest, so we stay under it deliberately and let the server push
 * cover the tail — a visible fallback beats an invisible ceiling.
 */
const MAX_SCHEDULED = 56;

/** Below this, scheduling races the fire time; the push job is the safer path. */
const MIN_LEAD_MS = 5_000;

const identifierFor = (objectId: string) => `${ID_PREFIX}${objectId}`;

interface Scheduled {
  identifier: string;
  remindAt: string | null;
}

/** Our currently scheduled reminders, keyed by object id. */
async function currentlyScheduled(): Promise<Map<string, Scheduled>> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const mine = new Map<string, Scheduled>();
  for (const request of all) {
    if (!request.identifier.startsWith(ID_PREFIX)) continue;
    const objectId = request.identifier.slice(ID_PREFIX.length);
    const data = request.content?.data as { remindAt?: string } | undefined;
    mine.set(objectId, { identifier: request.identifier, remindAt: data?.remindAt ?? null });
  }
  return mine;
}

/**
 * Bring the OS's scheduled reminders in line with the server's pending set and
 * re-state what this device owns. Returns how many reminders are scheduled.
 */
export async function syncTimeRemindersWithOS(reason: string): Promise<number> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      // Can't display anything, so own nothing — the push job takes them all
      // back. Still clear any claims from when permission was granted.
      await releaseAll(`${reason}/no-permission`);
      return 0;
    }

    const { reminders } = await apiService.getPendingReminders();
    const cutoff = Date.now() + MIN_LEAD_MS;
    const desired = reminders
      .filter((r) => new Date(r.remindAt).getTime() > cutoff)
      .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime())
      .slice(0, MAX_SCHEDULED);

    const dropped = reminders.length - desired.length;
    if (dropped > 0) {
      console.log(`[timeReminderSync] (${reason}) leaving ${dropped} reminder(s) to the server push`);
    }

    const scheduled = await currentlyScheduled();
    const desiredIds = new Set(desired.map((r) => r.objectId));

    // Cancel ours the server no longer lists — resolved, archived, deleted, or
    // already fired. Without this the phone keeps pinging about closed notes.
    for (const [objectId, entry] of scheduled) {
      if (!desiredIds.has(objectId)) {
        await Notifications.cancelScheduledNotificationAsync(entry.identifier);
        scheduled.delete(objectId);
      }
    }

    const owned: string[] = [];
    for (const reminder of desired) {
      const existing = scheduled.get(reminder.objectId);
      // Re-schedule when the time moved; identity alone can't detect that.
      if (existing && existing.remindAt === reminder.remindAt) {
        owned.push(reminder.objectId);
        continue;
      }
      if (existing) {
        await Notifications.cancelScheduledNotificationAsync(existing.identifier);
      }
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: identifierFor(reminder.objectId),
          content: {
            title: REMINDER_TITLE,
            body: reminder.body,
            sound: true,
            // Matches the push's interruptionLevel so a reminder breaks through
            // Focus whichever way it arrives. (Local API spells it camelCase.)
            interruptionLevel: 'timeSensitive',
            data: {
              screen: 'Objects',
              objectId: reminder.objectId,
              // Read back on the next sync to detect a moved reminder.
              remindAt: reminder.remindAt,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(reminder.remindAt),
          },
        });
        owned.push(reminder.objectId);
      } catch (err) {
        // Don't claim what we failed to schedule — leave it to the push.
        console.warn(`[timeReminderSync] could not schedule ${reminder.objectId}:`, err);
      }
    }

    console.log(`[timeReminderSync] (${reason}) ${owned.length} reminder(s) scheduled on device`);
    await claim(owned, reason);
    return owned.length;
  } catch (err) {
    console.warn(`[timeReminderSync] (${reason}) failed:`, err);
    return 0;
  }
}

/**
 * Drop every locally scheduled reminder and hand them all back to the server.
 * Used on sign-out (the next user must not inherit them) and when notification
 * permission is gone.
 */
export async function releaseAll(reason: string): Promise<void> {
  try {
    const scheduled = await currentlyScheduled();
    for (const entry of scheduled.values()) {
      await Notifications.cancelScheduledNotificationAsync(entry.identifier);
    }
    await claim([], reason);
  } catch (err) {
    console.warn(`[timeReminderSync] (${reason}) release failed:`, err);
  }
}

async function claim(objectIds: string[], reason: string): Promise<void> {
  try {
    await apiService.claimLocalReminders(objectIds);
  } catch (err) {
    // The OS schedule is already correct; the server just doesn't know yet, so
    // both may fire until the next sync. A duplicate beats a missed reminder.
    console.warn(`[timeReminderSync] (${reason}) claim failed:`, err);
  }
}
