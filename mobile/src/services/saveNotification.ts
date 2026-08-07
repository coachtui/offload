import * as Notifications from 'expo-notifications';

/**
 * Fire a local completion notification after a save attempt.
 * Never throws — all errors are swallowed internally.
 *
 * Success notification: title = "✅ Saved", body = title (+ " — hint" when present).
 * Failure notification: title = "⚠️ Couldn't save your note".
 * Both carry data: { screen: 'Home' } so a tap can navigate there.
 */
export async function notifySaveResult({
  ok,
  title,
  hint,
  reason,
}: {
  ok: boolean;
  title?: string;
  hint?: string;
  /** Why the save failed. Shown as the notification body — a bare "couldn't
   *  save" is undiagnosable once the user has walked away from the screen. */
  reason?: string;
}): Promise<void> {
  try {
    if (ok) {
      const bodyParts: string[] = [];
      if (title) bodyParts.push(title);
      if (hint) bodyParts.push(hint);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✅ Saved',
          body: bodyParts.length > 0 ? bodyParts.join(' — ') : undefined,
          data: { screen: 'Home' },
        },
        trigger: null,
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "⚠️ Couldn't save your note",
          body: reason,
          data: { screen: 'Home' },
        },
        trigger: null,
      });
    }
  } catch {
    // never throws
  }
}
