import { osmProvider } from '../../services/placeProviders/osmProvider';

/**
 * Shape captured from a real Nominatim /search response. Kept verbatim rather
 * than minimised: the mapping's whole job is to survive this payload, and a
 * trimmed fixture would stop catching a field rename.
 */
const NOMINATIM_RESULTS = [
  {
    place_id: 240851923,
    display_name: 'Costco, 525, Alakawa Street, Iwilei, Honolulu, Hawaii, 96817, United States',
    name: 'Costco',
    lat: '21.3204391',
    lon: '-157.8722458',
    type: 'supermarket',
    class: 'shop',
    importance: 0.31,
    address: { city: 'Honolulu', state: 'Hawaii', country_code: 'us' },
  },
  {
    place_id: 118392011,
    display_name: '590, Paiea Street, Salt Lake, Honolulu, Hawaii, 96819, United States',
    name: '',
    lat: '21.3366127',
    lon: '-157.9149545',
    type: 'house',
    class: 'place',
    importance: 0.11,
  },
];

const ANCHOR = { lat: 21.3498, lng: -158.0145 };

function mockFetchJson(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fn = jest.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  });
  global.fetch = fn as any;
  return fn;
}

/** The URL the provider actually requested, parsed. */
function requestedUrl(fn: jest.Mock): URL {
  return new URL(fn.mock.calls[0][0] as string);
}

describe('osmProvider.search', () => {
  afterEach(() => {
    (global.fetch as any) = undefined;
    jest.clearAllMocks();
  });

  it('maps Nominatim results to ProviderCandidates, prefixing ids with osm:', async () => {
    mockFetchJson(NOMINATIM_RESULTS);

    const candidates = await osmProvider.search('Costco', ANCHOR);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      name: 'Costco',
      address: 'Costco, 525, Alakawa Street, Iwilei, Honolulu, Hawaii, 96817, United States',
      lat: 21.3204391,
      lng: -157.8722458,
      providerPlaceId: 'osm:240851923',
      category: 'supermarket',
      relevance: 0.31,
    });
  });

  it('falls back to the first display_name segment when name is empty', async () => {
    mockFetchJson(NOMINATIM_RESULTS);

    const candidates = await osmProvider.search('590 Paiea', ANCHOR);

    expect(candidates[1].name).toBe('590');
  });

  it('hard-bounds to a viewbox around the anchor when one is given', async () => {
    const fetchMock = mockFetchJson(NOMINATIM_RESULTS);

    await osmProvider.search('Costco', ANCHOR);

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get('bounded')).toBe('1');
    const [left, top, right, bottom] = url.searchParams.get('viewbox')!.split(',').map(Number);
    expect(left).toBeCloseTo(ANCHOR.lng - 0.45, 5);
    expect(right).toBeCloseTo(ANCHOR.lng + 0.45, 5);
    expect(top).toBeCloseTo(ANCHOR.lat + 0.45, 5);
    expect(bottom).toBeCloseTo(ANCHOR.lat - 0.45, 5);
  });

  it('omits the viewbox entirely when no anchor is given', async () => {
    const fetchMock = mockFetchJson(NOMINATIM_RESULTS);

    await osmProvider.search('Costco');

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get('viewbox')).toBeNull();
    expect(url.searchParams.get('bounded')).toBeNull();
  });

  it('sends a genuine contact User-Agent — placeholders are blocklisted by OSM', async () => {
    const fetchMock = mockFetchJson(NOMINATIM_RESULTS);

    await osmProvider.search('Costco', ANCHOR);

    const headers = (fetchMock.mock.calls[0][1] as any).headers;
    expect(headers['User-Agent']).toContain('tui@tuialailima.com');
    expect(headers['User-Agent']).not.toContain('example.com');
  });

  it('returns [] on a non-200 rather than throwing', async () => {
    mockFetchJson([], { ok: false, status: 403 });

    await expect(osmProvider.search('Costco', ANCHOR)).resolves.toEqual([]);
  });

  it('returns [] when fetch rejects (timeout / abort)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('The operation was aborted')) as any;

    await expect(osmProvider.search('Costco', ANCHOR)).resolves.toEqual([]);
  });

  it('returns [] when Nominatim finds nothing — the Melaleuca case', async () => {
    mockFetchJson([]);

    await expect(osmProvider.search('Melaleuca', ANCHOR)).resolves.toEqual([]);
  });

  it('identifies itself as the osm provider', () => {
    expect(osmProvider.name).toBe('osm');
  });
});
