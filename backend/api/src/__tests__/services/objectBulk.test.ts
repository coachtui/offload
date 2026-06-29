import { bulkDeleteObjects, bulkMoveObjects } from '../../services/objectService';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('bulkDeleteObjects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes only the user\'s own non-deleted objects and returns the count', async () => {
    mockQueries.query.mockResolvedValueOnce({ rowCount: 2, rows: [] } as any);

    const result = await bulkDeleteObjects('u1', ['a', 'b', 'c']);

    expect(result).toEqual({ deleted: 2 });
    const [sql, params] = mockQueries.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE hub\.atomic_objects/i);
    expect(sql).toMatch(/SET deleted_at = NOW\(\)/i);
    expect(sql).toMatch(/user_id = \$1/);
    expect(sql).toMatch(/id = ANY\(\$2\)/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(['u1', ['a', 'b', 'c']]);
  });

  it('returns deleted: 0 for an empty id list without querying', async () => {
    const result = await bulkDeleteObjects('u1', []);
    expect(result).toEqual({ deleted: 0 });
    expect(mockQueries.query).not.toHaveBeenCalled();
  });
});

describe('bulkMoveObjects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets category_id and locks the rows, returns moved count', async () => {
    (queries.query as jest.Mock).mockResolvedValueOnce({ rowCount: 2, rows: [] } as any);
    const result = await bulkMoveObjects('u1', ['a', 'b'], 'cat1');
    expect(result).toEqual({ moved: 2 });
    const [sql, params] = (queries.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/SET category_id = \$1, category_locked = true/i);
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/id = ANY\(\$3\)/);
    expect(params).toEqual(['cat1', 'u1', ['a', 'b']]);
  });

  it('returns moved: 0 for an empty id list without querying', async () => {
    const result = await bulkMoveObjects('u1', [], 'cat1');
    expect(result).toEqual({ moved: 0 });
    expect(queries.query).not.toHaveBeenCalled();
  });
});
