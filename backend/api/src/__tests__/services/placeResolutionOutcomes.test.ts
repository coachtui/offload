/**
 * Outcome tests for the anchored-chain + arbitration pipeline in placeService.
 *
 * These pin the contract Task 5 exists to establish: for each arbitration
 * verdict, exactly what gets written —
 *   single    → place + geofence (subject to the confidence threshold)
 *   chain     → nearest 3, as the fan-out always did
 *   ambiguous → NO place, NO geofence, one pending row with both candidates
 *   none      → one pending row, no candidates
 * plus the ignore list and the diagnostics trail.
 *
 * arbitrate() and candidateToResolvedPlace() are deliberately REAL — feeding
 * raw candidates through the true arbitration is the point. Only I/O is mocked.
 */
import { resolveObjectPlaces } from '../../services/placeService';
import { PlaceModel } from '../../models/Place';
import { GeofenceModel } from '../../models/Geofence';
import { PlaceLookupModel } from '../../models/PlaceLookup';
import { ReminderLifecycleEventModel } from '../../models/ReminderLifecycleEvent';
import { searchPlaceCandidates } from '../../services/placeResolutionService';
import { resolveAnchors } from '../../services/placeAnchors';
import type { ProviderCandidate } from '../../services/placeProviders/types';

jest.mock('../../models/Place');
jest.mock('../../models/Geofence');
jest.mock('../../models/AtomicObject');
jest.mock('../../models/PlaceLookup', () => ({
  PlaceLookupModel: {
    isQueryIgnored: jest.fn(async () => false),
    create: jest.fn(async () => ({})),
  },
  PlaceProviderCacheModel: { get: jest.fn(async () => null), put: jest.fn(async () => {}) },
}));
jest.mock('../../models/ReminderLifecycleEvent', () => ({
  ReminderLifecycleEventModel: { record: jest.fn(async () => {}) },
}));
jest.mock('../../services/placeAnchors', () => ({
  resolveAnchors: jest.fn(async () => []),
}));
// Mock only the chain entry — arbitrate and confidence scoring stay real.
jest.mock('../../services/placeResolutionService', () => ({
  ...jest.requireActual('../../services/placeResolutionService'),
  searchPlaceCandidates: jest.fn(),
}));
jest.mock('../../services/pushService');

const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockLookup = PlaceLookupModel as jest.Mocked<typeof PlaceLookupModel>;
const mockLifecycle = ReminderLifecycleEventModel as jest.Mocked<typeof ReminderLifecycleEventModel>;
const mockSearch = searchPlaceCandidates as jest.MockedFunction<typeof searchPlaceCandidates>;
const mockAnchors = resolveAnchors as jest.MockedFunction<typeof resolveAnchors>;

const USER = 'u1';
const OBJ = 'obj1';
const RECORDED = { latitude: 21.3498, longitude: -158.0145 };

function cand(name: string, lat: number, lng: number, id: string, category = 'store'): ProviderCandidate {
  return { name, address: null, lat, lng, providerPlaceId: id, category };
}

const MELALEUCA_STORE = cand('Melaleuca', 21.3366127, -157.9149545, 'google:paiea');
const MELALEUCA_SUITE = cand('Melaleuca', 21.3010952, -157.8622959, 'google:suite', 'cosmetics_store');

function emptySearch() {
  return { provider: null, anchor: null, candidates: [] } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations, so per-test mockResolvedValue calls
  // would otherwise leak into later describes — re-pin the defaults here.
  mockLookup.isQueryIgnored.mockResolvedValue(false);
  mockLookup.create.mockResolvedValue({} as any);
  mockGeo.findByUserId.mockResolvedValue([]);
  mockGeo.create.mockResolvedValue({ id: 'gf-new' } as any);
  mockPlace.findByUserId.mockResolvedValue([]);
  mockPlace.findNearby.mockResolvedValue([]);
  mockPlace.countInferredGeofences.mockResolvedValue(0);
  mockPlace.create.mockImplementation(async (input: any) => ({ id: `pl-${input.normalizedName}`, ...input } as any));
  mockPlace.linkObject.mockResolvedValue(undefined as any);
  mockSearch.mockResolvedValue(emptySearch());
});

