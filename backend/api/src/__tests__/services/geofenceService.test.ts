import { getGeofenceObjects } from '../../services/geofenceService';
import { GeofenceModel } from '../../models/Geofence';
import { AtomicObjectModel } from '../../models/AtomicObject';
import { PlaceModel } from '../../models/Place';

jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');
jest.mock('../../models/Place');

const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;
const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;

const GEOFENCE_ID = 'gf-1';
const USER_ID = 'u-1';

const fakeGeofence = {
  userId: USER_ID,
  notificationSettings: { enabled: true },
} as any;

describe('getGeofenceObjects — openOnly branching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeo.findById.mockResolvedValue(fakeGeofence);
    mockGeo.getLinkedObjectIds.mockResolvedValue(['id-1', 'id-2']);
    mockGeo.getOpenLinkedObjectIds.mockResolvedValue(['id-2']);
    mockObj.findByIds.mockResolvedValue([{ toAtomicObject: () => ({ id: 'id-1' }) } as any]);
  });

  it('default (openOnly=false) calls getLinkedObjectIds and NOT getOpenLinkedObjectIds', async () => {
    await getGeofenceObjects(USER_ID, GEOFENCE_ID);

    expect(mockGeo.getLinkedObjectIds).toHaveBeenCalledWith(GEOFENCE_ID);
    expect(mockGeo.getOpenLinkedObjectIds).not.toHaveBeenCalled();
  });

  it('openOnly=true calls getOpenLinkedObjectIds and NOT getLinkedObjectIds', async () => {
    await getGeofenceObjects(USER_ID, GEOFENCE_ID, true);

    expect(mockGeo.getOpenLinkedObjectIds).toHaveBeenCalledWith(GEOFENCE_ID);
    expect(mockGeo.getLinkedObjectIds).not.toHaveBeenCalled();
  });
});

describe('getGeofenceObjects — inferred geofence resolves via its place', () => {
  const PLACE_ID = 'pl-9';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGeo.findById.mockResolvedValue({
      userId: USER_ID,
      notificationSettings: { enabled: true },
      createdBy: 'inferred',
      placeId: PLACE_ID,
    } as any);
    mockPlace.getLinkedObjectIds.mockResolvedValue(['note-1']);
    mockObj.findByIds.mockResolvedValue([{ toAtomicObject: () => ({ id: 'note-1' }) } as any]);
  });

  it('fetches notes via the place links, NOT the geofence_objects join', async () => {
    const result = await getGeofenceObjects(USER_ID, GEOFENCE_ID);

    expect(mockPlace.getLinkedObjectIds).toHaveBeenCalledWith(PLACE_ID);
    expect(mockGeo.getLinkedObjectIds).not.toHaveBeenCalled();
    expect(mockGeo.getOpenLinkedObjectIds).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 'note-1' }]);
  });

  it('returns empty when the place has no active linked notes', async () => {
    mockPlace.getLinkedObjectIds.mockResolvedValue([]);
    const result = await getGeofenceObjects(USER_ID, GEOFENCE_ID);
    expect(result).toEqual([]);
    expect(mockObj.findByIds).not.toHaveBeenCalled();
  });
});
