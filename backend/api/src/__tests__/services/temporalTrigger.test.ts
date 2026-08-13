import { deriveRemindAt } from '../../services/temporalTrigger';
import * as chrono from 'chrono-node';

// Reference instant: Tuesday 2026-06-30 10:00 HST == 2026-06-30T20:00:00Z
// (2026-06-29 is a Monday — same anchor the weeklySynthesisTiming test uses.)
const TUE_10AM_HST = new Date('2026-06-30T20:00:00Z');

// Legacy behavior: clients that predate the timezone field send nothing and
// must keep the original fixed-HST semantics, bit for bit.
describe('deriveRemindAt — legacy HST fallback (no timezone sent)', () => {
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

  it('returns null (not throw) when chrono parse throws unexpectedly', () => {
    const spy = jest.spyOn(chrono, 'parse').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      expect(deriveRemindAt({ dateText: 'Friday', objectType: 'task', createdAt: TUE_10AM_HST })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

// Device timezone: US Eastern in 2026 is EDT (UTC-4) until Nov 1, EST (UTC-5)
// after. HST is fixed UTC-10, no DST.
describe('deriveRemindAt — device timezone', () => {
  it('date-only fires at 9am in the device zone (EDT summer)', () => {
    const remindAt = deriveRemindAt({
      dateText: 'tomorrow',
      objectType: 'reminder',
      createdAt: new Date('2026-07-01T12:00:00Z'), // 8am EDT July 1
      timezone: 'America/New_York',
    });
    // July 2, 9:00 EDT = 13:00Z
    expect(remindAt?.toISOString()).toBe('2026-07-02T13:00:00.000Z');
  });

  it('date-only fires at 9am in the device zone (EST winter)', () => {
    const remindAt = deriveRemindAt({
      dateText: 'tomorrow',
      objectType: 'task',
      createdAt: new Date('2026-01-05T12:00:00Z'), // 7am EST Jan 5
      timezone: 'America/New_York',
    });
    // Jan 6, 9:00 EST = 14:00Z
    expect(remindAt?.toISOString()).toBe('2026-01-06T14:00:00.000Z');
  });

  it('explicit times resolve as wall-clock in the device zone', () => {
    const remindAt = deriveRemindAt({
      dateText: 'tomorrow at 2pm',
      objectType: 'reminder',
      createdAt: new Date('2026-07-01T12:00:00Z'),
      timezone: 'America/New_York',
    });
    // July 2, 14:00 EDT = 18:00Z
    expect(remindAt?.toISOString()).toBe('2026-07-02T18:00:00.000Z');
  });

  it('plain-english relative dates ("in 2 days") count in the device zone', () => {
    const remindAt = deriveRemindAt({
      dateText: 'in 2 days',
      objectType: 'commitment',
      createdAt: new Date('2026-07-01T12:00:00Z'),
      timezone: 'America/New_York',
    });
    expect(remindAt?.toISOString()).toBe('2026-07-03T13:00:00.000Z');
  });

  it('uses the offset at the TARGET date across a DST boundary', () => {
    // Created Oct 30 under EDT; "in 3 days" lands Nov 2, after DST ends Nov 1.
    const remindAt = deriveRemindAt({
      dateText: 'in 3 days',
      objectType: 'reminder',
      createdAt: new Date('2026-10-30T12:00:00Z'), // 8am EDT Oct 30
      timezone: 'America/New_York',
    });
    // Nov 2, 9:00 EST (not EDT) = 14:00Z
    expect(remindAt?.toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('UTC devices work (bare "GMT" longOffset edge case)', () => {
    const remindAt = deriveRemindAt({
      dateText: 'tomorrow',
      objectType: 'reminder',
      createdAt: new Date('2026-07-01T12:00:00Z'),
      timezone: 'UTC',
    });
    expect(remindAt?.toISOString()).toBe('2026-07-02T09:00:00.000Z');
  });

  it('an unrecognized timezone degrades to HST instead of failing the save', () => {
    const remindAt = deriveRemindAt({
      dateText: 'tomorrow',
      objectType: 'reminder',
      createdAt: new Date('2026-07-01T12:00:00Z'), // 2am HST July 1
      timezone: 'Mars/Olympus_Mons',
    });
    // July 2, 9:00 HST = 19:00Z
    expect(remindAt?.toISOString()).toBe('2026-07-02T19:00:00.000Z');
  });

  it('empty-string timezone degrades to HST', () => {
    const remindAt = deriveRemindAt({
      dateText: 'tomorrow',
      objectType: 'reminder',
      createdAt: new Date('2026-07-01T12:00:00Z'),
      timezone: '',
    });
    expect(remindAt?.toISOString()).toBe('2026-07-02T19:00:00.000Z');
  });

  it('still returns null for non-actionable types and missing dates', () => {
    const createdAt = new Date('2026-07-01T12:00:00Z');
    expect(
      deriveRemindAt({ dateText: 'tomorrow', objectType: 'journal', createdAt, timezone: 'America/New_York' })
    ).toBeNull();
    expect(
      deriveRemindAt({ dateText: null, objectType: 'reminder', createdAt, timezone: 'America/New_York' })
    ).toBeNull();
  });
});