describe('verdict: none — nothing found anywhere', () => {
  it('writes one pending lookup with no candidates, and no place or geofence', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockLookup.create).toHaveBeenCalledTimes(1);
    expect(mockLookup.create).toHaveBeenCalledWith({
      userId: USER,
      objectId: OBJ,
      query: 'Melaleuca',
      candidates: [],
      provider: null,
      recorded: { lat: RECORDED.latitude, lng: RECORDED.longitude },
    });
    expect(mockPlace.create).not.toHaveBeenCalled();
    expect(mockGeo.create).not.toHaveBeenCalled();
  });

  it('leaves a diagnostics row — the old pipeline was invisible here', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockLifecycle.record).toHaveBeenCalledWith(
      'PLACE_NEEDS_USER',
      expect.objectContaining({ userId: USER, objectId: OBJ, verdict: 'none' })
    );
  });
});

describe('verdict: ambiguous — the founding Melaleuca case', () => {
  beforeEach(() => {
    mockSearch.mockImplementation(async (_q, _anchors, opts) => ({
      provider: 'google',
      anchor: null,
      candidates: opts?.withAddress
        ? [
            { ...MELALEUCA_STORE, address: '590 Paiea St, Honolulu, HI 96819, USA' },
            { ...MELALEUCA_SUITE, address: '500 Ala Moana Blvd #4480, Honolulu, HI 96813, USA' },
          ]
        : [MELALEUCA_STORE, MELALEUCA_SUITE],
    }) as any);
  });

  it('arms NOTHING and queues one pending row carrying both candidates', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockPlace.create).not.toHaveBeenCalled();
    expect(mockGeo.create).not.toHaveBeenCalled();
    expect(mockLookup.create).toHaveBeenCalledTimes(1);
    const arg = mockLookup.create.mock.calls[0][0];
    expect(arg.provider).toBe('google');
    expect(arg.candidates).toHaveLength(2);
  });

  it('enriches the stored candidates with addresses — the sheet needs them to tell the two apart', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    // Second search call is the withAddress enrichment pass
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch.mock.calls[1][2]).toEqual({ withAddress: true });
    const stored = mockLookup.create.mock.calls[0][0].candidates;
    expect(stored[0].address).toContain('590 Paiea St');
    expect(stored[1].address).toContain('500 Ala Moana Blvd');
  });

  it('a failed pending write is logged, not thrown — and the name still reports needsLocation', async () => {
    mockLookup.create.mockRejectedValue(new Error('db down'));

    await expect(resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED)).resolves.toEqual({
      armed: [],
      needsLocation: ['Melaleuca'],
    });
  });
});

describe('verdict: single — one location, arm it as always', () => {
  beforeEach(() => {
    mockSearch.mockResolvedValue({ provider: 'google', anchor: null, candidates: [MELALEUCA_STORE] } as any);
  });

  it('creates the place and its geofence', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockLookup.create).not.toHaveBeenCalled();
    expect(mockPlace.create).toHaveBeenCalledTimes(1);
    expect(mockPlace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedName: 'Melaleuca',
        providerPlaceId: 'google:paiea',
        userConfirmed: true, // exact-name + proximity boosts clear the 0.45 threshold
        createdBy: 'inferred',
      })
    );
    expect(mockPlace.linkObject).toHaveBeenCalledWith('pl-Melaleuca', OBJ, 'mentioned_in_note');
    expect(mockGeo.create).toHaveBeenCalledWith(USER, expect.objectContaining({ createdBy: 'inferred' }));
  });

  it('records the Google fallback in diagnostics', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockLifecycle.record).toHaveBeenCalledWith(
      'PLACE_PROVIDER_FALLBACK',
      expect.objectContaining({ query: 'Melaleuca' })
    );
  });
});

