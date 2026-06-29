import { promotePlaceToGeofence } from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;

const USER_ID = 'u-1';
const PLACE_ID = 'pl-1';

describe('promotePlaceToGeofence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findById.mockResolvedValue({
      id: PLACE_ID, userId: USER_ID, normalizedName: 'The Gym',
      lat: 1.23, lng: 4.56, radiusMeters: 150,
    } as any);
    mockPlace.getLinkedObjectIds.mockResolvedValue(['obj-1', 'obj-2']);
    mockGeo.create.mockResolvedValue({ id: 'gf-new' } as any);
    mockGeo.addLinkedObject.mockResolvedValue(undefined as any);
    mockPlace.setLinkInactive.mockResolvedValue(undefined as any);
  });

  it('creates a manual geofence at the place location with smart defaults', async () => {
    await promotePlaceToGeofence(USER_ID, PLACE_ID);
    expect(mockGeo.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      name: 'The Gym',
      center: expect.objectContaining({ latitude: 1.23, longitude: 4.56 }),
      radius: 200,
      type: 'custom',
      createdBy: 'manual',
      placeId: PLACE_ID,
      notificationSettings: expect.objectContaining({ enabled: true, onEnter: true, onExit: false }),
    }));
  });

  it('migrates active note links onto the new geofence and deactivates place links', async () => {
    await promotePlaceToGeofence(USER_ID, PLACE_ID);
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-new', 'obj-1');
    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('gf-new', 'obj-2');
    expect(mockPlace.setLinkInactive).toHaveBeenCalledWith(PLACE_ID, 'obj-1');
    expect(mockPlace.setLinkInactive).toHaveBeenCalledWith(PLACE_ID, 'obj-2');
  });

  it('throws 404 when the place does not belong to the user', async () => {
    mockPlace.findById.mockResolvedValue({ id: PLACE_ID, userId: 'someone-else' } as any);
    await expect(promotePlaceToGeofence(USER_ID, PLACE_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when the place does not exist', async () => {
    mockPlace.findById.mockResolvedValue(null);
    await expect(promotePlaceToGeofence(USER_ID, PLACE_ID))
      .rejects.toMatchObject({ status: 404 });
  });
});
