/**
 * The accuracy contract: the reminder job must arm its next wake-up for the
 * instant the next reminder is due, not for a fixed tick. These tests read the
 * delay the scheduler hands to setTimeout, because that delay *is* how late a
 * reminder can be.
 *
 * The job keeps its timer in module state, so each test loads a fresh copy.
 */
const NOW = new Date('2026-07-03T19:02:00Z');
const MAX_SLEEP_MS = 15 * 60 * 1000;
const WAKE_PADDING_MS = 250;
const MIN_SLEEP_MS = 250;

/**
 * Boot the job against a stubbed "next due" instant and return the delay it
 * armed. `nextDue` of null means nothing is pending.
 */
async function armedDelayFor(nextDue: Date | null): Promise<number> {
  let delay = -1;

  await jest.isolateModulesAsync(async () => {
    jest.doMock('../../db/queries', () => ({
      queryMany: jest.fn().mockResolvedValue([]), // nothing due right now
      queryOne: jest.fn().mockResolvedValue({ next_due: nextDue }),
      query: jest.fn().mockResolvedValue({}),
    }));
    jest.doMock('../../services/pushService', () => ({
      sendToUser: jest.fn().mockResolvedValue(true),
    }));

    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((_fn: unknown, ms?: number) => {
        delay = ms ?? 0;
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);

    const { startTimeReminderJob } = require('../../jobs/timeReminderJob');
    startTimeReminderJob();
    await new Promise(process.nextTick); // let the boot sweep settle

    setTimeoutSpy.mockRestore();
  });

  return delay;
}

describe('time reminder scheduler', () => {
  // Freeze the clock so the armed delay is exact rather than jittery. nextTick
  // stays real — it's what flushes the boot sweep's promises.
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(NOW);
  });
  afterAll(() => jest.useRealTimers());

  it('sleeps until the exact due instant (plus a hair) — not a fixed tick', async () => {
    const in90s = new Date(NOW.getTime() + 90_000);
    await expect(armedDelayFor(in90s)).resolves.toBe(90_000 + WAKE_PADDING_MS);
  });

  it('is accurate to the second, so a reminder 20s out waits ~20s', async () => {
    const in20s = new Date(NOW.getTime() + 20_000);
    await expect(armedDelayFor(in20s)).resolves.toBe(20_000 + WAKE_PADDING_MS);
  });

  it('caps a far-future reminder at the heartbeat instead of sleeping for days', async () => {
    const inThreeDays = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    await expect(armedDelayFor(inThreeDays)).resolves.toBe(MAX_SLEEP_MS);
  });

  it('falls back to the heartbeat when nothing is pending', async () => {
    await expect(armedDelayFor(null)).resolves.toBe(MAX_SLEEP_MS);
  });

  it('never spins: an already-past due instant still waits out the floor', async () => {
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000);
    await expect(armedDelayFor(tenSecondsAgo)).resolves.toBe(MIN_SLEEP_MS);
  });

  it('a re-arm pulls the wake-up earlier for a note created after boot', async () => {
    const delays: number[] = [];

    await jest.isolateModulesAsync(async () => {
      // Boot with nothing pending, then a note lands due in 60s.
      const queryOne = jest
        .fn()
        .mockResolvedValueOnce({ next_due: null })
        .mockResolvedValue({ next_due: new Date(NOW.getTime() + 60_000) });
      jest.doMock('../../db/queries', () => ({
        queryMany: jest.fn().mockResolvedValue([]),
        queryOne,
        query: jest.fn().mockResolvedValue({}),
      }));
      jest.doMock('../../services/pushService', () => ({
        sendToUser: jest.fn().mockResolvedValue(true),
      }));

      const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((_fn: unknown, ms?: number) => {
        delays.push(ms ?? 0);
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);

      const job = require('../../jobs/timeReminderJob');
      job.startTimeReminderJob();
      await new Promise(process.nextTick);
      job.rearmTimeReminderJob();
      await new Promise(process.nextTick);

      spy.mockRestore();
    });

    // Would have slept the full heartbeat; the re-arm cut it to the new due time.
    expect(delays).toEqual([MAX_SLEEP_MS, 60_000 + WAKE_PADDING_MS]);
  });

  it('a re-arm before the job starts does nothing (no stray timer in tests/scripts)', async () => {
    let armed = 0;

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../db/queries', () => ({
        queryMany: jest.fn().mockResolvedValue([]),
        queryOne: jest.fn().mockResolvedValue({ next_due: null }),
        query: jest.fn().mockResolvedValue({}),
      }));
      jest.doMock('../../services/pushService', () => ({
        sendToUser: jest.fn().mockResolvedValue(true),
      }));

      const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((() => {
        armed += 1;
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown) as typeof setTimeout);

      require('../../jobs/timeReminderJob').rearmTimeReminderJob();
      await new Promise(process.nextTick);

      spy.mockRestore();
    });

    expect(armed).toBe(0);
  });
});
