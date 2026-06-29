import { getPlacesOverview } from '../../services/geofenceService';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('getPlacesOverview — enabled flag', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns enabled from the geofence row and false for inferred places', async () => {
    mockQueries.queryMany
      .mockResolvedValueOnce([
        { id: 'gf-1', name: 'The Gym', open_count: '8', notification_enabled: false },
      ] as any)
      .mockResolvedValueOnce([
        { id: 'pl-1', name: 'Costco', open_count: '3' },
      ] as any);

    const result = await getPlacesOverview('u-1');
    const gym = result.find((r) => r.id === 'gf-1');
    const costco = result.find((r) => r.id === 'pl-1');

    expect(gym).toMatchObject({ kind: 'geofence', enabled: false });
    expect(costco).toMatchObject({ kind: 'place', enabled: false });
  });

  it('passes through enabled: true when geofence has notifications on', async () => {
    mockQueries.queryMany
      .mockResolvedValueOnce([
        { id: 'gf-2', name: 'Home', open_count: '1', notification_enabled: true },
      ] as any)
      .mockResolvedValueOnce([] as any);

    const result = await getPlacesOverview('u-1');
    expect(result.find((r) => r.id === 'gf-2')).toMatchObject({ kind: 'geofence', enabled: true });
  });
});
