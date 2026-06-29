import { GeofenceModel } from '../../models/Geofence';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('GeofenceModel trigger state', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getTriggerState maps a row to camelCase and queries geofence_trigger_state', async () => {
    mockQueries.queryOne.mockResolvedValue({
      id: 't1', user_id: 'u1', geofence_id: 'g1',
      last_entered_at: null, last_notified_at: null,
      cooldown_until: null, visit_count: 3,
    } as any);

    const state = await GeofenceModel.getTriggerState('u1', 'g1');

    expect(state).toMatchObject({ id: 't1', userId: 'u1', geofenceId: 'g1', visitCount: 3 });
    const sql = mockQueries.queryOne.mock.calls[0][0] as string;
    expect(sql).toMatch(/hub\.geofence_trigger_state/i);
  });

  it('getTriggerState returns null when no row', async () => {
    mockQueries.queryOne.mockResolvedValue(null as any);
    expect(await GeofenceModel.getTriggerState('u1', 'g1')).toBeNull();
  });

  it('upsertTriggerState upserts on the (user_id, geofence_id) conflict', async () => {
    mockQueries.queryOne.mockResolvedValue({
      id: 't1', user_id: 'u1', geofence_id: 'g1',
      last_entered_at: null, last_notified_at: null,
      cooldown_until: null, visit_count: 1,
    } as any);

    await GeofenceModel.upsertTriggerState('u1', 'g1', { incrementVisit: true });

    const sql = mockQueries.queryOne.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO hub\.geofence_trigger_state/i);
    expect(sql).toMatch(/ON CONFLICT \(user_id, geofence_id\)/i);
  });
});
