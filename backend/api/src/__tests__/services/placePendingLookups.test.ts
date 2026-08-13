/**
 * Pending-lookup service handlers: the queue view, the one-tap resolve in its
 * three shapes, and dismiss-as-ignore. Resolving always lands on a MANUAL
 * geofence so the name-match step answers every future mention — the "teach
 * once" promise.
 */
import {
  getPendingPlaceLookups,
  resolvePendingLookup,
  dismissPendingLookup,
} from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';
import { AtomicObjectModel } from '../../models/AtomicObject';
import { PlaceLookupModel } from '../../models/PlaceLookup';
import { ReminderLifecycleEventModel } from '../../models/ReminderLifecycleEvent';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');
jest.mock('../../models/PlaceLookup', () => ({
  PlaceLookupModel: {
    findById: jest.fn(),
    findPendingByUser: jest.fn(async () => []),
    markResolved: jest.fn(async () => null),
    markDismissed: jest.fn(async () => null),
    isQueryIgnored: jest.fn(async () => false),
    create: jest.fn(async () => ({})),
  },
  PlaceProviderCacheModel: { get: jest.fn(async () => null), put: jest.fn(async () => {}) },
}));
jest.mock('../../models/ReminderLifecycleEvent', () => ({
  ReminderLifecycleEventModel: { record: jest.fn(async () => {}) },
}));
jest.mock('../../services/placeAnchors', () => ({ resolveAnchors: jest.fn(async () => []) }));
jest.mock('../../services/pushService');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;
const mockLookup = PlaceLookupModel as jest.Mocked<typeof PlaceLookupModel>;
const mockLifecycle = ReminderLifecycleEventModel as jest.Mocked<typeof ReminderLifecycleEventModel>;

const USER = 'u1';

