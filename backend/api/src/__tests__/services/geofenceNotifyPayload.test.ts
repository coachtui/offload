import { getGeofenceNotifyPayload } from '../../services/geofenceService';
import { GeofenceModel } from '../../models/Geofence';
import { AtomicObjectModel } from '../../models/AtomicObject';

jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');

const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;

const USER = 'u1';
const GF = 'g1';

describe('getGeofenceNotifyPayload — cooldown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeo.findById.mockResolvedValue({
      userId: USER, name: 'The Gym',
      notificationSettings: { enabled: true },
    } as any);
    mockGeo.getOpenLinkedObjectIds.mockResolvedValue(['o1']);
    mockObj.findByIds.mockResolvedValue([{ toAtomicObject: () => ({ id: 'o1' }) } as any]);
    mockGeo.upsertTriggerState.mockResolvedValue({} as any);
  });

  it('returns null and does NOT update trigger state when within cooldown', async () => {
    const future = new Date(Date.now() + 60_000);
    mockGeo.getTriggerState.mockResolvedValue({ cooldownUntil: future } as any);

    const payload = await getGeofenceNotifyPayload(USER, GF);

    expect(payload).toBeNull();
    expect(mockGeo.upsertTriggerState).not.toHaveBeenCalled();
  });

  it('returns objects + sets a fresh cooldown (incrementVisit) when not cooling down', async () => {
    mockGeo.getTriggerState.mockResolvedValue(null as any);

    const payload = await getGeofenceNotifyPayload(USER, GF);

    expect(payload).toMatchObject({ geofenceName: 'The Gym' });
    expect(payload?.objects).toHaveLength(1);
    expect(mockGeo.upsertTriggerState).toHaveBeenCalledWith(
      USER, GF, expect.objectContaining({ incrementVisit: true })
    );
  });

  it('throws Unauthorized when the geofence belongs to another user', async () => {
    mockGeo.findById.mockResolvedValue({ userId: 'other', notificationSettings: { enabled: true } } as any);
    mockGeo.getTriggerState.mockResolvedValue(null as any);

    await expect(getGeofenceNotifyPayload(USER, GF)).rejects.toThrow('Unauthorized');
  });

  it('throws Geofence not found when findById returns null', async () => {
    mockGeo.findById.mockResolvedValue(null as any);

    await expect(getGeofenceNotifyPayload(USER, GF)).rejects.toThrow('Geofence not found');
  });

  it('suppresses an exit event when onExit is off (no cooldown burned)', async () => {
    mockGeo.findById.mockResolvedValue({
      userId: USER, name: 'Jobsite',
      notificationSettings: { enabled: true, onEnter: true, onExit: false },
    } as any);
    mockGeo.getTriggerState.mockResolvedValue(null as any);

    const payload = await getGeofenceNotifyPayload(USER, GF, 'exit');

    expect(payload).toBeNull();
    expect(mockGeo.upsertTriggerState).not.toHaveBeenCalled();
  });

  it('allows an enter event when onEnter is on', async () => {
    mockGeo.findById.mockResolvedValue({
      userId: USER, name: 'Jobsite',
      notificationSettings: { enabled: true, onEnter: true, onExit: false },
    } as any);
    mockGeo.getTriggerState.mockResolvedValue(null as any);

    const payload = await getGeofenceNotifyPayload(USER, GF, 'enter');

    expect(payload).toMatchObject({ geofenceName: 'Jobsite' });
    expect(payload?.objects).toHaveLength(1);
  });

  it('suppresses (and burns no cooldown) when there are no open notes', async () => {
    mockGeo.getTriggerState.mockResolvedValue(null as any);
    mockGeo.getOpenLinkedObjectIds.mockResolvedValue([]); // no open linked notes
    mockObj.findByIds.mockResolvedValue([]);

    const payload = await getGeofenceNotifyPayload(USER, GF, 'enter');

    expect(payload).toBeNull();
    expect(mockGeo.upsertTriggerState).not.toHaveBeenCalled();
  });
});
