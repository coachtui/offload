/**
 * Reap-on-resolve for inferred geofences.
 *
 * Auto-created geofences used to outlive the note that spawned them. Because
 * one spoken place name fans out to up to 3 branches and MAX_INFERRED_GEOFENCES
 * is 15, roughly five reminders permanently exhausted the budget — after which
 * the app silently stopped auto-creating geofences, and dead regions kept
 * spending iOS's 20 monitoring slots. These tests pin the two halves that make
 * reclaiming the budget safe: empty inferred geofences are removed, and a place
 * that gets a new note gets its region back.
 */
import {
  reapEmptyInferredGeofences,
  rearmStrandedInferredGeofences,
  resolveObjectPlaces,
} from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';
import { resolvePlaceNameMulti } from '../../services/placeResolutionService';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');
// Mock only the geocoder — haversineKm must stay real so the near/far branch
// fall-through logic under test actually measures distance.
jest.mock('../../services/placeResolutionService', () => ({
  ...jest.requireActual('../../services/placeResolutionService'),
  resolvePlaceNameMulti: jest.fn(),
}));

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockResolve = resolvePlaceNameMulti as jest.MockedFunction<typeof resolvePlaceNameMulti>;

const USER_ID = 'u-1';

describe('reapEmptyInferredGeofences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findStrandedWithOpenNotes.mockResolvedValue([]);
  });

  it('removes inferred geofences that have no open note left', async () => {
    mockGeo.deleteEmptyInferred.mockResolvedValue([
      { id: 'gf-1', name: 'Costco' },
      { id: 'gf-2', name: 'Costco Gasoline' },
    ]);

    const count = await reapEmptyInferredGeofences(USER_ID, 'object-resolved');

    expect(count).toBe(2);
    expect(mockGeo.deleteEmptyInferred).toHaveBeenCalledWith(USER_ID);
  });

  it('runs the stranded-place healing sweep after every reap', async () => {
    mockGeo.deleteEmptyInferred.mockResolvedValue([{ id: 'gf-1', name: 'Costco' }]);

    await reapEmptyInferredGeofences(USER_ID, 'object-resolved');

    expect(mockPlace.findStrandedWithOpenNotes).toHaveBeenCalledWith(USER_ID);
  });

  it('skips the sweep when nothing was reaped', async () => {
    mockGeo.deleteEmptyInferred.mockResolvedValue([]);

    await reapEmptyInferredGeofences(USER_ID, 'object-resolved');

    expect(mockPlace.findStrandedWithOpenNotes).not.toHaveBeenCalled();
  });

  it('reports zero when every inferred geofence still has an open note', async () => {
    mockGeo.deleteEmptyInferred.mockResolvedValue([]);

    expect(await reapEmptyInferredGeofences(USER_ID, 'object-resolved')).toBe(0);
  });

  it('never throws — housekeeping must not fail the user action that triggered it', async () => {
    mockGeo.deleteEmptyInferred.mockRejectedValue(new Error('db down'));

    await expect(reapEmptyInferredGeofences(USER_ID, 'object-resolved')).resolves.toBe(0);
  });
});

describe('rearmStrandedInferredGeofences', () => {
  const strandedPlace = {
    id: 'pl-1',
    userId: USER_ID,
    normalizedName: 'Costco',
    lat: 21.3,
    lng: -157.8,
    radiusMeters: 150,
    category: 'shop',
    confidence: 0.8,
    userConfirmed: true,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGeo.findByUserId.mockResolvedValue([]);
    mockGeo.create.mockResolvedValue({ id: 'gf-new' } as any);
    mockPlace.countInferredGeofences.mockResolvedValue(0);
  });

  it('recreates geofences for places with open notes and no region', async () => {
    mockPlace.findStrandedWithOpenNotes.mockResolvedValue([strandedPlace]);

    const rearmed = await rearmStrandedInferredGeofences(USER_ID, 'object-reopened');

    expect(rearmed).toBe(1);
    expect(mockGeo.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      placeId: 'pl-1',
      createdBy: 'inferred',
      name: 'Costco',
    }));
  });

  it('leaves low-confidence unconfirmed places unmonitored', async () => {
    mockPlace.findStrandedWithOpenNotes.mockResolvedValue([
      { ...strandedPlace, confidence: 0.2, userConfirmed: false },
    ]);

    const rearmed = await rearmStrandedInferredGeofences(USER_ID, 'object-reopened');

    expect(rearmed).toBe(0);
    expect(mockGeo.create).not.toHaveBeenCalled();
  });

  it('still respects the inferred cap and the manual-shadow rule', async () => {
    mockPlace.findStrandedWithOpenNotes.mockResolvedValue([strandedPlace]);
    mockPlace.countInferredGeofences.mockResolvedValue(15);

    expect(await rearmStrandedInferredGeofences(USER_ID, 'object-reopened')).toBe(0);
    expect(mockGeo.create).not.toHaveBeenCalled();
  });

  it('never throws — sweep failures must not fail the user action', async () => {
    mockPlace.findStrandedWithOpenNotes.mockRejectedValue(new Error('db down'));

    await expect(rearmStrandedInferredGeofences(USER_ID, 'object-reopened')).resolves.toBe(0);
  });
});

