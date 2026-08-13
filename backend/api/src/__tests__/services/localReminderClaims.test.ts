/**
 * The device/server handoff for time reminders. The property that matters:
 * a reminder is owned by exactly one of them at a time — never both (two
 * notifications) and never neither (silence).
 */
import { listPendingTimeReminders, claimLocalReminders } from '../../services/objectService';
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

const NOW = new Date('2026-08-13T19:00:00Z');
const USER = 'user-1';

describe('listPendingTimeReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the id, pre-rendered body and ISO fire time', async () => {
    mockQ.queryMany.mockResolvedValue([
      {
        id: 'obj-1',
        title: null,
        content: 'call the dentist\nsecond line ignored',
        remind_at: new Date('2026-08-14T17:00:00Z'),
      },
    ] as any);

    await expect(listPendingTimeReminders(USER, NOW)).resolves.toEqual([
      { objectId: 'obj-1', body: 'call the dentist', remindAt: '2026-08-14T17:00:00.000Z' },
    ]);
  });

  it('renders the body exactly like the push does (title wins over content)', async () => {
    mockQ.queryMany.mockResolvedValue([
      { id: 'obj-1', title: 'Call the dentist', content: 'raw transcript', remind_at: NOW },
    ] as any);

    const [reminder] = await listPendingTimeReminders(USER, NOW);
    expect(reminder.body).toBe('Call the dentist');
  });

  it('asks only for future, unfired, open/active, actionable, undeleted rows', async () => {
    mockQ.queryMany.mockResolvedValue([]);
    await listPendingTimeReminders(USER, NOW);

    const [sql, params] = mockQ.queryMany.mock.calls[0];
    expect(sql).toContain('remind_at > $2');
    expect(sql).toContain('reminder_fired_at IS NULL');
    expect(sql).toContain("IN ('open', 'active')");
    expect(sql).toContain("object_type IN ('task', 'reminder', 'commitment')");
    expect(sql).toContain('deleted_at IS NULL');
    expect(params).toEqual([USER, NOW]);
  });

  it('does not filter by claim state — a device must see what it already owns', async () => {
    mockQ.queryMany.mockResolvedValue([]);
    await listPendingTimeReminders(USER, NOW);

    const [sql] = mockQ.queryMany.mock.calls[0];
    expect(sql).not.toContain('reminder_local_claim_at');
  });
});

describe('setLocalReminderClaims', () => {
  beforeEach(() => jest.clearAllMocks());

  it('claims the named rows and releases every other pending row in one statement', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 2 } as any);

    await AtomicObjectModel.setLocalReminderClaims(USER, ['obj-1', 'obj-2'], NOW);

    const [sql, params] = mockQ.query.mock.calls[1];
    // The CASE is what makes the device's set authoritative: in the list → owned,
    // absent from it → handed back.
    expect(sql).toContain('SET reminder_local_claim_at = CASE WHEN id = ANY($2::uuid[]) THEN $3 ELSE NULL END');
    expect(sql).toContain('user_id = $1');
    expect(params).toEqual([USER, ['obj-1', 'obj-2'], NOW]);
  });

  it('is scoped to the caller — never touches another user\'s reminders', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 0 } as any);
    await AtomicObjectModel.setLocalReminderClaims(USER, ['obj-1'], NOW);

    for (const [sql] of mockQ.query.mock.calls) {
      expect(sql).toContain('user_id = $1');
    }
  });

  it('only writes rows whose ownership actually flips', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 0 } as any);
    await AtomicObjectModel.setLocalReminderClaims(USER, ['obj-1'], NOW);

    const [sql] = mockQ.query.mock.calls[1];
    expect(sql).toContain('(reminder_local_claim_at IS NULL) = (id = ANY($2::uuid[]))');
  });

  it('an empty set hands everything back (permission revoked, sign-out)', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 3 } as any);

    await expect(claimLocalReminders(USER, [])).resolves.toEqual({ changed: 3 });
    const [, params] = mockQ.query.mock.calls[1];
    expect(params[1]).toEqual([]);
  });

  it('never claims a row that already fired', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 0 } as any);
    await AtomicObjectModel.setLocalReminderClaims(USER, ['obj-1'], NOW);

    const [sql] = mockQ.query.mock.calls[1];
    expect(sql).toContain('reminder_fired_at IS NULL');
    expect(sql).toContain('deleted_at IS NULL');
  });

  // The bug this guards: the device fires a reminder locally, then the next sync
  // omits it (its time has passed) — and if that released the claim, the push job
  // would see an overdue unfired unclaimed row and send it a second time.
  it('records a device-owned reminder as fired once its time has passed', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 1 } as any);
    await AtomicObjectModel.setLocalReminderClaims(USER, [], NOW);

    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toContain('SET reminder_fired_at = remind_at');
    expect(sql).toContain('reminder_local_claim_at IS NOT NULL');
    expect(sql).toContain('remind_at <= $2');
    expect(params).toEqual([USER, NOW]);
  });

  it('rearranges ownership only for reminders that have not come due', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 0 } as any);
    await AtomicObjectModel.setLocalReminderClaims(USER, ['obj-1'], NOW);

    const [sql] = mockQ.query.mock.calls[1];
    expect(sql).toContain('remind_at > $3');
  });
});
