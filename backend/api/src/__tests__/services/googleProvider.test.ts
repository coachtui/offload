import { googleProvider } from '../../services/placeProviders/googleProvider';

/**
 * Captured verbatim from the live API on 2026-08-12 (key `offload-places-server`,
 * 50 km bias at 21.3498, -158.0145) — the exact query whose OSM zero-result
 * motivated this provider. Kept whole so the mapping is tested against what
 * Google actually sends, not what we remember it sending.
 */
const MELALEUCA_RESPONSE = {
  places: [
    {
      id: 'ChIJjWQHH6hvAHwR15bGL9gLQ8A',
      formattedAddress: '590 Paiea St, Honolulu, HI 96819, USA',
      location: { latitude: 21.3366127, longitude: -157.9149545 },
      displayName: { text: 'Melaleuca', languageCode: 'en' },
      primaryType: 'store',
    },
    {
      id: 'ChIJN9NxCgBvAHwReMcZ1FzOhwI',
      formattedAddress: '500 Ala Moana Blvd #4480, Honolulu, HI 96813, USA',
      location: { latitude: 21.3010952, longitude: -157.8622959 },
      displayName: { text: 'Melaleuca', languageCode: 'en' },
      primaryType: 'cosmetics_store',
    },
  ],
};

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

function requestBody(fn: jest.Mock): any {
  return JSON.parse((fn.mock.calls[0][1] as any).body);
}

function requestHeaders(fn: jest.Mock): Record<string, string> {
  return (fn.mock.calls[0][1] as any).headers;
}

describe('googleProvider.search', () => {
  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
  });

  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    (global.fetch as any) = undefined;
    jest.clearAllMocks();
  });

  it('maps Text Search results to ProviderCandidates, prefixing ids with google:', async () => {
    mockFetchJson(MELALEUCA_RESPONSE);

    const candidates = await googleProvider.search('Melaleuca', ANCHOR);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      name: 'Melaleuca',
      address: '590 Paiea St, Honolulu, HI 96819, USA',
      lat: 21.3366127,
      lng: -157.9149545,
      providerPlaceId: 'google:ChIJjWQHH6hvAHwR15bGL9gLQ8A',
      category: 'store',
    });
    expect(candidates[1].providerPlaceId).toBe('google:ChIJN9NxCgBvAHwReMcZ1FzOhwI');
    expect(candidates[1].category).toBe('cosmetics_store');
  });

  it('returns [] without fetching when GOOGLE_PLACES_API_KEY is unset', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const fetchMock = mockFetchJson(MELALEUCA_RESPONSE);

    await expect(googleProvider.search('Melaleuca', ANCHOR)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the key in a header, never in the URL', async () => {
    const fetchMock = mockFetchJson(MELALEUCA_RESPONSE);

    await googleProvider.search('Melaleuca', ANCHOR);

    expect(requestHeaders(fetchMock)['X-Goog-Api-Key']).toBe('test-places-key');
    expect(fetchMock.mock.calls[0][0] as string).not.toContain('test-places-key');
  });

  it('biases (not restricts) to a 50 km circle at the anchor, ranked by distance', async () => {
    const fetchMock = mockFetchJson(MELALEUCA_RESPONSE);

    await googleProvider.search('Melaleuca', ANCHOR);

    expect(requestBody(fetchMock)).toEqual({
      textQuery: 'Melaleuca',
      maxResultCount: 10,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: { center: { latitude: ANCHOR.lat, longitude: ANCHOR.lng }, radius: 50000.0 },
      },
    });
  });

  it('omits locationBias and distance ranking when no anchor is given', async () => {
    const fetchMock = mockFetchJson(MELALEUCA_RESPONSE);

    await googleProvider.search('Melaleuca');

    const body = requestBody(fetchMock);
    expect(body.locationBias).toBeUndefined();
    expect(body.rankPreference).toBeUndefined();
  });

  it('requests the cheap field mask by default — no formattedAddress', async () => {
    const fetchMock = mockFetchJson(MELALEUCA_RESPONSE);

    await googleProvider.search('Melaleuca', ANCHOR);

    const mask = requestHeaders(fetchMock)['X-Goog-FieldMask'];
    expect(mask).toBe('places.id,places.displayName,places.location,places.primaryType');
  });

  it('adds formattedAddress to the mask only when withAddress is set', async () => {
    const fetchMock = mockFetchJson(MELALEUCA_RESPONSE);

    await googleProvider.search('Melaleuca', ANCHOR, { withAddress: true });

    const mask = requestHeaders(fetchMock)['X-Goog-FieldMask'];
    expect(mask).toContain('places.formattedAddress');
  });

  it('maps a missing address to null on the cheap mask', async () => {
    const noAddress = {
      places: MELALEUCA_RESPONSE.places.map(({ formattedAddress, ...rest }) => rest),
    };
    mockFetchJson(noAddress);

    const candidates = await googleProvider.search('Melaleuca', ANCHOR);

    expect(candidates[0].address).toBeNull();
  });

  it('returns [] when Google finds nothing (empty body has no places key)', async () => {
    mockFetchJson({});

    await expect(googleProvider.search('Zzyzx Widgets', ANCHOR)).resolves.toEqual([]);
  });

  it('returns [] on a non-200 rather than throwing', async () => {
    mockFetchJson({}, { ok: false, status: 403 });

    await expect(googleProvider.search('Melaleuca', ANCHOR)).resolves.toEqual([]);
  });

  it('returns [] when fetch rejects (timeout / abort)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('The operation was aborted')) as any;

    await expect(googleProvider.search('Melaleuca', ANCHOR)).resolves.toEqual([]);
  });

  it('leaves relevance undefined — Google has no importance equivalent, scoring must stay neutral', async () => {
    mockFetchJson(MELALEUCA_RESPONSE);

    const candidates = await googleProvider.search('Melaleuca', ANCHOR);

    expect(candidates[0].relevance).toBeUndefined();
  });

  it('identifies itself as the google provider', () => {
    expect(googleProvider.name).toBe('google');
  });
});
