import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('AtomicObjectModel.findResolvedInPeriod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filters resolved objects by state_updated_at window, newest first', async () => {
    mockQueries.queryMany.mockResolvedValue([] as any);
    const from = new Date('2026-06-22T00:00:00Z');
    const to = new Date('2026-06-29T00:00:00Z');

    await AtomicObjectModel.findResolvedInPeriod('u1', from, to);

    const sql = mockQueries.queryMany.mock.calls[0][0] as string;
    const params = mockQueries.queryMany.mock.calls[0][1] as any[];
    expect(sql).toMatch(/state\s*=\s*'resolved'/i);
    expect(sql).toMatch(/state_updated_at\s*>=\s*\$2/i);
    expect(sql).toMatch(/state_updated_at\s*<=\s*\$3/i);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/ORDER BY state_updated_at DESC/i);
    expect(params).toEqual(['u1', from, to]);
  });
});
