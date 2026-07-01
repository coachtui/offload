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
  it('does not re-fire if already run this ISO week', () => {
    const earlierSameHour = new Date('2026-06-29T04:00:00Z');
    expect(shouldFireWeekly(SUN_18_HST, earlierSameHour)).toBe(false);
  });
  it('fires again once a new ISO week has started', () => {
    const lastWeek = new Date('2026-06-22T04:00:00Z'); // prior week
    expect(shouldFireWeekly(SUN_18_HST, lastWeek)).toBe(true);
  });
});
