import request from 'supertest';
import express from 'express';
import geofencesRouter from '../../routes/geofences';
import * as geofenceService from '../../services/geofenceService';

jest.mock('../../auth/middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../../services/geofenceService');
const mockSvc = geofenceService as jest.Mocked<typeof geofenceService>;

function appWithUser(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = userId ? { id: userId } : undefined; next(); });
  app.use('/api/v1/geofences', geofencesRouter);
  return app;
}

describe('POST /api/v1/geofences/:id/notify', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns cooldown:false with objects when not cooling down', async () => {
    mockSvc.getGeofenceNotifyPayload.mockResolvedValue({
      objects: [{ id: 'o1' }] as any, geofenceName: 'The Gym',
    });
    const res = await request(appWithUser('u-1')).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cooldown: false, geofenceName: 'The Gym' });
    expect(res.body.objects).toHaveLength(1);
  });

  it('returns cooldown:true with empty objects when cooling down', async () => {
    mockSvc.getGeofenceNotifyPayload.mockResolvedValue(null);
    const res = await request(appWithUser('u-1')).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cooldown: true, objects: [], geofenceName: null });
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(appWithUser(null)).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(401);
  });

  it('maps "Geofence not found" to 404', async () => {
    mockSvc.getGeofenceNotifyPayload.mockRejectedValue(new Error('Geofence not found'));
    const res = await request(appWithUser('u-1')).post('/api/v1/geofences/g-1/notify');
    expect(res.status).toBe(404);
  });
});
