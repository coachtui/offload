/**
 * Place Resolution Service
 *
 * Resolves human-readable place names (e.g. "Costco", "Longs") to real
 * geographic coordinates using the OpenStreetMap Nominatim API.
 *
 * No API key required. Must include a User-Agent header per OSM usage policy.
 */

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'BrainDump/1.0 (brain-dump-app; contact: hello@example.com)';

// Radius defaults by OSM place type
const RADIUS_BY_TYPE: Record<string, number> = {
  shop: 100,
  amenity: 120,
  building: 100,
  supermarket: 200,
  pharmacy: 100,
  restaurant: 80,
  cafe: 80,
  cinema: 150,
  mall: 300,
  place: 300,
  suburb: 500,
  neighbourhood: 400,
  default: 150,
};

export interface ResolvedPlace {
  rawName: string;
  normalizedName: string;
  providerPlaceId: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string;
  confidence: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickRadius(result: NominatimResult): number {
  const key = result.type?.toLowerCase() || result.class?.toLowerCase() || 'default';
  return RADIUS_BY_TYPE[key] ?? RADIUS_BY_TYPE.default;
}

function computeConfidence(
  result: NominatimResult,
  userLat?: number,
  userLng?: number
): number {
  // Base confidence from OSM importance score (0–1)
  let confidence = Math.min(result.importance ?? 0.5, 1.0) * 0.6 + 0.2;

  // Boost if user location is available and result is nearby
  if (userLat !== undefined && userLng !== undefined) {
    const distKm = haversineKm(userLat, userLng, parseFloat(result.lat), parseFloat(result.lon));
    if (distKm < 0.5) {
      confidence = Math.min(confidence + 0.3, 0.95);
    } else if (distKm < 5) {
      confidence = Math.min(confidence + 0.15, 0.85);
    } else if (distKm < 20) {
      confidence = Math.min(confidence + 0.05, 0.75);
    }
  }

  return Math.round(confidence * 100) / 100;
}

function buildNormalizedName(result: NominatimResult): string {
  // Use the result's `name` field if present, else the first part of display_name
  const base = result.name?.trim() || result.display_name.split(',')[0].trim();
  return base;
}

/**
 * Resolve a place name to geographic coordinates.
 *
 * @param placeName - Raw place name from the note (e.g. "Costco", "Longs Drugs")
 * @param userLocation - Optional user location for proximity bias and confidence calc
 * @returns Resolved place or null if no suitable match found
 */
export async function resolvePlaceName(
  placeName: string,
  userLocation?: { lat: number; lng: number }
): Promise<ResolvedPlace | null> {
  try {
    const params = new URLSearchParams({
      q: placeName,
      format: 'json',
      limit: '3',
      addressdetails: '1',
    });

    // Bias results toward user location if available
    if (userLocation) {
      const delta = 0.2; // ~22km bbox
      params.set(
        'viewbox',
        `${userLocation.lng - delta},${userLocation.lat + delta},${userLocation.lng + delta},${userLocation.lat - delta}`
      );
      params.set('bounded', '0'); // Allow results outside viewbox (just bias)
    }

    const url = `${NOMINATIM_SEARCH}?${params.toString()}`;
    console.log(`[PlaceResolution] Resolving "${placeName}" via Nominatim...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.warn(`[PlaceResolution] Nominatim responded with ${response.status}`);
      return null;
    }

    const results = (await response.json()) as NominatimResult[];

    if (!results || results.length === 0) {
      console.log(`[PlaceResolution] No results for "${placeName}"`);
      return null;
    }

    // Take the top result
    const top = results[0];
    const confidence = computeConfidence(top, userLocation?.lat, userLocation?.lng);

    const resolved: ResolvedPlace = {
      rawName: placeName,
      normalizedName: buildNormalizedName(top),
      providerPlaceId: `osm:${top.place_id}`,
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      radiusMeters: pickRadius(top),
      category: top.type || top.class || 'place',
      confidence,
    };

    console.log(
      `[PlaceResolution] Resolved "${placeName}" → "${resolved.normalizedName}" (confidence: ${confidence})`
    );

    return resolved;
  } catch (error) {
    console.warn(`[PlaceResolution] Error resolving "${placeName}":`, error);
    return null;
  }
}
