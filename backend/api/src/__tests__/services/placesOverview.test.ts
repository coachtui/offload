import { getPlacesOverview } from '../../services/geofenceService';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('getPlacesOverview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns labeled geofences (always) and inferred places with open notes', async () => {
    // First query: labeled geofences with open counts
    mockQueries.queryMany
      .mockResolvedValueOnce([
        { id: 'g-home', name: 'Home', open_count: '2' },
        { id: 'g-gym', name: 'Gym', open_count: '0' },
      ] as any)
      // Second query: inferred places with open_count >= 1
      .mockResolvedValueOnce([
        { id: 'p-ramen', name: 'Ramen Shop', open_count: '1' },
      ] as any);

    const result = await getPlacesOverview('u1');

    expect(result).toEqual([
      { kind: 'geofence', id: 'g-home', name: 'Home', openCount: 2, labeled: true },
      { kind: 'geofence', id: 'g-gym', name: 'Gym', openCount: 0, labeled: true },
      { kind: 'place', id: 'p-ramen', name: 'Ramen Shop', openCount: 1, labeled: false },
    ]);
  });
});
