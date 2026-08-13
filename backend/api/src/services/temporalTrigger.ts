/**
 * Derived time trigger. Single source of truth for remind_at — deterministic
 * chrono-node parse of the LLM-captured temporal_date_text, relative to note
 * creation time in the DEVICE's IANA timezone (sent with each recording,
 * DST-aware via Intl). Clients that don't send one — pre-timezone builds —
 * keep the original fixed-HST behavior (UTC-10, no DST). Only actionable
 * types remind. Unparseable / past-resolving / garbage-timezone input never
 * fails the save: the note persists, remind_at just falls back or goes null.
 */
import * as chrono from 'chrono-node';

const FALLBACK_OFFSET_MINUTES = -600; // legacy fixed HST (UTC-10, no DST)
const DEFAULT_HOUR_LOCAL = 9;         // date-only mentions fire at 9am local
const ACTIONABLE_TYPES = new Set(['task', 'reminder', 'commitment']);

/**
 * UTC offset of an IANA zone at a given instant, in minutes east of UTC
 * (America/New_York in July → -240). null for names Intl doesn't recognize.
 */
function resolveOffsetMinutes(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (name === 'GMT') return 0; // UTC prints bare "GMT", no offset digits
    const m = name.match(/^GMT([+-])(\d{1,2}):?(\d{2})?$/);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? '0', 10));
  } catch {
    return null; // invalid IANA name throws in the DateTimeFormat constructor
  }
}

/**
 * Wall-clock time in the user's zone → UTC instant. The offset is re-resolved
 * at the target date, not the creation date, so a reminder that crosses a DST
 * boundary ("in 3 days" spoken the week clocks change) still fires at the
 * right local hour. One refinement pass is enough: offsets shift by whole
 * fractions of an hour and the guess is already within one offset-width.
 */
function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetGuessMinutes: number,
  timeZone: string | null
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall - offsetGuessMinutes * 60_000;
  if (timeZone) {
    const refined = resolveOffsetMinutes(timeZone, new Date(utc));
    if (refined !== null) utc = wall - refined * 60_000;
  }
  return new Date(utc);
}

export function deriveRemindAt(input: {
  dateText: string | null | undefined;
  objectType: string | null | undefined;
  createdAt: Date;
  /** Device IANA timezone (e.g. "America/New_York"). Absent/invalid → fixed HST. */
  timezone?: string | null;
}): Date | null {
  if (!input.objectType || !ACTIONABLE_TYPES.has(input.objectType)) return null;
  if (!input.dateText) return null;

  try {
    const tzName =
      typeof input.timezone === 'string' && input.timezone.trim() !== ''
        ? input.timezone
        : null;
    const creationOffset =
      (tzName !== null ? resolveOffsetMinutes(tzName, input.createdAt) : null) ??
      FALLBACK_OFFSET_MINUTES;

    const results = chrono.parse(
      input.dateText,
      { instant: input.createdAt, timezone: creationOffset },
      { forwardDate: true } // "Friday" = the coming Friday, never last week's
    );
    if (results.length === 0) return null;

    // First date mention wins; later mentions in the same text are ignored.
    const start = results[0].start;
    let remindAt: Date;
    if (start.isCertain('timezoneOffset')) {
      // The text carried its own zone ("3pm EST") — chrono already resolved it.
      remindAt = start.date();
    } else if (start.isCertain('hour')) {
      remindAt = wallClockToUtc(
        start.get('year')!,
        start.get('month')!,
        start.get('day')!,
        start.get('hour')!,
        start.get('minute') ?? 0,
        creationOffset,
        tzName
      );
    } else {
      // Implied hours ("tomorrow morning") are not certain — they take the 9am default too.
      remindAt = wallClockToUtc(
        start.get('year')!,
        start.get('month')!,
        start.get('day')!,
        DEFAULT_HOUR_LOCAL,
        0,
        creationOffset,
        tzName
      );
    }

    return remindAt.getTime() > input.createdAt.getTime() ? remindAt : null;
  } catch (err) {
    console.warn('[temporalTrigger] parse failed (treated as no date):', err);
    return null;
  }
}
