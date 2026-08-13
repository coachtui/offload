import { shouldFireWeekly } from '../../jobs/weeklySynthesisJob';

// HST = UTC-10. Sunday 18:00 HST == Monday 04:00 UTC.
const SUN_18_HST = new Date('2026-06-29T04:00:00Z'); // Mon 2026-06-29 04:00Z = Sun 18:00 HST
const SUN_17_HST = new Date('2026-06-29T03:00:00Z'); // Sun 17:00 HST
const SUN_19_HST = new Date('2026-06-29T05:00:00Z'); // Sun 19:00 HST
const SAT_18_HST = new Date('2026-06-28T04:00:00Z'); // Sat 18:00 HST

describe('shouldFireWeekly', () => {
  it('fires at Sunday 18:00 HST when never run', () => {
    expect(shouldFireWeekly(SUN_18_HST, null)).toBe(true);
  });
  it('does not fire outside the 18:00 HST hour', () => {
    expect(shouldFireWeekly(SUN_17_HST, null)).toBe(false);
    expect(shouldFireWeekly(SUN_19_HST, null)).toBe(false);
  });
  it('does not fire on a non-Sunday', () => {
    expect(shouldFireWeekly(SAT_18_HST, null)).toBe(false);
  });
  it('does not fire on a weekday at 18:00 HST', () => {
    const wed18Hst = new Date('2026-06-25T04:00:00Z');
    expect(shouldFireWeekly(wed18Hst, null)).toBe(false);
  });
  it('does not re-fire if already run this ISO week', () => {
    const earlierSameHour = new Date('2026-06-24T20:00:00Z');
    expect(shouldFireWeekly(SUN_18_HST, earlierSameHour)).toBe(false);
  });
  it('fires again once a new ISO week has started', () => {
    const lastWeek = new Date('2026-06-22T04:00:00Z'); // prior week
    expect(shouldFireWeekly(SUN_18_HST, lastWeek)).toBe(true);
  });
});

// Per-user timezone: 2026-06-28 is a Sunday; NY is EDT (UTC-4) in June,
// EST (UTC-5) in January.
describe('shouldFireWeekly — per-user timezone', () => {
  const SUN_18_EDT = new Date('2026-06-28T22:00:00Z'); // Sun 18:00 in New York (summer)
  const SUN_18_EST = new Date('2026-01-11T23:00:00Z'); // Sun 18:00 in New York (winter)

  it('fires at Sunday 18:00 in the user zone (EDT summer)', () => {
    expect(shouldFireWeekly(SUN_18_EDT, null, 'America/New_York')).toBe(true);
  });

  it('fires at Sunday 18:00 in the user zone (EST winter)', () => {
    expect(shouldFireWeekly(SUN_18_EST, null, 'America/New_York')).toBe(true);
  });

  it('does not fire for an NY user at 18:00 HST (already Monday midnight in NY)', () => {
    expect(shouldFireWeekly(SUN_18_HST, null, 'America/New_York')).toBe(false);
  });

  it('does not fire for an HST-fallback user at 18:00 NY time (only noon in HST)', () => {
    expect(shouldFireWeekly(SUN_18_EDT, null, null)).toBe(false);
  });

  it('dedupes per ISO week computed in the user zone', () => {
    const earlierSameWeek = new Date('2026-06-24T15:00:00Z');
    expect(shouldFireWeekly(SUN_18_EDT, earlierSameWeek, 'America/New_York')).toBe(false);
    const priorWeek = new Date('2026-06-21T22:00:00Z');
    expect(shouldFireWeekly(SUN_18_EDT, priorWeek, 'America/New_York')).toBe(true);
  });

  it('an unrecognized timezone falls back to HST semantics', () => {
    expect(shouldFireWeekly(SUN_18_HST, null, 'Mars/Olympus_Mons')).toBe(true);
    expect(shouldFireWeekly(SUN_18_EDT, null, 'Mars/Olympus_Mons')).toBe(false);
  });
});
