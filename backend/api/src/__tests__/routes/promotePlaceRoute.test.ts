// backend/api/src/__tests__/routes/promotePlaceRoute.test.ts
import request from 'supertest';
import express from 'express';
import placesRouter from '../../routes/places';
import * as placeService from '../../services/placeService';

// Mock the auth middleware so tests can inject req.user directly
jest.mock('../../auth/middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/placeService');
const mockSvc = placeService as jest.Mocked<typeof placeService>;

function appWithUser(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = userId ? { id: userId } : undefined; next(); });
  app.use('/api/v1/places', placesRouter);
  return app;
}

describe('POST /api/v1/places/:id/promote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('promotes and returns the new geofence', async () => {
    mockSvc.promotePlaceToGeofence.mockResolvedValue({ id: 'gf-new', name: 'The Gym' } as any);
    const res = await request(appWithUser('u-1')).post('/api/v1/places/pl-1/promote');
    expect(res.status).toBe(200);
    expect(res.body.geofence).toMatchObject({ id: 'gf-new' });
    expect(mockSvc.promotePlaceToGeofence).toHaveBeenCalledWith('u-1', 'pl-1');
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(appWithUser(null)).post('/api/v1/places/pl-1/promote');
    expect(res.status).toBe(401);
  });
});
