import { GeofenceModel } from '../../models/Geofence';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

function row(name: string) {
  return {
    id: 'g1', user_id: 'u1', name, center_latitude: 21.3, center_longitude: -157.8,
    radius: 100, type: 'home', associated_objects: [], notification_enabled: true,
    notification_on_enter: true, notification_on_exit: false,
    notification_quiet_hours_start: null, notification_quiet_hours_end: null,
    place_id: null, created_by: 'manual', created_at: new Date(), updated_at: new Date(),
  };
}

describe('GeofenceModel.findByUserAndName', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries with an exact case-insensitive name match and returns models', async () => {
    mockQueries.queryMany.mockResolvedValue([row('Home')] as any);
    const result = await GeofenceModel.findByUserAndName('u1', 'home');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Home');
    const sql = mockQueries.queryMany.mock.calls[0][0] as string;
    expect(sql).toMatch(/lower\(name\)\s*=\s*lower\(\$2\)/i);
    expect(mockQueries.queryMany.mock.calls[0][1]).toEqual(['u1', 'home']);
  });

  it('returns empty array when nothing matches', async () => {
    mockQueries.queryMany.mockResolvedValue([] as any);
    const result = await GeofenceModel.findByUserAndName('u1', 'nowhere');
    expect(result).toEqual([]);
  });
});
