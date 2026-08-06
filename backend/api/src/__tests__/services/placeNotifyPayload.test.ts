import { getPlaceNotifyPayload } from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { AtomicObjectModel } from '../../models/AtomicObject';

jest.mock('../../models/Place');
jest.mock('../../models/AtomicObject');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;

const USER = 'u1';
const PLACE = 'p1';

describe('getPlaceNotifyPayload — note gate + cooldown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlace.findById.mockResolvedValue({
      id: PLACE, userId: USER, normalizedName: 'Costco',
    } as any);
    mockPlace.getLinkedObjectIds.mockResolvedValue(['o1']);
    mockObj.findByIds.mockResolvedValue([{ toAtomicObject: () => ({ id: 'o1' }) } as any]);
    mockPlace.upsertTriggerState.mockResolvedValue({} as any);
  });

  it('returns null and does NOT update trigger state when within cooldown', async () => {
    const future = new Date(Date.now() + 60_000);
    mockPlace.getTriggerState.mockResolvedValue({ cooldownUntil: future } as any);

    const payload = await getPlaceNotifyPayload(USER, PLACE);

    expect(payload).toBeNull();
    expect(mockPlace.upsertTriggerState).not.toHaveBeenCalled();
  });

  it('returns objects + sets a fresh cooldown (incrementVisit) when a note is open', async () => {
    mockPlace.getTriggerState.mockResolvedValue(null as any);

    const payload = await getPlaceNotifyPayload(USER, PLACE);

    expect(payload).toMatchObject({ placeName: 'Costco' });
    expect(payload?.objects).toHaveLength(1);
    expect(mockPlace.upsertTriggerState).toHaveBeenCalledWith(
      USER, PLACE, expect.objectContaining({ incrementVisit: true })
    );
  });

  it('suppresses (and burns no cooldown) when the place has no open notes', async () => {
    mockPlace.getTriggerState.mockResolvedValue(null as any);
    mockPlace.getLinkedObjectIds.mockResolvedValue([]);
    mockObj.findByIds.mockResolvedValue([]);

    const payload = await getPlaceNotifyPayload(USER, PLACE);

    expect(payload).toBeNull();
    expect(mockPlace.upsertTriggerState).not.toHaveBeenCalled();
  });

  it('returns null for a place owned by another user', async () => {
    mockPlace.findById.mockResolvedValue({ id: PLACE, userId: 'other' } as any);

    const payload = await getPlaceNotifyPayload(USER, PLACE);

    expect(payload).toBeNull();
    expect(mockPlace.upsertTriggerState).not.toHaveBeenCalled();
  });
});
