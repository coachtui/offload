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

describe('resolveObjectPlaces — labeled geofence matching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findByUserAndName.mockResolvedValue([]); // no existing inferred place
  });

  it('links to a labeled geofence by name and skips geocoding', async () => {
    mockGeo.findByUserAndName.mockResolvedValue([{ id: 'g-home', name: 'Home' } as any]);

    await resolveObjectPlaces('u1', 'obj1', ['home']);

    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('g-home', 'obj1');
    expect(mockRes.resolvePlaceNameMulti).not.toHaveBeenCalled(); // no Nominatim
    expect(mockPlace.create).not.toHaveBeenCalled();
  });

  it('falls back to geocoding when no labeled geofence matches', async () => {
    mockGeo.findByUserAndName.mockResolvedValue([]);
    mockRes.resolvePlaceNameMulti.mockResolvedValue([]); // unresolvable, but path was taken

    await resolveObjectPlaces('u1', 'obj1', ['some ramen shop']);

    expect(mockGeo.addLinkedObject).not.toHaveBeenCalled();
    expect(mockRes.resolvePlaceNameMulti).toHaveBeenCalledWith('some ramen shop', undefined);
  });
});
