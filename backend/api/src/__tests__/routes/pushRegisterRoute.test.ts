import express from 'express';
import request from 'supertest';
import pushRoutes from '../../routes/push';
import { PushTokenModel } from '../../models/PushToken';

jest.mock('../../models/PushToken');
jest.mock('../../services/pushService', () => ({ sendToUser: jest.fn() }));
jest.mock('../../auth/middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: 'u1' }; next(); },
}));

const mockPT = PushTokenModel as jest.Mocked<typeof PushTokenModel>;

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/push', pushRoutes);
  return a;
}

describe('POST /api/v1/push/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts the token and returns ok', async () => {
    mockPT.upsert.mockResolvedValue();
    const res = await request(app())
      .post('/api/v1/push/register')
      .send({ token: 'ExpoTok', platform: 'ios' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockPT.upsert).toHaveBeenCalledWith('u1', 'ExpoTok', 'ios');
  });

  it('rejects a missing token with 400', async () => {
    const res = await request(app()).post('/api/v1/push/register').send({ platform: 'ios' });
    expect(res.status).toBe(400);
    expect(mockPT.upsert).not.toHaveBeenCalled();
  });
});