const PENDING = {
  id: 'pl-1',
  userId: USER,
  objectId: 'obj-1',
  query: 'Melaleuca',
  status: 'pending' as const,
  provider: 'google',
  recordedLat: 21.3498,
  recordedLng: -158.0145,
  resolvedPlaceId: null,
  resolvedAt: null,
  createdAt: new Date('2026-08-12T10:00:00Z'),
  candidates: [
    { name: 'Melaleuca', address: '590 Paiea St, Honolulu, HI 96819, USA', lat: 21.3366127, lng: -157.9149545, providerPlaceId: 'google:paiea', category: 'store' },
    { name: 'Melaleuca', address: '500 Ala Moana Blvd #4480, Honolulu, HI 96813, USA', lat: 21.3010952, lng: -157.8622959, providerPlaceId: 'google:suite', category: 'cosmetics_store' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLookup.findById.mockResolvedValue(PENDING as any);
  mockLookup.findPendingByUser.mockResolvedValue([]);
  mockPlace.create.mockImplementation(async (input: any) => ({ id: 'place-new', ...input } as any));
  mockGeo.findByUserAndName.mockResolvedValue([]);
  mockGeo.create.mockResolvedValue({ id: 'gf-new', userId: USER } as any);
  mockGeo.addLinkedObject.mockResolvedValue(undefined as any);
});

describe('getPendingPlaceLookups', () => {
  it('returns pending rows with note previews and per-candidate distances', async () => {
    mockLookup.findPendingByUser.mockResolvedValue([PENDING] as any);
    mockObj.findByIds.mockResolvedValue([
      { toAtomicObject: () => ({ id: 'obj-1', title: 'Pick up my order', content: 'pick up my order from Melaleuca' }) },
    ] as any);

    const views = await getPendingPlaceLookups(USER);

    expect(views).toHaveLength(1);
    expect(views[0].notePreview).toBe('Pick up my order');
    // Recorded at 21.3498,-158.0145 → Paiea ~10.5 km, Ala Moana ~16.7 km
    expect(views[0].candidates[0].distanceKm).toBeGreaterThan(9);
    expect(views[0].candidates[0].distanceKm).toBeLessThan(12);
    expect(views[0].candidates[1].distanceKm).toBeGreaterThan(views[0].candidates[0].distanceKm!);
  });

  it('returns [] without touching objects when nothing is pending', async () => {
    const views = await getPendingPlaceLookups(USER);

    expect(views).toEqual([]);
    expect(mockObj.findByIds).not.toHaveBeenCalled();
  });
});

describe('resolvePendingLookup — candidate tap', () => {
  it('creates a MANUAL place + geofence at the candidate, links the note, resolves the row', async () => {
    const geofence = await resolvePendingLookup(USER, 'pl-1', { candidateIndex: 0 });

    expect(mockPlace.create).toHaveBeenCalledWith(expect.objectContaining({
      normalizedName: 'Melaleuca',
      providerPlaceId: 'google:paiea',
      lat: 21.3366127,
      lng: -157.9149545,
      confidence: 1.0,
      userConfirmed: true,
      createdBy: 'manual',
    }));
    expect(mockGeo.create).toHaveBeenCalledWith(USER, expect.objectContaining({
      name: 'Melaleuca',
      createdBy: 'manual',
      placeId: 'place-new',
    }));
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-new', 'obj-1');
    expect(mockLookup.markResolved).toHaveBeenCalledWith('pl-1', 'place-new');
    expect(mockLifecycle.record).toHaveBeenCalledWith(
      'PLACE_USER_RESOLVED',
      expect.objectContaining({ userId: USER, method: 'candidate', geofenceId: 'gf-new' })
    );
    expect(geofence.id).toBe('gf-new');
  });

  it('rejects a candidate index that does not exist', async () => {
    await expect(resolvePendingLookup(USER, 'pl-1', { candidateIndex: 7 }))
      .rejects.toMatchObject({ status: 400 });
    expect(mockPlace.create).not.toHaveBeenCalled();
  });

  it('reuses an existing manual geofence with the same name instead of duplicating', async () => {
    mockGeo.findByUserAndName.mockResolvedValue([
      { id: 'gf-existing', userId: USER, createdBy: 'manual' } as any,
    ]);

    const geofence = await resolvePendingLookup(USER, 'pl-1', { candidateIndex: 0 });

    expect(mockGeo.create).not.toHaveBeenCalled();
    expect(geofence.id).toBe('gf-existing');
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-existing', 'obj-1');
  });
});

describe('resolvePendingLookup — coordinates ("use my current location" / map pick)', () => {
  it('creates the place under the SPOKEN name at the given point', async () => {
    await resolvePendingLookup(USER, 'pl-1', { lat: 21.336, lng: -157.915, radius: 150 });

    expect(mockPlace.create).toHaveBeenCalledWith(expect.objectContaining({
      normalizedName: 'Melaleuca', // the word the user says, so name-match catches future notes
      lat: 21.336,
      lng: -157.915,
      radiusMeters: 150,
      createdBy: 'manual',
    }));
    expect(mockLifecycle.record).toHaveBeenCalledWith(
      'PLACE_USER_RESOLVED',
      expect.objectContaining({ method: 'coordinates' })
    );
  });
});

describe('resolvePendingLookup — existing geofence', () => {
  it('links the note to the chosen geofence and resolves with no new place', async () => {
    mockGeo.findById.mockResolvedValue({ id: 'gf-mine', userId: USER } as any);

    const geofence = await resolvePendingLookup(USER, 'pl-1', { geofenceId: 'gf-mine' });

    expect(mockPlace.create).not.toHaveBeenCalled();
    expect(mockGeo.create).not.toHaveBeenCalled();
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-mine', 'obj-1');
    expect(mockLookup.markResolved).toHaveBeenCalledWith('pl-1', null);
    expect(geofence.id).toBe('gf-mine');
  });

  it("rejects another user's geofence", async () => {
    mockGeo.findById.mockResolvedValue({ id: 'gf-theirs', userId: 'someone-else' } as any);

    await expect(resolvePendingLookup(USER, 'pl-1', { geofenceId: 'gf-theirs' }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('ownership and state guards', () => {
  it("404s a lookup that doesn't exist", async () => {
    mockLookup.findById.mockResolvedValue(null);
    await expect(resolvePendingLookup(USER, 'nope', { candidateIndex: 0 }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("403s another user's lookup", async () => {
    mockLookup.findById.mockResolvedValue({ ...PENDING, userId: 'someone-else' } as any);
    await expect(resolvePendingLookup(USER, 'pl-1', { candidateIndex: 0 }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('409s a lookup that was already handled', async () => {
    mockLookup.findById.mockResolvedValue({ ...PENDING, status: 'resolved' } as any);
    await expect(resolvePendingLookup(USER, 'pl-1', { candidateIndex: 0 }))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe('dismissPendingLookup', () => {
  it('marks the row dismissed — which IS the ignore-list entry — and records it', async () => {
    await dismissPendingLookup(USER, 'pl-1');

    expect(mockLookup.markDismissed).toHaveBeenCalledWith('pl-1');
    expect(mockLifecycle.record).toHaveBeenCalledWith(
      'PLACE_LOOKUP_DISMISSED',
      expect.objectContaining({ userId: USER, query: 'Melaleuca' })
    );
  });

  it("403s another user's lookup", async () => {
    mockLookup.findById.mockResolvedValue({ ...PENDING, userId: 'someone-else' } as any);
    await expect(dismissPendingLookup(USER, 'pl-1')).rejects.toMatchObject({ status: 403 });
  });
});
