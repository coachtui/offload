import { PlaceLookupModel } from '../../models/PlaceLookup';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

const ROW = {
  id: 'pl-1',
  user_id: 'u1',
  object_id: 'obj-1',
  query: 'Melaleuca',
  status: 'pending',
  candidates: [
    { name: 'Melaleuca', address: '590 Paiea St…', lat: 21.3366127, lng: -157.9149545, providerPlaceId: 'google:paiea', category: 'store' },
    { name: 'Melaleuca', address: '500 Ala Moana Blvd #4480…', lat: 21.3010952, lng: -157.8622959, providerPlaceId: 'google:suite', category: 'cosmetics_store' },
  ],
  provider: 'google',
  recorded_lat: '21.34980000',
  recorded_lng: '-158.01450000',
  resolved_place_id: null,
  resolved_at: null,
  created_at: new Date('2026-08-12T10:00:00Z'),
};

beforeEach(() => jest.clearAllMocks());

describe('PlaceLookupModel.create', () => {
  it('upserts on (object, query) so re-processing a transcript cannot duplicate the question', async () => {
    mockQ.queryOne.mockResolvedValue(ROW as any);

    await PlaceLookupModel.create({
      userId: 'u1',
      objectId: 'obj-1',
      query: 'Melaleuca',
      candidates: ROW.candidates as any,
      provider: 'google',
      recorded: { lat: 21.3498, lng: -158.0145 },
    });

    const [sql, params] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO hub\.place_lookups/i);
    expect(sql).toMatch(/ON CONFLICT/i);
    expect(params).toEqual([
      'u1', 'obj-1', 'Melaleuca', JSON.stringify(ROW.candidates), 'google', 21.3498, -158.0145,
    ]);
  });

  it('maps the row back to camelCase with numeric coordinates', async () => {
    mockQ.queryOne.mockResolvedValue(ROW as any);

    const lookup = await PlaceLookupModel.create({
      userId: 'u1', objectId: 'obj-1', query: 'Melaleuca',
      candidates: [], provider: null,
    });

    expect(lookup).toMatchObject({
      id: 'pl-1',
      userId: 'u1',
      objectId: 'obj-1',
      query: 'Melaleuca',
      status: 'pending',
      provider: 'google',
      recordedLat: 21.3498,
      recordedLng: -158.0145,
    });
    expect(lookup.candidates).toHaveLength(2);
  });
});

describe('PlaceLookupModel.findPendingByUser', () => {
  it('selects only pending rows for the user, newest first', async () => {
    mockQ.queryMany.mockResolvedValue([ROW] as any);

    const rows = await PlaceLookupModel.findPendingByUser('u1');

    const [sql, params] = mockQ.queryMany.mock.calls[0];
    expect(sql).toMatch(/status = 'pending'/);
    expect(sql).toMatch(/ORDER BY pl\.created_at DESC/i);
    expect(params).toEqual(['u1']);
    expect(rows).toHaveLength(1);
  });

  it('a question dies with its note — soft-deleted and completed notes leave the queue', async () => {
    // Field case 2026-08-13: a stale "Home Depot" row outlived its deleted
    // note. Notes soft-delete (deleted_at), so the FK cascade never fires;
    // the queue must filter on the note's liveness instead. Critically the
    // row is NOT dismissed — dismissed rows are the ignore list, and a
    // deleted note must never ignore-list a word.
    mockQ.queryMany.mockResolvedValue([] as any);

    await PlaceLookupModel.findPendingByUser('u1');

    const [sql] = mockQ.queryMany.mock.calls[0];
    expect(sql).toMatch(/JOIN hub\.atomic_objects/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/state IN \('open', 'active'\)/);
  });
});

describe('PlaceLookupModel.markResolved', () => {
  it('stamps the place, the time, and flips status — only from pending', async () => {
    mockQ.queryOne.mockResolvedValue({ ...ROW, status: 'resolved', resolved_place_id: 'place-9' } as any);

    const updated = await PlaceLookupModel.markResolved('pl-1', 'place-9');

    const [sql, params] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/SET status = 'resolved'/);
    expect(sql).toMatch(/resolved_place_id = \$2/);
    expect(sql).toMatch(/status = 'pending'/); // WHERE guard: no resurrecting dismissed rows
    expect(params).toEqual(['pl-1', 'place-9']);
    expect(updated?.status).toBe('resolved');
  });
});

describe('PlaceLookupModel.isQueryIgnored', () => {
  it('is true when the user has dismissed this word before, case-insensitively', async () => {
    mockQ.queryOne.mockResolvedValue({ exists: true } as any);

    const ignored = await PlaceLookupModel.isQueryIgnored('u1', 'MELALEUCA');

    const [sql, params] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/status = 'dismissed'/);
    expect(sql).toMatch(/lower\(query\)/i);
    expect(params).toEqual(['u1', 'melaleuca']);
    expect(ignored).toBe(true);
  });
});

describe('PlaceLookupModel.findRetryable', () => {
  it('returns pending rows so a new provider or backfill can re-run them', async () => {
    mockQ.queryMany.mockResolvedValue([ROW] as any);

    await PlaceLookupModel.findRetryable('u1');

    const [sql] = mockQ.queryMany.mock.calls[0];
    expect(sql).toMatch(/status = 'pending'/);
  });
});

describe('PlaceProviderCacheModel', () => {
  it('keys reads on lowered query and ~11 km cell', async () => {
    mockQ.queryOne.mockResolvedValue(null);

    const { PlaceProviderCacheModel } = await import('../../models/PlaceLookup');
    await PlaceProviderCacheModel.get('Melaleuca', 21.3498, -158.0145, 'google');

    const [sql, params] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/hub\.place_provider_cache/);
    expect(params).toEqual(['melaleuca', 21.3, -158.0, 'google']);
  });

  it('enforces the 30-day TTL in the query, not in application code', async () => {
    const { PlaceProviderCacheModel } = await import('../../models/PlaceLookup');
    mockQ.queryOne.mockResolvedValue(null);

    await PlaceProviderCacheModel.get('Melaleuca', 21.3498, -158.0145, 'google');

    const [sql] = mockQ.queryOne.mock.calls[0];
    expect(sql).toMatch(/30 days/i);
  });

  it('upserts writes so a refreshed lookup replaces the stale entry', async () => {
    const { PlaceProviderCacheModel } = await import('../../models/PlaceLookup');
    mockQ.query.mockResolvedValue({ rows: [] } as any);

    await PlaceProviderCacheModel.put('Melaleuca', 21.3498, -158.0145, 'google', []);

    const [sql, params] = mockQ.query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT/i);
    expect(params).toEqual(['melaleuca', 21.3, -158.0, 'google', '[]']);
  });
});
