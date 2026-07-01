import { sendToUser } from '../../services/pushService';
import { PushTokenModel } from '../../models/PushToken';

jest.mock('../../models/PushToken');
const mockPT = PushTokenModel as jest.Mocked<typeof PushTokenModel>;

describe('pushService.sendToUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('POSTs one Expo message per token with title/body/data', async () => {
    mockPT.findTokensByUser.mockResolvedValue(['TokA', 'TokB']);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }),
    });

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
    mockPT.findTokensByUser.mockResolvedValue(['GoodTok', 'DeadTok']);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok' },
          { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    });

    await sendToUser('u1', { title: 'T', body: 'B' });

    expect(mockPT.deleteToken).toHaveBeenCalledWith('DeadTok');
    expect(mockPT.deleteToken).not.toHaveBeenCalledWith('GoodTok');
  });

  it('no tokens → no fetch, no throw', async () => {
    mockPT.findTokensByUser.mockResolvedValue([]);
    await expect(sendToUser('u1', { title: 'T', body: 'B' })).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('swallows network errors (never throws)', async () => {
    mockPT.findTokensByUser.mockResolvedValue(['TokA']);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    await expect(sendToUser('u1', { title: 'T', body: 'B' })).resolves.toBeUndefined();
  });
});
