/**
 * Place Resolution Service
 *
 * Resolves human-readable place names (e.g. "Costco", "Longs") to real
 * geographic coordinates.
 *
 * The geocoding itself lives in `placeProviders/` — this module owns what is
 * shared across providers: confidence scoring, radius selection, and picking
 * which candidates to return. Keeping the scoring here is deliberate, so that
 * adding a provider cannot quietly change how candidates are judged.
 */

import { osmProvider } from './placeProviders/osmProvider';
import type { ProviderCandidate } from './placeProviders/types';

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

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

function pickRadius(category: string | null): number {
  const key = category?.toLowerCase() || 'default';
  return RADIUS_BY_TYPE[key] ?? RADIUS_BY_TYPE.default;
}

// Place types that represent named commercial/amenity locations — reliably geocoded
const NAMED_PLACE_TYPES = new Set([
  'shop', 'supermarket', 'amenity', 'building', 'pharmacy',
  'restaurant', 'cafe', 'cinema', 'mall', 'fuel', 'bank',
  'fast_food', 'convenience', 'department_store',
]);

function computeConfidence(
  candidate: ProviderCandidate,
  userLat?: number,
  userLng?: number,
  queryName?: string
): number {
  // Base confidence from the provider's own ranking signal (0–1). Providers
  // without one land on the neutral 0.5, which the boosts below then move.
  let confidence = Math.min(candidate.relevance ?? 0.5, 1.0) * 0.6 + 0.2;

  // Boost for named commercial/amenity types — these are reliably identified by the
  // geocoder and directly correspond to what the user said. Without this, Costco
  // (OSM importance ~0.3) would score only ~0.38, silently failing the geofence
  // creation threshold.
  const placeType = (candidate.category || '').toLowerCase();
  if (NAMED_PLACE_TYPES.has(placeType)) {
    confidence = Math.min(confidence + 0.25, 0.90);
  }

  // Boost if the result name exactly matches the query (case-insensitive) — strong signal
  if (queryName && candidate.name && candidate.name.toLowerCase() === queryName.toLowerCase()) {
    confidence = Math.min(confidence + 0.15, 0.95);
  }

  // Boost if user location is available and result is nearby
  if (userLat !== undefined && userLng !== undefined) {
    const distKm = haversineKm(userLat, userLng, candidate.lat, candidate.lng);
    if (distKm < 0.5) {
      confidence = Math.min(confidence + 0.3, 0.95);
    } else if (distKm < 5) {
      confidence = Math.min(confidence + 0.15, 0.85);
    } else if (distKm < 20) {
      confidence = Math.min(confidence + 0.05, 0.75);
    } else if (distKm > 100) {
      // A match >100km from the user is almost certainly the wrong location
      // (a same-name chain on another continent). Force it below the geofence
      // threshold so it can never spawn a bogus geofence, even if the geocoder's
      // viewbox bound was bypassed (e.g. no user location available).
      confidence = Math.min(confidence, 0.3);
    }
  }

  return Math.round(confidence * 100) / 100;
}

function toResolvedPlace(
  candidate: ProviderCandidate,
  rawName: string,
  userLocation?: { lat: number; lng: number }
): ResolvedPlace {
  return {
    rawName,
    normalizedName: candidate.name,
    providerPlaceId: candidate.providerPlaceId,
    lat: candidate.lat,
    lng: candidate.lng,
    radiusMeters: pickRadius(candidate.category),
    category: candidate.category || 'place',
    confidence: computeConfidence(candidate, userLocation?.lat, userLocation?.lng, rawName),
  };
}

/**
 * Resolve a place name to a single best geographic match.
 *
 * @param placeName - Raw place name from the note (e.g. "Costco", "Longs Drugs")
 * @param userLocation - Optional user location for proximity bias and confidence calc
 * @returns Resolved place or null if no suitable match found
 */
export async function resolvePlaceName(
  placeName: string,
  userLocation?: { lat: number; lng: number }
): Promise<ResolvedPlace | null> {
  const candidates = await osmProvider.search(placeName, userLocation);
  if (candidates.length === 0) return null;

  const resolved = toResolvedPlace(candidates[0], placeName, userLocation);
  console.log(
    `[PlaceResolution] Resolved "${placeName}" → "${resolved.normalizedName}" (confidence: ${resolved.confidence})`
  );
  return resolved;
}

/**
 * Resolve a place name to up to 3 geographic candidates.
 * Used when creating multiple geofences for the same named place (e.g. chain stores).
 */
export async function resolvePlaceNameMulti(
  placeName: string,
  userLocation?: { lat: number; lng: number }
): Promise<ResolvedPlace[]> {
  const candidates = await osmProvider.search(placeName, userLocation);
  if (candidates.length === 0) return [];

  const resolved = candidates.map((c) => toResolvedPlace(c, placeName, userLocation));

  // For a chain name we create a geofence per candidate, so return the 3
  // NEAREST to the user (provider order is by prominence, not distance).
  // Without a user location, fall back to the provider's own order.
  const NEAREST_N = 3;
  const selected = (userLocation
    ? resolved
        .slice()
        .sort(
          (a, b) =>
            haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) -
            haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng)
        )
    : resolved
  ).slice(0, NEAREST_N);

  console.log(`[PlaceResolution] Resolved "${placeName}" → ${selected.length} of ${resolved.length} candidate(s) (nearest): ${selected.map(r => r.normalizedName).join(', ')}`);
  return selected;
}
