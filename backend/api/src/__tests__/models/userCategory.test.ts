// backend/api/src/__tests__/models/userCategory.test.ts
import { UserCategoryModel } from '../../models/UserCategory';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

const row = {
  id: 'c1', user_id: 'u1', name: 'Side hustle', color: '#3b82f6',
  icon: null, keywords: ['etsy', 'shop'], sort_order: 0,
  created_at: new Date('2026-06-28'), updated_at: new Date('2026-06-28'),
};

describe('UserCategoryModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('findByUserId returns the user\'s categories ordered by sort_order', async () => {
    mockQueries.queryMany.mockResolvedValueOnce([row] as any);
    const result = await UserCategoryModel.findByUserId('u1');
    const [sql, params] = mockQueries.queryMany.mock.calls[0];
    expect(sql).toMatch(/FROM hub\.user_categories/i);
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(sql).toMatch(/ORDER BY sort_order/i);
    expect(params).toEqual(['u1']);
    expect(result[0].toUserCategory()).toMatchObject({
      id: 'c1', userId: 'u1', name: 'Side hustle', keywords: ['etsy', 'shop'], sortOrder: 0,
    });
  });

  it('create inserts and returns the new category', async () => {
    mockQueries.queryOne.mockResolvedValueOnce(row as any);
    const result = await UserCategoryModel.create('u1', { name: 'Side hustle', keywords: ['etsy', 'shop'] });
    const [sql, params] = mockQueries.queryOne.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO hub\.user_categories/i);
    expect(params[0]).toBe('u1');
    expect(params[1]).toBe('Side hustle');
    expect(result.toUserCategory().name).toBe('Side hustle');
  });
});
