import { searchPlaceCandidates } from '../../services/placeResolutionService';
import { osmProvider } from '../../services/placeProviders/osmProvider';
import { googleProvider } from '../../services/placeProviders/googleProvider';
import type { Anchor } from '../../services/placeAnchors';
import type { ProviderCandidate } from '../../services/placeProviders/types';

jest.mock('../../services/placeProviders/osmProvider', () => ({
  osmProvider: { name: 'osm', search: jest.fn() },
}));
jest.mock('../../services/placeProviders/googleProvider', () => ({
  googleProvider: { name: 'google', search: jest.fn() },
}));
jest.mock('../../models/PlaceLookup', () => ({
  PlaceProviderCacheModel: { get: jest.fn(), put: jest.fn() },
}));

import { PlaceProviderCacheModel } from '../../models/PlaceLookup';

const mockOsm = osmProvider as jest.Mocked<typeof osmProvider>;
const mockGoogle = googleProvider as jest.Mocked<typeof googleProvider>;
const mockCache = PlaceProviderCacheModel as jest.Mocked<typeof PlaceProviderCacheModel>;

const HOME: Anchor = { lat: 21.33, lng: -157.92, source: 'home_region' };
const CURRENT: Anchor = { lat: 36.17, lng: -115.14, source: 'current_location' };

function candidateAt(lat: number, lng: number, name = 'Melaleuca'): ProviderCandidate {
  return { name, address: null, lat, lng, providerPlaceId: `osm:${lat}`, category: 'store' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOsm.search.mockResolvedValue([]);
  mockGoogle.search.mockResolvedValue([]);
  mockCache.get.mockResolvedValue(null);
  mockCache.put.mockResolvedValue(undefined);
});

describe('searchPlaceCandidates', () => {
  it('OSM answering means Google is never called — the free path stays free', async () => {
    const costco = candidateAt(21.32, -157.87, 'Costco');
    mockOsm.search.mockResolvedValue([costco]);

    const result = await searchPlaceCandidates('Costco', [HOME]);

    expect(result.provider).toBe('osm');
    expect(result.anchor).toEqual(HOME);
    expect(result.candidates).toEqual([costco]);
    expect(mockGoogle.search).not.toHaveBeenCalled();
  });

  it('falls back to Google when OSM misses — the Melaleuca case', async () => {
    const melaleuca = candidateAt(21.3366, -157.915);
    mockGoogle.search.mockResolvedValue([melaleuca]);

    const result = await searchPlaceCandidates('Melaleuca', [HOME]);

    expect(result.provider).toBe('google');
    expect(result.candidates).toEqual([melaleuca]);
    expect(mockOsm.search).toHaveBeenCalledWith('Melaleuca', { lat: HOME.lat, lng: HOME.lng });
    expect(mockGoogle.search).toHaveBeenCalledWith('Melaleuca', { lat: HOME.lat, lng: HOME.lng });
  });

  it('moves to the next anchor when the first yields nothing from either provider', async () => {
    const local = candidateAt(36.16, -115.15, 'In-N-Out Burger');
    mockOsm.search
      .mockResolvedValueOnce([]) // home anchor: no In-N-Out in Honolulu
      .mockResolvedValueOnce([local]); // current anchor: found in Vegas

    const result = await searchPlaceCandidates('In-N-Out Burger', [HOME, CURRENT]);

    expect(result.anchor).toEqual(CURRENT);
    expect(result.candidates).toEqual([local]);
    // Both providers exhausted the home anchor before moving on
    expect(mockGoogle.search).toHaveBeenCalledTimes(1);
  });

  it('gates out candidates >100 km from every anchor instead of trusting the bias', async () => {
    const nearHome = candidateAt(21.34, -157.90);
    const spain = candidateAt(40.42, -3.70);
    mockOsm.search.mockResolvedValue([nearHome, spain]);

    const result = await searchPlaceCandidates('Melaleuca', [HOME, CURRENT]);

    expect(result.candidates).toEqual([nearHome]);
  });

  it('a candidate near ANY anchor survives the gate, not just the winning one', async () => {
    const nearCurrent = candidateAt(36.2, -115.1);
    mockOsm.search.mockResolvedValue([nearCurrent]);

    const result = await searchPlaceCandidates('Melaleuca', [HOME, CURRENT]);

    expect(result.candidates).toEqual([nearCurrent]);
  });

  it('an anchor whose every candidate is gated out counts as a miss, and the chain continues', async () => {
    const spain = candidateAt(40.42, -3.70);
    const local = candidateAt(36.16, -115.15);
    mockOsm.search
      .mockResolvedValueOnce([spain]) // home anchor: only garbage
      .mockResolvedValueOnce([local]); // current anchor: real result

    const result = await searchPlaceCandidates('Melaleuca', [HOME, CURRENT]);

    expect(result.anchor).toEqual(CURRENT);
    expect(result.candidates).toEqual([local]);
  });

  it('returns empty-handed with provider null when every anchor misses', async () => {
    const result = await searchPlaceCandidates('Melaleuca', [HOME, CURRENT]);

    expect(result).toEqual({ provider: null, anchor: null, candidates: [] });
  });

  it('with no anchors at all, searches unanchored — and the distance gate stands down', async () => {
    const somewhere = candidateAt(21.34, -157.90);
    mockOsm.search.mockResolvedValue([somewhere]);

    const result = await searchPlaceCandidates('Melaleuca', []);

    expect(result.provider).toBe('osm');
    expect(result.anchor).toBeNull();
    expect(result.candidates).toEqual([somewhere]);
    expect(mockOsm.search).toHaveBeenCalledWith('Melaleuca', undefined);
  });

  it('passes withAddress through to whichever provider answers', async () => {
    mockGoogle.search.mockResolvedValue([candidateAt(21.3366, -157.915)]);

    await searchPlaceCandidates('Melaleuca', [HOME], { withAddress: true });

    expect(mockGoogle.search).toHaveBeenCalledWith(
      'Melaleuca',
      { lat: HOME.lat, lng: HOME.lng },
      { withAddress: true }
    );
  });
});

