/**
 * Derived time trigger. Single source of truth for remind_at — deterministic
 * chrono-node parse of the LLM-captured temporal_date_text, relative to note
 * creation time in HST (fixed UTC-10, no DST). Only actionable types remind.
 * Unparseable / past-resolving text → null (the note still saves normally).
 */
import * as chrono from 'chrono-node';

const HST_OFFSET_MINUTES = -600; // HST is fixed UTC-10, no DST
const DEFAULT_HOUR_HST = 9;      // date-only mentions fire at 9am HST
const ACTIONABLE_TYPES = new Set(['task', 'reminder', 'commitment']);

export function deriveRemindAt(input: {
  dateText: string | null | undefined;
  objectType: string | null | undefined;
  createdAt: Date;
}): Date | null {
  if (!input.objectType || !ACTIONABLE_TYPES.has(input.objectType)) return null;
  if (!input.dateText) return null;

  try {
    const results = chrono.parse(
      input.dateText,
      { instant: input.createdAt, timezone: HST_OFFSET_MINUTES },
      { forwardDate: true } // "Friday" = the coming Friday, never last week's
    );
    if (results.length === 0) return null;

    // First date mention wins; later mentions in the same text are ignored.
    const start = results[0].start;
    let remindAt: Date;
    if (start.isCertain('hour')) {
      remindAt = start.date();
    } else {
      // Implied hours ("tomorrow morning") are not certain — they take the 9am default too.
      // Date-only: build 09:00 HST as a UTC instant (9 + 10 = 19:00 UTC).
      remindAt = new Date(Date.UTC(
        start.get('year')!,
        start.get('month')! - 1,
        start.get('day')!,
        DEFAULT_HOUR_HST - HST_OFFSET_MINUTES / 60,
        0, 0
      ));
    }

    return remindAt.getTime() > input.createdAt.getTime() ? remindAt : null;
  } catch (err) {
    console.warn('[temporalTrigger] parse failed (treated as no date):', err);
    return null;
  }
}
