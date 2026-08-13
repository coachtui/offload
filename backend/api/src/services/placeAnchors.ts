/**
 * Search anchors — where to LOOK for a spoken place name.
 *
 * The old resolver hard-bounded to a 50 km box around wherever the user stood
 * at record time. That box is why "grab poke at Foodland" said from a Las
 * Vegas hotel resolved to nothing — which is precisely backwards, since a
 * reminder set from far away is the one that most needs to resolve.
 *
 * Anchors are tried in priority order; the first that yields candidates wins:
 *
 *   1. named_region     — a region the note itself names ("the Foodland in
 *                         Hilo"). Highest priority: the user said it out loud.
 *   2. current_location — where the note was recorded, when that is inside
 *                         the user's home region (or when home is unknown).
 *   3. home_region      — a learned centroid. This is what makes the Vegas
 *                         note resolve to a Honolulu Foodland. When recording
 *                         away from home it outranks current location, but
 *                         current stays in the list — a genuinely local errand
 *                         while travelling still resolves after home misses.
 *
 * Home region: centroid of the user's manual geofences and places — the spots
 * they demonstrably care about — falling back to the modal recording location
 * of their recent sessions (modal, not mean: one trip must not drag the
 * centroid into the ocean).
 */

import { GeofenceModel } from '../models/Geofence';
import { PlaceModel } from '../models/Place';
import { Session } from '../models/Session';
import { osmProvider } from './placeProviders/osmProvider';
import { haversineKm } from './placeResolutionService';

export interface Anchor {
  lat: number;
  lng: number;
  source: 'named_region' | 'current_location' | 'home_region';
}

/** Recorded within this of home ⇒ "at home", and home adds nothing extra. */
const HOME_NEARBY_KM = 100;

/** Sessions to sample for the modal-location fallback. */
const SESSION_SAMPLE = 50;

/** Modal-location cell size in degrees (~5 km) — visits cluster, trips don't. */
const CELL_DEGREES = 0.05;

/** OSM categories that mean "a region", not "a thing in a region". */
const REGION_CATEGORIES = new Set([
  'city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter',
  'island', 'county', 'state', 'region', 'administrative', 'locality',
  'municipality', 'city_district',
]);

/**
 * Pull a region name out of the note text: "<place> in <Capitalized …>".
 * Capitalization is the guard — "Costco in town" names no region. Allows
 * Hawaiian orthography (ʻokina) and hyphenated names like Kailua-Kona.
 */
export function extractNamedRegion(noteText: string, placeName: string): string | null {
  const escaped = placeName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return null;

  const pattern = new RegExp(
    `\\b${escaped}\\b[,]?\\s+in\\s+((?:[A-Z][\\w'ʻ-]*)(?:\\s+[A-Z][\\w'ʻ-]*)*)`,
    'u'
  );
  const match = noteText.match(pattern);
  return match ? match[1].trim() : null;
}

/** Geocode a region name, accepting only results that ARE regions. */
async function geocodeRegion(regionName: string): Promise<Anchor | null> {
  const results = await osmProvider.search(regionName);
  const region = results.find(
    (r) => r.category !== null && REGION_CATEGORIES.has(r.category.toLowerCase())
  );
  if (!region) return null;
  return { lat: region.lat, lng: region.lng, source: 'named_region' };
}

/**
 * Centroid of the user's saved geography, or null when there is none.
 * Never throws — anchor computation is advisory, and a DB hiccup here must
 * degrade to fewer anchors, not fail the resolution that asked.
 */
async function computeHomeRegion(userId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [geofences, places] = await Promise.all([
      GeofenceModel.findByUserId(userId),
      PlaceModel.findByUserId(userId),
    ]);

    const points: Array<{ lat: number; lng: number }> = [
      ...geofences.map((g) => ({ lat: g.center.latitude, lng: g.center.longitude })),
      ...places.map((p) => ({ lat: p.lat, lng: p.lng })),
    ];

    if (points.length === 0) {
      // Fall back to where the user actually records: modal cell, then its mean.
      const { sessions } = await Session.findByUserId(userId, { limit: SESSION_SAMPLE });
      const located = sessions.filter((s) => s.location);
      if (located.length === 0) return null;

      const cells = new Map<string, Array<{ lat: number; lng: number }>>();
      for (const s of located) {
        const lat = s.location!.latitude;
        const lng = s.location!.longitude;
        const key = `${Math.round(lat / CELL_DEGREES)}:${Math.round(lng / CELL_DEGREES)}`;
        const cell = cells.get(key) ?? [];
        cell.push({ lat, lng });
        cells.set(key, cell);
      }
      const modal = [...cells.values()].reduce((a, b) => (b.length > a.length ? b : a));
      points.push(...modal);
    }

    const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
    return { lat, lng };
  } catch (error) {
    console.warn(`[placeAnchors] Home-region computation failed for ${userId}:`, error);
    return null;
  }
}

export async function resolveAnchors(params: {
  userId: string;
  noteText: string;
  placeName: string;
  recorded?: { lat: number; lng: number };
}): Promise<Anchor[]> {
  const { userId, noteText, placeName, recorded } = params;
  const anchors: Anchor[] = [];

  const regionName = extractNamedRegion(noteText, placeName);
  if (regionName) {
    const regionAnchor = await geocodeRegion(regionName);
    if (regionAnchor) anchors.push(regionAnchor);
  }

  const home = await computeHomeRegion(userId);

  if (recorded && home) {
    const kmFromHome = haversineKm(recorded.lat, recorded.lng, home.lat, home.lng);
    if (kmFromHome <= HOME_NEARBY_KM) {
      // At home: current location is the better version of the same anchor.
      anchors.push({ lat: recorded.lat, lng: recorded.lng, source: 'current_location' });
    } else {
      // Away: home first — the Vegas note about Foodland means the one at home —
      // but keep current, for the genuinely local errand while travelling.
      anchors.push({ lat: home.lat, lng: home.lng, source: 'home_region' });
      anchors.push({ lat: recorded.lat, lng: recorded.lng, source: 'current_location' });
    }
  } else if (recorded) {
    anchors.push({ lat: recorded.lat, lng: recorded.lng, source: 'current_location' });
  } else if (home) {
    anchors.push({ lat: home.lat, lng: home.lng, source: 'home_region' });
  }

  return anchors;
}