describe('searchPlaceCandidates — provider cache', () => {
  it('a cache hit answers without any provider call — repeat lookups cost zero', async () => {
    const cached = [candidateAt(21.3366, -157.915)];
    mockCache.get.mockImplementation(async (_q, _lat, _lng, provider) =>
      provider === 'osm' ? cached : null
    );

    const result = await searchPlaceCandidates('Melaleuca', [HOME]);

    expect(result.provider).toBe('osm');
    expect(result.candidates).toEqual(cached);
    expect(mockOsm.search).not.toHaveBeenCalled();
    expect(mockGoogle.search).not.toHaveBeenCalled();
  });

  it('a cached EMPTY result counts as that provider answering "nothing" — no re-fetch', async () => {
    const melaleuca = [candidateAt(21.3366, -157.915)];
    mockCache.get.mockImplementation(async (_q, _lat, _lng, provider) =>
      provider === 'osm' ? [] : melaleuca
    );

    const result = await searchPlaceCandidates('Melaleuca', [HOME]);

    expect(result.provider).toBe('google');
    expect(mockOsm.search).not.toHaveBeenCalled();
    expect(mockGoogle.search).not.toHaveBeenCalled();
  });

  it('a miss calls the provider and writes what came back — empties included', async () => {
    const found = [candidateAt(21.3366, -157.915)];
    mockGoogle.search.mockResolvedValue(found);

    await searchPlaceCandidates('Melaleuca', [HOME]);

    expect(mockCache.put).toHaveBeenCalledWith('Melaleuca', HOME.lat, HOME.lng, 'osm', []);
    expect(mockCache.put).toHaveBeenCalledWith('Melaleuca', HOME.lat, HOME.lng, 'google', found);
  });

  it('caches the RAW response — the distance gate re-applies on every read', async () => {
    const near = candidateAt(21.34, -157.90);
    const spain = candidateAt(40.42, -3.70);
    mockOsm.search.mockResolvedValue([near, spain]);

    const result = await searchPlaceCandidates('Melaleuca', [HOME]);

    expect(mockCache.put).toHaveBeenCalledWith('Melaleuca', HOME.lat, HOME.lng, 'osm', [near, spain]);
    expect(result.candidates).toEqual([near]);
  });

  it('withAddress bypasses the cache in both directions — cheap-mask entries lack addresses', async () => {
    mockGoogle.search.mockResolvedValue([candidateAt(21.3366, -157.915)]);

    await searchPlaceCandidates('Melaleuca', [HOME], { withAddress: true });

    expect(mockCache.get).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('an unanchored search bypasses the cache — there is no cell to key on', async () => {
    mockOsm.search.mockResolvedValue([candidateAt(21.34, -157.90)]);

    await searchPlaceCandidates('Melaleuca', []);

    expect(mockCache.get).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('a cache outage degrades to the provider call, never a failed resolution', async () => {
    mockCache.get.mockRejectedValue(new Error('db down'));
    mockCache.put.mockRejectedValue(new Error('db down'));
    const found = [candidateAt(21.3366, -157.915)];
    mockOsm.search.mockResolvedValue(found);

    const result = await searchPlaceCandidates('Melaleuca', [HOME]);

    expect(result.candidates).toEqual(found);
  });
});
