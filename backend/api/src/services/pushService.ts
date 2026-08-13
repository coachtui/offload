/**
 * Reusable server→device push via the Expo Push API. Never throws; returns
 * whether delivery was handed off (false → caller may retry). Consumers: weekly
 * digest, time reminders.
 */
import { PushTokenModel } from '../models/PushToken';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /**
   * iOS delivery class (UNNotificationInterruptionLevel). Unset means `active`,
   * which Focus modes and the scheduled notification summary are allowed to
   * hold for hours — right for a digest, wrong for a reminder, which should
   * pass 'time-sensitive'. Needs the time-sensitive entitlement in the build;
   * iOS quietly downgrades it to `active` in builds without one, and Android
   * ignores the field, so it is always safe to send.
   */
  interruptionLevel?: 'active' | 'critical' | 'passive' | 'time-sensitive';
}

/**
 * Silent (content-available) push: wakes the app's JS in the background with
 * no visible notification, no sound, no badge. The one iOS mechanism that can
 * run code in a KILLED app — used to arm freshly created geofence regions
 * when no foreground sync will run (user recorded a note and immediately
 * quit). Delivery is discretionary on iOS (throttled by a system budget), so
 * this is a best-effort second chance layered on the post-save syncs, never
 * the primary path. Devices on builds without the remote-notification
 * background mode receive it as a no-op.
 */
export async function sendSilentToUser(userId: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const tokens = await PushTokenModel.findTokensByUser(userId);
    if (tokens.length === 0) return true;

    const messages = tokens.map((to) => ({
      to,
      data,
      _contentAvailable: true,
      priority: 'normal',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.warn(`[pushService] Expo silent push responded ${response.status}`);
      return false;
    }
    console.log(`[pushService] Silent push handed off to ${tokens.length} device(s) for user ${userId}`);
    return true;
  } catch (err) {
    console.warn('[pushService] sendSilentToUser failed (swallowed):', err);
    return false;
  }
}

export async function sendToUser(userId: string, msg: PushMessage): Promise<boolean> {
  try {
    const tokens = await PushTokenModel.findTokensByUser(userId);
    if (tokens.length === 0) {
      console.log(`[pushService] No push tokens for user ${userId} — nothing to send`);
      return true; // nothing to deliver; callers must not retry forever
    }

    const messages = tokens.map((to) => ({
      to,
      title: msg.title,
      body: msg.body,
      data: msg.data ?? {},
      sound: 'default',
      // Omitted rather than defaulted, so callers that don't care send exactly
      // the payload they always have.
      ...(msg.interruptionLevel ? { interruptionLevel: msg.interruptionLevel } : {}),
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.warn(`[pushService] Expo push responded ${response.status}`);
      return false;
    }

    const json = (await response.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          console.log(`[pushService] Pruning unregistered token ${tokens[i]}`);
          await PushTokenModel.deleteToken(tokens[i]);
        }
      })
    );
    return true;
  } catch (err) {
    console.warn('[pushService] sendToUser failed (swallowed):', err);
    return false;
  }
}
