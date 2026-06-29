import express from 'express';
import request from 'supertest';

jest.mock('../../auth/middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'u1' };
    next();
  },
}));
jest.mock('../../services/objectService');

import * as objectService from '../../services/objectService';
import objectRoutes from '../../routes/objects';

const app = express();
app.use(express.json());
app.use('/api/v1/objects', objectRoutes);

describe('POST /api/v1/objects/bulk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delete action returns the deleted count', async () => {
    (objectService.bulkDeleteObjects as jest.Mock).mockResolvedValue({ deleted: 3 });

    const res = await request(app)
      .post('/api/v1/objects/bulk')
      .send({ ids: ['a', 'b', 'c'], action: 'delete' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3 });
    expect(objectService.bulkDeleteObjects).toHaveBeenCalledWith('u1', ['a', 'b', 'c']);
  });

  it('rejects an unknown action with 400', async () => {
    const res = await request(app)
      .post('/api/v1/objects/bulk')
      .send({ ids: ['a'], action: 'frobnicate' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
