/**
 * listGeofences — openObjectCount attachment.
 *
 * The count is snapshotted client-side at region-sync time and powers the
 * offline arrival notification (fired when a background wake can't reach
 * /notify). A wrong count here means either a silent arrival (0 for a geofence
 * that has notes) or a noteless ping (>0 for one that doesn't) — the two
 * failure modes this feature exists to prevent.
 */
import { listGeofences } from '../../services/geofenceService';
import { GeofenceModel } from '../../models/Geofence';
import * as queries from '../../db/queries';

jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');
jest.mock('../../models/Place');
jest.mock('../../db/queries');

const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockQueries = queries as jest.Mocked<typeof queries>;

const USER_ID = 'u-1';

function fakeRow(id: string) {
  return { toGeofence: () => ({ id, name: `gf-${id}` }) } as any;
}

describe('listGeofences — openObjectCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attaches counts from both the manual and inferred count queries', async () => {
    mockGeo.findByUserId.mockResolvedValue([fakeRow('m1'), fakeRow('i1')]);
    // First queryMany call = manual counts, second = inferred counts (Promise.all order)
    mockQueries.queryMany
      .mockResolvedValueOnce([{ id: 'm1', open_count: '2' }] as any)
      .mockResolvedValueOnce([{ id: 'i1', open_count: '5' }] as any);

    const result = await listGeofences(USER_ID);

    expect(result).toEqual([
      expect.objectContaining({ id: 'm1', openObjectCount: 2 }),
      expect.objectContaining({ id: 'i1', openObjectCount: 5 }),
    ]);
  });

  it('defaults to 0 for a geofence missing from both count queries', async () => {
    mockGeo.findByUserId.mockResolvedValue([fakeRow('m1')]);
    mockQueries.queryMany
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    const result = await listGeofences(USER_ID);

    expect(result[0].openObjectCount).toBe(0);
  });

  it('treats an unparsable count as 0, not NaN', async () => {
    mockGeo.findByUserId.mockResolvedValue([fakeRow('m1')]);
    mockQueries.queryMany
      .mockResolvedValueOnce([{ id: 'm1', open_count: null }] as any)
      .mockResolvedValueOnce([] as any);

    const result = await listGeofences(USER_ID);

    expect(result[0].openObjectCount).toBe(0);
  });

  it('skips the count queries entirely for a user with no geofences', async () => {
    mockGeo.findByUserId.mockResolvedValue([]);

    const result = await listGeofences(USER_ID);

    expect(result).toEqual([]);
    expect(mockQueries.queryMany).not.toHaveBeenCalled();
  });
});
