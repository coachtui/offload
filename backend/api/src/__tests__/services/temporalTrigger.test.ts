import { deriveRemindAt } from '../../services/temporalTrigger';

// Reference instant: Tuesday 2026-06-30 10:00 HST == 2026-06-30T20:00:00Z
// (2026-06-29 is a Monday — same anchor the weeklySynthesisTiming test uses.)
const TUE_10AM_HST = new Date('2026-06-30T20:00:00Z');

describe('deriveRemindAt', () => {
  it('resolves a bare weekday to the COMING one at 09:00 HST', () => {
    const d = deriveRemindAt({ dateText: 'Friday', objectType: 'reminder', createdAt: TUE_10AM_HST });
    // Coming Friday = 2026-07-03; 09:00 HST = 19:00 UTC
    expect(d?.toISOString()).toBe('2026-07-03T19:00:00.000Z');
  });

  it('keeps an explicit time', () => {
    const d = deriveRemindAt({ dateText: 'tomorrow at 2pm', objectType: 'task', createdAt: TUE_10AM_HST });
    // Wed 2026-07-01 14:00 HST = 2026-07-02T00:00:00Z
    expect(d?.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });

  it('defaults a date-only mention to 09:00 HST', () => {
    const d = deriveRemindAt({ dateText: 'July 15th', objectType: 'commitment', createdAt: TUE_10AM_HST });
    expect(d?.toISOString()).toBe('2026-07-15T19:00:00.000Z');
  });

  it('returns null for past-resolving text', () => {
    expect(deriveRemindAt({ dateText: 'yesterday', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(deriveRemindAt({ dateText: 'soon', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
    expect(deriveRemindAt({ dateText: 'eventually', objectType: 'reminder', createdAt: TUE_10AM_HST })).toBeNull();
  });

  it('returns null for non-actionable object types even with a parseable date', () => {
    for (const t of ['journal', 'idea', 'preference', 'concern', 'observation', 'reference', 'question', 'decision', null, undefined]) {
      expect(deriveRemindAt({ dateText: 'Friday', objectType: t as any, createdAt: TUE_10AM_HST })).toBeNull();
    }
  });

  it('returns null for missing dateText', () => {
    expect(deriveRemindAt({ dateText: null, objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
    expect(deriveRemindAt({ dateText: '', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
  });
});