describe('verdict: chain — fan out to the nearest 3, never ask', () => {
  it('creates places for the 3 nearest of 4 branches', async () => {
    // Four same-name branches; the Laie one is farthest from the recording spot.
    mockSearch.mockResolvedValue({
      provider: 'osm',
      anchor: null,
      candidates: [
        cand('Foodland', 21.3402, -158.0301, 'osm:ewa', 'supermarket'),
        cand('Foodland', 21.6465, -157.9252, 'osm:laie', 'supermarket'),
        cand('Foodland', 21.3335, -158.0888, 'osm:kapolei', 'supermarket'),
        cand('Foodland', 21.4176, -158.0083, 'osm:waipio', 'supermarket'),
      ],
    } as any);

    await resolveObjectPlaces(USER, OBJ, ['Foodland'], RECORDED);

    expect(mockLookup.create).not.toHaveBeenCalled();
    expect(mockPlace.create).toHaveBeenCalledTimes(3);
    const armedIds = mockPlace.create.mock.calls.map(([input]: any[]) => input.providerPlaceId);
    expect(armedIds).toEqual(expect.arrayContaining(['osm:ewa', 'osm:kapolei', 'osm:waipio']));
    expect(armedIds).not.toContain('osm:laie');
  });
});

describe('chain confidence floor — the Costco case', () => {
  it('arms every branch of a chain even when OSM importance leaves scores under the gate', async () => {
    // Field capture 2026-08-13: Costco is shop=wholesale with importance
    // ~0.001, so branches scored 0.35-0.40 against the 0.45 threshold —
    // places created, zero regions, bell silently off. A chain verdict is
    // arbitration ruling the name NOT vague, and must outrank the noisy
    // per-candidate score. relevance 0.001 + category null reproduces the
    // worst-case scoring.
    mockSearch.mockResolvedValue({
      provider: 'osm',
      anchor: null,
      candidates: [
        { ...cand('Costco', 21.4266, -158.0001, 'osm:waipahu'), category: null, relevance: 0.001 },
        { ...cand('Costco', 21.3267, -158.0875, 'osm:kapolei'), category: null, relevance: 0.001 },
        { ...cand('Costco', 21.3186, -157.8712, 'osm:iwilei'), category: null, relevance: 0.001 },
      ],
    } as any);

    await resolveObjectPlaces(USER, OBJ, ['Costco'], RECORDED);

    expect(mockPlace.create).toHaveBeenCalledTimes(3);
    for (const [input] of mockPlace.create.mock.calls as any[]) {
      expect(input.userConfirmed).toBe(true); // confidence floored to threshold
    }
    expect(mockGeo.create).toHaveBeenCalledTimes(3);
  });

  it('does NOT floor a single fuzzy result — the gate still guards non-chains', async () => {
    mockSearch.mockResolvedValue({
      provider: 'osm',
      anchor: null,
      // Name doesn't exactly match and importance is noise → genuinely weak.
      candidates: [{ ...cand('Costco Business Center', 41.0, -95.0, 'osm:far'), category: null, relevance: 0.001 }],
    } as any);

    await resolveObjectPlaces(USER, OBJ, ['Costco'], RECORDED);

    expect(mockGeo.create).not.toHaveBeenCalled();
  });
});

describe('the ignore list', () => {
  it('a dismissed word never reaches the geocoder again', async () => {
    mockLookup.isQueryIgnored.mockResolvedValue(true);

    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockLookup.create).not.toHaveBeenCalled();
    expect(mockPlace.create).not.toHaveBeenCalled();
  });
});

describe('anchor plumbing', () => {
  it('passes the note text and recording location through to resolveAnchors', async () => {
    await resolveObjectPlaces(USER, OBJ, ['Foodland'], RECORDED, 'grab poke at the Foodland in Hilo');

    expect(mockAnchors).toHaveBeenCalledWith({
      userId: USER,
      noteText: 'grab poke at the Foodland in Hilo',
      placeName: 'Foodland',
      recorded: { lat: RECORDED.latitude, lng: RECORDED.longitude },
    });
  });

  it('manual-geofence matches still short-circuit before any anchor or search work', async () => {
    mockGeo.findByUserId.mockResolvedValue([{ id: 'g1', name: 'Melaleuca', createdBy: 'manual' } as any]);

    await resolveObjectPlaces(USER, OBJ, ['Melaleuca'], RECORDED);

    expect(mockGeo.addLinkedObject).toHaveBeenCalledWith('g1', OBJ);
    expect(mockAnchors).not.toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
