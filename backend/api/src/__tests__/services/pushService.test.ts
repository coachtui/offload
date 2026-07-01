import { sendToUser } from '../../services/pushService';
import { PushTokenModel } from '../../models/PushToken';

jest.mock('../../models/PushToken', () => ({
  PushTokenModel: { findTokensByUser: jest.fn(), deleteToken: jest.fn() },
  JobStateModel: { getLastRun: jest.fn(), setLastRun: jest.fn() },
}));
const mockTokens = PushTokenModel as jest.Mocked<typeof PushTokenModel>;

const MSG = { title: 't', body: 'b', data: { screen: 'Objects' } };

describe('pushService.sendToUser return value', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { (global.fetch as any) = undefined; });

  it('returns true when Expo accepts the push', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['ExponentPushToken[x]']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
    }) as any;
    await expect(sendToUser('u1', MSG)).resolves.toBe(true);
  });

  it('returns true when the user has no tokens (nothing to deliver)', async () => {
    mockTokens.findTokensByUser.mockResolvedValue([]);
    await expect(sendToUser('u1', MSG)).resolves.toBe(true);
  });

  it('returns false on HTTP non-OK', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['ExponentPushToken[x]']);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as any;
    await expect(sendToUser('u1', MSG)).resolves.toBe(false);
  });

  it('returns false (not a throw) when fetch rejects', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['ExponentPushToken[x]']);
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    await expect(sendToUser('u1', MSG)).resolves.toBe(false);
  });
});

describe('pushService.sendToUser delivery behavior', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { (global.fetch as any) = undefined; });

  it('POSTs one Expo message per token with title/body/data', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['TokA', 'TokB']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }),
    }) as any;

    await sendToUser('u1', { title: 'T', body: 'B', data: { screen: 'Insights' } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const sent = JSON.parse(opts.body);
    expect(sent).toEqual([
      { to: 'TokA', title: 'T', body: 'B', data: { screen: 'Insights' }, sound: 'default' },
      { to: 'TokB', title: 'T', body: 'B', data: { screen: 'Insights' }, sound: 'default' },
    ]);
  });

  it('deletes a token that Expo reports as DeviceNotRegistered', async () => {
    mockTokens.findTokensByUser.mockResolvedValue(['GoodTok', 'DeadTok']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok' },
          { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    }) as any;

    await sendToUser('u1', { title: 'T', body: 'B' });

    expect(mockTokens.deleteToken).toHaveBeenCalledWith('DeadTok');
    expect(mockTokens.deleteToken).not.toHaveBeenCalledWith('GoodTok');
  });
});
