import { ObjectCorrectionModel } from '../../models/ObjectCorrection';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

const input = {
  userId: 'u1',
  objectId: 'obj-1',
  field: 'type' as const,
  originalValue: 'idea',
  correctedValue: 'commitment',
  note: 'this was a promise, not a thought',
};

describe('ObjectCorrectionModel.record', () => {
  beforeEach(() => jest.clearAllMocks());

  // The ownership check lives in the INSERT ... SELECT, not in a prior SELECT.
  // A separate read-then-write could pass its check and then write against an
  // object deleted in between; this cannot.
  it('enforces ownership inside the write, not with a prior lookup', async () => {
    mockQ.queryOne.mockResolvedValue({ id: 'c1' } as any);

    await ObjectCorrectionModel.record(input);

    expect(mockQ.queryOne).toHaveBeenCalledTimes(1); // no separate ownership SELECT
    const [sql, params] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/insert into hub\.object_corrections/i);
    expect(sql).toMatch(/from hub\.atomic_objects o/i);
    expect(sql).toMatch(/where o\.id = \$2 and o\.user_id = \$1/i);
    expect(params).toEqual(['u1', 'obj-1', 'type', 'idea', 'commitment', input.note]);
  });

  // Re-correcting a field is the user changing their mind, not a new data point.
  it('overwrites an existing correction for the same (object, field)', async () => {
    mockQ.queryOne.mockResolvedValue({ id: 'c1' } as any);
    await ObjectCorrectionModel.record(input);
    const [sql] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/on conflict \(object_id, field\) do update/i);
  });

  // A correction naming someone else's object writes nothing. The route turns
  // this null into a 404 — the same response as "no such object", so it can't
  // be used to probe which ids exist.
  it("returns null when the object isn't the caller's", async () => {
    mockQ.queryOne.mockResolvedValue(null);
    await expect(ObjectCorrectionModel.record(input)).resolves.toBeNull();
  });

  it('stores nulls rather than undefined for the optional fields', async () => {
    mockQ.queryOne.mockResolvedValue({ id: 'c1' } as any);
    await ObjectCorrectionModel.record({
      userId: 'u1',
      objectId: 'obj-1',
      field: 'title',
      correctedValue: 'Fix the trench plate',
    });
    const params = mockQ.queryOne.mock.calls[0][1]!;
    expect(params[3]).toBeNull(); // originalValue
    expect(params[5]).toBeNull(); // note
  });
});

describe('ObjectCorrectionModel reads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listByUser scopes to the user and caps the row count', async () => {
    mockQ.queryMany.mockResolvedValue([]);
    await ObjectCorrectionModel.listByUser('u1', 25);
    const [sql, params] = mockQ.queryMany.mock.calls[0];
    expect(sql).toMatch(/where user_id = \$1/i);
    expect(params).toEqual(['u1', 25]);
  });

  // COUNT(*) comes back from pg as a string; returning it unconverted would
  // make the totals concatenate instead of add.
  it('summaryByUser converts COUNT(*) strings to numbers', async () => {
    mockQ.queryMany.mockResolvedValue([
      { field: 'type', count: '7' },
      { field: 'domain', count: '2' },
    ] as any);

    const summary = await ObjectCorrectionModel.summaryByUser('u1');

    expect(summary).toEqual([
      { field: 'type', count: 7 },
      { field: 'domain', count: 2 },
    ]);
    expect(summary.reduce((s, f) => s + f.count, 0)).toBe(9);
  });

  it('remove is scoped to the caller and reports whether a row went', async () => {
    mockQ.query.mockResolvedValue({ rowCount: 1 } as any);
    await expect(ObjectCorrectionModel.remove('u1', 'obj-1', 'tags')).resolves.toBe(true);
    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toMatch(/where user_id = \$1 and object_id = \$2 and field = \$3/i);
    expect(params).toEqual(['u1', 'obj-1', 'tags']);

    mockQ.query.mockResolvedValue({ rowCount: 0 } as any);
    await expect(ObjectCorrectionModel.remove('u1', 'nope', 'tags')).resolves.toBe(false);
  });
});
