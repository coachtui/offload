import { getPlacesOverview } from '../../services/geofenceService';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('getPlacesOverview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns manual geofences, inferred geofences, then geofence-less detected places', async () => {
    mockQueries.queryMany
      // 1st query: manual geofences (always shown)
      .mockResolvedValueOnce([
        { id: 'g-home', name: 'Home', open_count: '2', notification_enabled: true },
        { id: 'g-gym', name: 'Gym', open_count: '0', notification_enabled: false },
      ] as any)
      // 2nd query: inferred geofences with >=1 open note (real toggleable bells)
      .mockResolvedValueOnce([
        { id: 'g-mcd-1', name: "McDonald's", open_count: '1', notification_enabled: true },
        { id: 'g-mcd-2', name: "McDonald's", open_count: '1', notification_enabled: true },
      ] as any)
      // 3rd query: detected places WITHOUT a geofence (promotable)
      .mockResolvedValueOnce([
        { id: 'p-ramen', name: 'Ramen Shop', open_count: '1' },
      ] as any);

    const result = await getPlacesOverview('u1');

    expect(result).toEqual([
      { kind: 'geofence', id: 'g-home', name: 'Home', openCount: 2, labeled: true, enabled: true },
      { kind: 'geofence', id: 'g-gym', name: 'Gym', openCount: 0, labeled: true, enabled: false },
      { kind: 'geofence', id: 'g-mcd-1', name: "McDonald's", openCount: 1, labeled: false, enabled: true },
      { kind: 'geofence', id: 'g-mcd-2', name: "McDonald's", openCount: 1, labeled: false, enabled: true },
      { kind: 'place', id: 'p-ramen', name: 'Ramen Shop', openCount: 1, labeled: false, enabled: false },
    ]);
  });

  it('lists each branch of a same-named chain as its own geofence row (independently toggleable)', async () => {
    mockQueries.queryMany
      .mockResolvedValueOnce([] as any) // no manual geofences
      .mockResolvedValueOnce([
        { id: 'g-mcd-1', name: "McDonald's", open_count: '1', notification_enabled: true },
        { id: 'g-mcd-2', name: "McDonald's", open_count: '1', notification_enabled: false },
        { id: 'g-mcd-3', name: "McDonald's", open_count: '1', notification_enabled: true },
      ] as any)
      .mockResolvedValueOnce([] as any); // no geofence-less places

    const result = await getPlacesOverview('u1');

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(['g-mcd-1', 'g-mcd-2', 'g-mcd-3']);
    // Distinct ids => toggling one does not affect the others; enabled is per-row.
    expect(result.map((r) => r.enabled)).toEqual([true, false, true]);
    expect(result.every((r) => r.kind === 'geofence')).toBe(true);
  });
});
