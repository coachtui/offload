import { resolveObjectPlaces } from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';
import * as resolution from '../../services/placeResolutionService';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');
jest.mock('../../services/placeResolutionService');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockRes = resolution as jest.Mocked<typeof resolution>;

const geofence = (id: string, name: string, createdBy = 'manual') =>
  ({ id, name, createdBy } as any);

describe('resolveObjectPlaces — labeled geofence matching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findByUserId.mockResolvedValue([]); // no existing inferred places
    mockGeo.findByUserId.mockResolvedValue([]);
  });

  it('links to a labeled geofence by name and skips geocoding', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofence('g-home', 'Home')]);

    await resolveObjectPlaces('u1', 'obj1', ['home']);

    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('g-home', 'obj1');
    expect(mockRes.resolvePlaceNameMulti).not.toHaveBeenCalled(); // no Nominatim
    expect(mockPlace.create).not.toHaveBeenCalled();
  });

  // Regression: notes saying "the ammunitions project" were dropped entirely —
  // exact-match missed the "Ammunitions" geofence, and OSM has no such place.
  it('links a spoken phrase to its shorter geofence label', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofence('g-ammo', 'Ammunitions')]);

    await resolveObjectPlaces('u1', 'obj1', ['ammunitions project']);

    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('g-ammo', 'obj1');
    expect(mockRes.resolvePlaceNameMulti).not.toHaveBeenCalled();
    expect(mockPlace.create).not.toHaveBeenCalled();
  });

  // The guardrail: a hardware-store errand must not fire the Home geofence.
  it('does not link a generic label inside a longer phrase', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofence('g-home', 'Home')]);
    mockRes.resolvePlaceNameMulti.mockResolvedValue([]);

    await resolveObjectPlaces('u1', 'obj1', ['home depot']);

    expect(mockGeo.addLinkedObject).not.toHaveBeenCalled();
    expect(mockRes.resolvePlaceNameMulti).toHaveBeenCalledWith('home depot', undefined);
  });

  // Inferred geofences surface notes via the backing place, not geofence_objects.
  it('ignores inferred geofences when name-matching', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofence('g-inf', 'Safeway', 'inferred')]);
    mockRes.resolvePlaceNameMulti.mockResolvedValue([]);

    await resolveObjectPlaces('u1', 'obj1', ['Safeway']);

    expect(mockGeo.addLinkedObject).not.toHaveBeenCalled();
    expect(mockRes.resolvePlaceNameMulti).toHaveBeenCalledWith('Safeway', undefined);
  });

  it('dedupes onto an existing inferred place by name', async () => {
    mockPlace.findByUserId.mockResolvedValue([
      { id: 'p-costco', normalizedName: 'Costco Gasoline' } as any,
    ]);

    await resolveObjectPlaces('u1', 'obj1', ['costco gasoline station']);

    expect(mockPlace.linkObject).toHaveBeenCalledWith('p-costco', 'obj1', 'mentioned_in_note');
    expect(mockRes.resolvePlaceNameMulti).not.toHaveBeenCalled();
  });

  it('falls back to geocoding when no labeled geofence matches', async () => {
    mockRes.resolvePlaceNameMulti.mockResolvedValue([]); // unresolvable, but path was taken

    await resolveObjectPlaces('u1', 'obj1', ['some ramen shop']);

    expect(mockGeo.addLinkedObject).not.toHaveBeenCalled();
    expect(mockRes.resolvePlaceNameMulti).toHaveBeenCalledWith('some ramen shop', undefined);
  });
});
