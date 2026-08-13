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

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/places/pending', () => {
  it('returns the pending queue', async () => {
    mockSvc.getPendingPlaceLookups.mockResolvedValue([{ id: 'pl-1', query: 'Melaleuca' }] as any);

    const res = await request(appWithUser('u-1')).get('/api/v1/places/pending');

    expect(res.status).toBe(200);
    expect(res.body.pending).toHaveLength(1);
    expect(mockSvc.getPendingPlaceLookups).toHaveBeenCalledWith('u-1');
  });

  it('is not swallowed by the /:id param routes', async () => {
    mockSvc.getPendingPlaceLookups.mockResolvedValue([]);

    const res = await request(appWithUser('u-1')).get('/api/v1/places/pending');

    expect(res.status).toBe(200);
    expect(mockSvc.getPlaceObjects).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    const res = await request(appWithUser(null)).get('/api/v1/places/pending');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/places/pending/:id/resolve', () => {
  it('accepts a candidate index', async () => {
    mockSvc.resolvePendingLookup.mockResolvedValue({ id: 'gf-new' } as any);

    const res = await request(appWithUser('u-1'))
      .post('/api/v1/places/pending/pl-1/resolve')
      .send({ candidateIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body.geofence).toMatchObject({ id: 'gf-new' });
    expect(mockSvc.resolvePendingLookup).toHaveBeenCalledWith('u-1', 'pl-1', { candidateIndex: 0 });
  });

  it('accepts coordinates with an optional radius', async () => {
    mockSvc.resolvePendingLookup.mockResolvedValue({ id: 'gf-new' } as any);

    const res = await request(appWithUser('u-1'))
      .post('/api/v1/places/pending/pl-1/resolve')
      .send({ lat: 21.336, lng: -157.915, radius: 150 });

    expect(res.status).toBe(200);
    expect(mockSvc.resolvePendingLookup).toHaveBeenCalledWith('u-1', 'pl-1', { lat: 21.336, lng: -157.915, radius: 150 });
  });

  it('accepts an existing geofence id', async () => {
    mockSvc.resolvePendingLookup.mockResolvedValue({ id: 'gf-mine' } as any);

    const res = await request(appWithUser('u-1'))
      .post('/api/v1/places/pending/pl-1/resolve')
      .send({ geofenceId: 'gf-mine' });

    expect(res.status).toBe(200);
    expect(mockSvc.resolvePendingLookup).toHaveBeenCalledWith('u-1', 'pl-1', { geofenceId: 'gf-mine' });
  });

  it('400s a body that matches none of the three shapes', async () => {
    const res = await request(appWithUser('u-1'))
      .post('/api/v1/places/pending/pl-1/resolve')
      .send({ nonsense: true });

    expect(res.status).toBe(400);
    expect(mockSvc.resolvePendingLookup).not.toHaveBeenCalled();
  });

  it("forwards the service's ownership rejection", async () => {
    mockSvc.resolvePendingLookup.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 })
    );

    const res = await request(appWithUser('u-1'))
      .post('/api/v1/places/pending/pl-1/resolve')
      .send({ candidateIndex: 0 });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/places/pending/:id/dismiss', () => {
  it('dismisses and returns ok', async () => {
    mockSvc.dismissPendingLookup.mockResolvedValue(undefined);

    const res = await request(appWithUser('u-1')).post('/api/v1/places/pending/pl-1/dismiss');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSvc.dismissPendingLookup).toHaveBeenCalledWith('u-1', 'pl-1');
  });

  it('forwards a 404 for an unknown lookup', async () => {
    mockSvc.dismissPendingLookup.mockRejectedValue(
      Object.assign(new Error('Lookup not found'), { status: 404 })
    );

    const res = await request(appWithUser('u-1')).post('/api/v1/places/pending/nope/dismiss');

    expect(res.status).toBe(404);
  });
});
