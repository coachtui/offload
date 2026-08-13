/**
 * IANA timezone → UTC offset via Intl. Shared by remind_at derivation and the
 * weekly digest scheduler; both must degrade gracefully on garbage input
 * because timezone strings originate from client-controlled metadata.
 */

/**
 * UTC offset of an IANA zone at a given instant, in minutes east of UTC
 * (America/New_York in July → -240). null for names Intl doesn't recognize.
 */
export function resolveOffsetMinutes(timeZone: string, at: Date): number | null {
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
