/**
 * deleteEmptyInferred — SQL-shape pinning.
 *
 * The service-level reap tests mock GeofenceModel entirely, so nothing there
 * would catch a regression inside this DELETE — and the stakes are maximal: it
 * is the only query in the codebase that deletes geofences in bulk. Losing the
 * created_by filter would delete the user's MANUAL geofences on every resolve;
 * losing either NOT EXISTS clause would delete geofences that still have open
 * notes reachable through the other link path. A live-Postgres test isn't
 * available in this suite, so we pin the predicates the query must keep by
 * asserting on the SQL handed to the db layer.
 */
import { GeofenceModel } from '../../models/Geofence';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');

const mockQueries = queries as jest.Mocked<typeof queries>;

const USER_ID = 'u-1';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('GeofenceModel.deleteEmptyInferred SQL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueries.queryMany.mockResolvedValue([]);
  });

  async function capturedSql(): Promise<{ sql: string; params: any[] }> {
    await GeofenceModel.deleteEmptyInferred(USER_ID);
    expect(mockQueries.queryMany).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQueries.queryMany.mock.calls[0];
    return { sql: normalize(sql as string), params: params as any[] };
  }

  it('only ever deletes INFERRED geofences — manual ones are untouchable', async () => {
    const { sql } = await capturedSql();
    expect(sql).toContain(`g.created_by = 'inferred'`);
    expect(sql).toMatch(/^delete from hub\.geofences/);
  });

  it('is scoped to the acting user', async () => {
    const { sql, params } = await capturedSql();
    expect(sql).toContain('g.user_id = $1');
    expect(params).toEqual([USER_ID]);
  });

  it('keeps geofences with an open note via the place-link path (object_place_links)', async () => {
    const { sql } = await capturedSql();
    expect(sql).toContain('not exists');
    expect(sql).toContain('hub.object_place_links opl');
    expect(sql).toContain('opl.place_id = g.place_id');
    expect(sql).toContain('opl.active = true');
  });

  it('keeps geofences with an open note via the direct path (geofence_objects)', async () => {
    const { sql } = await capturedSql();
    expect(sql).toContain('hub.geofence_objects go');
    expect(sql).toContain('go.geofence_id = g.id');
  });

  it("defines open exactly like listGeofences' open_count (state + soft-delete)", async () => {
    const { sql } = await capturedSql();
    // Both link paths must apply both filters — two occurrences each.
    expect(sql.match(/ao\.deleted_at is null/g)).toHaveLength(2);
    expect(sql.match(/ao\.state in \('open','active'\)/g)).toHaveLength(2);
  });

  it('returns the removed rows so callers can log and count them', async () => {
    const { sql } = await capturedSql();
    expect(sql).toContain('returning g.id, g.name');
  });
});