describe('re-arming a place that lost its geofence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeo.findByUserId.mockResolvedValue([]);
    mockGeo.create.mockResolvedValue({ id: 'gf-new' } as any);
    mockPlace.linkObject.mockResolvedValue(undefined as any);
    mockPlace.countInferredGeofences.mockResolvedValue(0);
  });

  const reapedPlace = {
    id: 'pl-1',
    userId: USER_ID,
    normalizedName: 'Costco',
    lat: 21.3,
    lng: -157.8,
    radiusMeters: 150,
    category: 'shop',
    confidence: 0.8,
  } as any;

  it('recreates the geofence when a new note lands on a place the reaper emptied', async () => {
    mockPlace.findByUserId.mockResolvedValue([reapedPlace]);
    mockGeo.findByPlaceId.mockResolvedValue([]); // reaped — no region left

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Costco']);

    expect(mockPlace.linkObject).toHaveBeenCalledWith('pl-1', 'obj-2', 'mentioned_in_note');
    expect(mockGeo.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      placeId: 'pl-1',
      createdBy: 'inferred',
      name: 'Costco',
    }));
  });

  it('does not duplicate a region for a place that still has one', async () => {
    mockPlace.findByUserId.mockResolvedValue([reapedPlace]);
    mockGeo.findByPlaceId.mockResolvedValue([{ id: 'gf-existing' } as any]);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Costco']);

    expect(mockPlace.linkObject).toHaveBeenCalledWith('pl-1', 'obj-2', 'mentioned_in_note');
    expect(mockGeo.create).not.toHaveBeenCalled();
  });

  it('leaves a below-threshold place unmonitored — being mentioned again is not new confidence', async () => {
    mockPlace.findByUserId.mockResolvedValue([{ ...reapedPlace, confidence: 0.2 }]);
    mockGeo.findByPlaceId.mockResolvedValue([]);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Costco']);

    expect(mockGeo.create).not.toHaveBeenCalled();
  });

  it('still respects the inferred cap when re-arming', async () => {
    mockPlace.findByUserId.mockResolvedValue([reapedPlace]);
    mockGeo.findByPlaceId.mockResolvedValue([]);
    mockPlace.countInferredGeofences.mockResolvedValue(15);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Costco']);

    expect(mockGeo.create).not.toHaveBeenCalled();
  });

  it('links a chain note to EVERY same-name branch place, not just the newest', async () => {
    // Two Foodland branch places from an earlier note's geocode fan-out. The
    // old single-match dedupe linked only branches[0]; a user standing at
    // branch 2 then got silence from every notification path.
    const branch1 = { ...reapedPlace, id: 'pl-1', normalizedName: 'Foodland' };
    const branch2 = { ...reapedPlace, id: 'pl-2', normalizedName: 'Foodland' };
    mockPlace.findByUserId.mockResolvedValue([branch1, branch2]);
    mockGeo.findByPlaceId.mockResolvedValue([{ id: 'gf-existing' } as any]);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Foodland']);

    expect(mockPlace.linkObject).toHaveBeenCalledWith('pl-1', 'obj-2', 'mentioned_in_note');
    expect(mockPlace.linkObject).toHaveBeenCalledWith('pl-2', 'obj-2', 'mentioned_in_note');
    expect(mockResolve).not.toHaveBeenCalled(); // no location → no far-branch fallthrough
  });

  it('geocodes for a local branch when every matched place is far from the user', async () => {
    // Known branch is ~28km away; user records the note across town.
    const farBranch = { ...reapedPlace, lat: 21.55, lng: -158.05 };
    mockPlace.findByUserId.mockResolvedValue([farBranch]);
    mockGeo.findByPlaceId.mockResolvedValue([{ id: 'gf-existing' } as any]);
    mockResolve.mockResolvedValue([]);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Costco'], { latitude: 21.3, longitude: -157.8 });

    expect(mockPlace.linkObject).toHaveBeenCalledWith('pl-1', 'obj-2', 'mentioned_in_note');
    expect(mockResolve).toHaveBeenCalled(); // fell through to find the local branch
  });

  it('does not geocode when a matched place is already near the user', async () => {
    const nearBranch = { ...reapedPlace, lat: 21.301, lng: -157.801 };
    mockPlace.findByUserId.mockResolvedValue([nearBranch]);
    mockGeo.findByPlaceId.mockResolvedValue([{ id: 'gf-existing' } as any]);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['Costco'], { latitude: 21.3, longitude: -157.8 });

    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('re-arms a place matched by proximity, not just by name', async () => {
    mockPlace.findByUserId.mockResolvedValue([]); // no name match
    mockResolve.mockResolvedValue([{
      rawName: 'costco',
      normalizedName: 'Costco',
      providerPlaceId: 'osm-1',
      lat: 21.3,
      lng: -157.8,
      category: 'shop',
      confidence: 0.8,
    } as any]);
    mockPlace.findNearby.mockResolvedValue([reapedPlace]);
    mockGeo.findByPlaceId.mockResolvedValue([]);

    await resolveObjectPlaces(USER_ID, 'obj-2', ['costco']);

    expect(mockPlace.create).not.toHaveBeenCalled(); // deduped onto the existing place
    expect(mockGeo.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      placeId: 'pl-1',
      createdBy: 'inferred',
    }));
  });
});
