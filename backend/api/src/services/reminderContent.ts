/**
 * The one place a reminder's notification text is decided.
 *
 * A time reminder can be delivered two ways — a server push, or a local iOS
 * notification the device scheduled ahead of time — and the user is meant to
 * be unable to tell which one they got. Both read the body from here so the
 * wording can't drift apart.
 */

/** First line of the title (preferred) or content, trimmed to fit a push body. */
export function reminderBody(title: string | null, content: string): string {
  return (title || content).split('\n')[0].slice(0, 178);
}

export const REMINDER_TITLE = '⏰ Reminder';
