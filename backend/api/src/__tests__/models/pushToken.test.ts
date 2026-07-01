import { PushTokenModel, JobStateModel } from '../../models/PushToken';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

describe('PushTokenModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upsert inserts on conflict(token) updating user/platform/updated_at', async () => {
    mockQ.query.mockResolvedValue({} as any);
    await PushTokenModel.upsert('u1', 'ExpoTok', 'ios');
    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toMatch(/insert into hub\.push_tokens/i);
    expect(sql).toMatch(/on conflict \(token\) do update/i);
    expect(params).toEqual(['u1', 'ExpoTok', 'ios']);
  });

  it('findTokensByUser returns the token strings', async () => {
    mockQ.queryMany.mockResolvedValue([{ token: 'a' }, { token: 'b' }] as any);
    const tokens = await PushTokenModel.findTokensByUser('u1');
    expect(tokens).toEqual(['a', 'b']);
    expect(mockQ.queryMany.mock.calls[0][1]).toEqual(['u1']);
  });

  it('deleteToken deletes by token', async () => {
    mockQ.query.mockResolvedValue({} as any);
    await PushTokenModel.deleteToken('bad');
    expect(mockQ.query.mock.calls[0][0]).toMatch(/delete from hub\.push_tokens/i);
    expect(mockQ.query.mock.calls[0][1]).toEqual(['bad']);
  });
});

describe('JobStateModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getLastRun returns the timestamp or null', async () => {
    mockQ.queryOne.mockResolvedValue({ last_run_at: new Date('2026-06-21T00:00:00Z') } as any);
    const d = await JobStateModel.getLastRun('weekly_digest_push');
    expect(d?.toISOString()).toBe('2026-06-21T00:00:00.000Z');

    mockQ.queryOne.mockResolvedValue(null as any);
    expect(await JobStateModel.getLastRun('nope')).toBeNull();
  });

  it('setLastRun upserts job_state by job_name', async () => {
    mockQ.query.mockResolvedValue({} as any);
    const when = new Date('2026-06-28T04:00:00Z');
    await JobStateModel.setLastRun('weekly_digest_push', when);
    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toMatch(/insert into hub\.job_state/i);
    expect(sql).toMatch(/on conflict \(job_name\) do update/i);
    expect(params).toEqual(['weekly_digest_push', when]);
  });
});
