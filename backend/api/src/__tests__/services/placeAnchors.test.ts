import { resolveAnchors, extractNamedRegion } from '../../services/placeAnchors';
import { GeofenceModel } from '../../models/Geofence';
import { PlaceModel } from '../../models/Place';
import { Session } from '../../models/Session';
import { osmProvider } from '../../services/placeProviders/osmProvider';

jest.mock('../../models/Geofence', () => ({
  GeofenceModel: { findByUserId: jest.fn() },
}));
jest.mock('../../models/Place', () => ({
  PlaceModel: { findByUserId: jest.fn() },
}));
jest.mock('../../models/Session', () => ({
  Session: { findByUserId: jest.fn() },
}));
jest.mock('../../services/placeProviders/osmProvider', () => ({
  osmProvider: { name: 'osm', search: jest.fn() },
}));

const mockGeo = GeofenceModel as jest.Mocked<typeof GeofenceModel>;
const mockPlace = PlaceModel as jest.Mocked<typeof PlaceModel>;
const mockSession = Session as jest.Mocked<typeof Session>;
const mockOsm = osmProvider as jest.Mocked<typeof osmProvider>;

const HONOLULU = { lat: 21.33, lng: -157.92 };
const VEGAS = { lat: 36.17, lng: -115.14 };
const HILO = { lat: 19.7074, lng: -155.0885 };

function geofenceAt(lat: number, lng: number, createdBy = 'manual') {
  return { center: { latitude: lat, longitude: lng }, createdBy } as any;
}

function placeAt(lat: number, lng: number) {
  return { lat, lng } as any;
}

function sessionAt(lat: number, lng: number) {
  return { location: { latitude: lat, longitude: lng } } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGeo.findByUserId.mockResolvedValue([]);
  mockPlace.findByUserId.mockResolvedValue([]);
  mockSession.findByUserId.mockResolvedValue({ sessions: [], total: 0 });
  mockOsm.search.mockResolvedValue([]);
});

describe('extractNamedRegion', () => {
  it('finds the region the note names after the place', () => {
    expect(extractNamedRegion('grab poke at the Foodland in Hilo', 'Foodland')).toBe('Hilo');
  });

  it('handles multi-word and Hawaiian-orthography regions', () => {
    expect(extractNamedRegion('return the tool to Costco in Kailua-Kona', 'Costco')).toBe('Kailua-Kona');
    expect(extractNamedRegion('drop the plans at the office in Pearl City', 'office')).toBe('Pearl City');
  });

  it('returns null when the note names no region', () => {
    expect(extractNamedRegion('I need chicken and soda from Costco', 'Costco')).toBeNull();
  });

  it('does not treat a lowercase word as a region', () => {
    expect(extractNamedRegion('get chicken at Costco in town', 'Costco')).toBeNull();
  });
});

describe('resolveAnchors', () => {
  it('a note naming a region anchors there FIRST — the user said it out loud', async () => {
    mockOsm.search.mockResolvedValue([
      { name: 'Hilo', address: 'Hilo, Hawaii County…', lat: HILO.lat, lng: HILO.lng, providerPlaceId: 'osm:1', category: 'town' },
    ]);

    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'grab poke at the Foodland in Hilo',
      placeName: 'Foodland',
      recorded: HONOLULU,
    });

    expect(anchors[0]).toEqual({ lat: HILO.lat, lng: HILO.lng, source: 'named_region' });
    expect(mockOsm.search).toHaveBeenCalledWith('Hilo');
  });

  it('ignores a region geocode that is not a region — a shop named Hilo must not anchor', async () => {
    mockOsm.search.mockResolvedValue([
      { name: 'Hilo Hattie', address: null, lat: 21.31, lng: -157.87, providerPlaceId: 'osm:2', category: 'shop' },
    ]);

    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'grab poke at the Foodland in Hilo',
      placeName: 'Foodland',
      recorded: HONOLULU,
    });

    expect(anchors.every((a) => a.source !== 'named_region')).toBe(true);
  });

  it('recorded inside the home region → current location only (home adds nothing within one bias circle)', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofenceAt(21.336, -157.915), geofenceAt(21.34, -157.90)]);

    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'pick up my order from Melaleuca',
      placeName: 'Melaleuca',
      recorded: HONOLULU,
    });

    expect(anchors).toEqual([{ lat: HONOLULU.lat, lng: HONOLULU.lng, source: 'current_location' }]);
  });

  it('recorded on the mainland → home centroid anchors BEFORE current location', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofenceAt(21.336, -157.915)]);
    mockPlace.findByUserId.mockResolvedValue([placeAt(21.34, -157.90)]);

    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'grab poke at Foodland',
      placeName: 'Foodland',
      recorded: VEGAS,
    });

    expect(anchors.map((a) => a.source)).toEqual(['home_region', 'current_location']);
    expect(anchors[0].lat).toBeCloseTo(21.338, 2);
    expect(anchors[0].lng).toBeCloseTo(-157.9075, 2);
    expect(anchors[1]).toEqual({ lat: VEGAS.lat, lng: VEGAS.lng, source: 'current_location' });
  });

  it('no geofences or places → home falls back to the modal recording location', async () => {
    mockSession.findByUserId.mockResolvedValue({
      sessions: [
        sessionAt(21.33, -157.92),
        sessionAt(21.331, -157.921),
        sessionAt(21.332, -157.919),
        sessionAt(36.1, -115.1), // one trip to Vegas must not drag the centroid
      ],
      total: 4,
    });

    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'grab poke at Foodland',
      placeName: 'Foodland',
      recorded: VEGAS,
    });

    expect(anchors[0].source).toBe('home_region');
    expect(anchors[0].lat).toBeCloseTo(21.331, 2);
  });

  it('a user with no history yields only the current-location anchor', async () => {
    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'pick up my order from Melaleuca',
      placeName: 'Melaleuca',
      recorded: HONOLULU,
    });

    expect(anchors).toEqual([{ lat: HONOLULU.lat, lng: HONOLULU.lng, source: 'current_location' }]);
  });

  it('no recorded location → home region alone', async () => {
    mockGeo.findByUserId.mockResolvedValue([geofenceAt(21.336, -157.915)]);

    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'pick up my order from Melaleuca',
      placeName: 'Melaleuca',
    });

    expect(anchors).toEqual([{ lat: 21.336, lng: -157.915, source: 'home_region' }]);
  });

  it('no history and no recorded location → no anchors, never a throw', async () => {
    const anchors = await resolveAnchors({
      userId: 'u1',
      noteText: 'pick up my order from Melaleuca',
      placeName: 'Melaleuca',
    });

    expect(anchors).toEqual([]);
  });
});
