import { GeofenceModel } from '../../models/Geofence';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('GeofenceModel.getOpenLinkedObjectIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('selects only open/active notes, newest first', async () => {
    mockQueries.queryMany.mockResolvedValue([{ object_id: 'o2' }, { object_id: 'o1' }] as any);
    const ids = await GeofenceModel.getOpenLinkedObjectIds('g1');
    expect(ids).toEqual(['o2', 'o1']);
    const sql = mockQueries.queryMany.mock.calls[0][0] as string;
    expect(sql).toMatch(/state\s+IN\s*\(\s*'open'\s*,\s*'active'\s*\)/i);
    expect(sql).toMatch(/ao\.created_at\s+DESC/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });
});
