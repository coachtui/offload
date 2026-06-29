// backend/api/src/__tests__/models/atomicObjectCategory.test.ts
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
jest.mock('../../services/vectorService', () => ({ deleteFromVector: jest.fn() }));
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('AtomicObjectModel category assignment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assignCategoryByRule only updates unlocked rows', async () => {
    mockQueries.query.mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

    await AtomicObjectModel.assignCategoryByRule('obj1', 'cat1');

    const [sql, params] = mockQueries.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE hub\.atomic_objects/i);
    expect(sql).toMatch(/SET category_id = \$1/);
    expect(sql).toMatch(/category_locked = false/i);
    expect(params).toEqual(['cat1', 'obj1']);
  });

  it('findByUserId adds a category_id filter when categoryId is given', async () => {
    mockQueries.query.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
    mockQueries.queryMany.mockResolvedValueOnce([] as any);

    await AtomicObjectModel.findByUserId('u1', { categoryId: 'cat1' });

    const countCall = mockQueries.query.mock.calls[0];
    expect(countCall[0]).toMatch(/category_id = \$2/);
    expect(countCall[1]).toEqual(['u1', 'cat1']);
  });
});
