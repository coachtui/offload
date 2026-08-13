import { processDueReminders } from '../../jobs/timeReminderJob';
import * as queries from '../../db/queries';
import * as pushService from '../../services/pushService';

jest.mock('../../db/queries');
jest.mock('../../services/pushService');
const mockQ = queries as jest.Mocked<typeof queries>;
const mockPush = pushService as jest.Mocked<typeof pushService>;

const NOW = new Date('2026-07-03T19:02:00Z');
const dueRow = { id: 'obj-1', user_id: 'u1', content: 'call the dentist Friday\nmore detail', title: null };

describe('processDueReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pushes each due reminder and marks it fired on success', async () => {
    mockQ.queryMany.mockResolvedValue([dueRow] as any);
    mockPush.sendToUser.mockResolvedValue(true);
    mockQ.query.mockResolvedValue({} as any);

    await processDueReminders(NOW);

    expect(mockPush.sendToUser).toHaveBeenCalledWith('u1', {
      title: '⏰ Reminder',
      body: 'call the dentist Friday',
      data: { screen: 'Objects', objectId: 'obj-1' },
      interruptionLevel: 'time-sensitive',
    });
    const [updateSql, updateParams] = mockQ.query.mock.calls[0];
    expect(updateSql).toContain('SET reminder_fired_at');
    expect(updateParams).toEqual([NOW, 'obj-1']);
  });

  it('releases the claim when the push fails, so the next run retries', async () => {
    mockQ.queryMany.mockResolvedValue([dueRow] as any);
    mockPush.sendToUser.mockResolvedValue(false);
    mockQ.query.mockResolvedValue({} as any);

    await processDueReminders(NOW);

    expect(mockQ.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toContain('SET reminder_claimed_at = NULL');
    expect(sql).not.toContain('reminder_fired_at');
    expect(params).toEqual(['obj-1']);
  });

  it('prefers the title as the notification body when present', async () => {
    mockQ.queryMany.mockResolvedValue([{ ...dueRow, title: 'Call the dentist' }] as any);
    mockPush.sendToUser.mockResolvedValue(true);
    mockQ.query.mockResolvedValue({} as any);

    await processDueReminders(NOW);

    expect(mockPush.sendToUser.mock.calls[0][1].body).toBe('Call the dentist');
  });

  it('claims rows atomically: one UPDATE...RETURNING, not a bare SELECT', async () => {
    mockQ.queryMany.mockResolvedValue([]);
    await processDueReminders(NOW);

    const [sql] = mockQ.queryMany.mock.calls[0];
    expect(sql).toContain('UPDATE hub.atomic_objects SET reminder_claimed_at');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('RETURNING id, user_id, content, title');
  });

  it('claim query filters to unfired, due, unclaimed, open/active, actionable, undeleted', async () => {
    mockQ.queryMany.mockResolvedValue([]);
    await processDueReminders(NOW);

    const [sql, params] = mockQ.queryMany.mock.calls[0];
    expect(sql).toContain('remind_at <= $1');
    expect(sql).toContain('reminder_fired_at IS NULL');
    expect(sql).toContain('reminder_claimed_at IS NULL OR reminder_claimed_at <= $2');
    expect(sql).toContain("IN ('open', 'active')");
    expect(sql).toContain("object_type IN ('task', 'reminder', 'commitment')");
    expect(sql).toContain('deleted_at IS NULL');
    expect(mockPush.sendToUser).not.toHaveBeenCalled();

    // $2 is the stale-claim cutoff: one lease (5 min) behind now, so a claim
    // left behind by a crashed process becomes reclaimable instead of stuck.
    const [now, cutoff] = params as [Date, Date];
    expect(now).toEqual(NOW);
    expect(NOW.getTime() - cutoff.getTime()).toBe(5 * 60 * 1000);
  });
});
