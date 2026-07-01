/**
 * Reusable server→device push via the Expo Push API. First consumer is the
 * weekly digest; Phase 8 contextual resurfacing will reuse it. Never throws —
 * a failed push must not crash a caller (e.g. the cron).
 */
import { PushTokenModel } from '../models/PushToken';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendToUser(userId: string, msg: PushMessage): Promise<void> {
  try {
    const tokens = await PushTokenModel.findTokensByUser(userId);
    if (tokens.length === 0) {
      console.log(`[pushService] No push tokens for user ${userId} — nothing to send`);
      return;
    }

    const messages = tokens.map((to) => ({
      to,
      title: msg.title,
      body: msg.body,
      data: msg.data ?? {},
      sound: 'default',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.warn(`[pushService] Expo push responded ${response.status}`);
      return;
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
  } catch (err) {
    console.warn('[pushService] sendToUser failed (swallowed):', err);
  }
}
