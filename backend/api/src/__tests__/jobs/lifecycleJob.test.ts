import { runLifecycleSweep } from '../../jobs/lifecycleJob';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

describe('runLifecycleSweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQ.query.mockResolvedValue({ rowCount: 2 } as any);
  });

  it('runs exactly three archive rules and reports counts', async () => {
    const result = await runLifecycleSweep();
    expect(mockQ.query).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ resolvedArchived: 2, firedArchived: 2, decayedArchived: 2 });
  });

  it('rule 1: archives resolved until_done items after 7 days', async () => {
    await runLifecycleSweep();
    const sql = mockQ.query.mock.calls[0][0] as string;
    expect(sql).toContain("SET state = 'archived'");
    expect(sql).toContain("retention_policy = 'until_done'");
    expect(sql).toContain("state = 'resolved'");
    expect(sql).toContain("state_updated_at < NOW() - INTERVAL '7 days'");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('rule 2: archives fired reminders after 3 days', async () => {
    await runLifecycleSweep();
    const sql = mockQ.query.mock.calls[1][0] as string;
    expect(sql).toContain("object_type = 'reminder'");
    expect(sql).toContain('reminder_fired_at IS NOT NULL');
    expect(sql).toContain("reminder_fired_at < NOW() - INTERVAL '3 days'");
    expect(sql).toContain("state IN ('open', 'active')");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('rule 3: archives untouched decay notes after 90 days', async () => {
    await runLifecycleSweep();
    const sql = mockQ.query.mock.calls[2][0] as string;
    expect(sql).toContain("retention_policy = 'decay'");
    expect(sql).toContain("created_at < NOW() - INTERVAL '90 days'");
    expect(sql).toContain("last_accessed_at IS NULL OR last_accessed_at < NOW() - INTERVAL '90 days'");
    expect(sql).toContain("state IN ('open', 'active')");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('never touches long_term or user_confirmed policies', async () => {
    await runLifecycleSweep();
    for (const call of mockQ.query.mock.calls) {
      const sql = call[0] as string;
      expect(sql).not.toContain('long_term');
      expect(sql).not.toContain('user_confirmed');
    }
  });
});
