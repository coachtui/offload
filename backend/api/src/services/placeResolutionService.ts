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
import { googleProvider } from './placeProviders/googleProvider';
import { PlaceProviderCacheModel } from '../models/PlaceLookup';
import type { PlaceProvider, PlaceProviderSearchOptions, ProviderCandidate } from './placeProviders/types';
// Type-only: placeAnchors imports haversineKm from this module at runtime, so a
// value import here would be a cycle. Types are erased at compile time.
import type { Anchor } from './placeAnchors';

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
  // Costco is shop=wholesale in OSM. Its absence here left every branch at
  // ~0.35-0.40 — five hundredths under the geofence threshold — while Walmart
  // (department_store) armed at 0.65. Field-found 2026-08-13, first day the
  // lifecycle table had data.
  'wholesale',
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

export function candidateToResolvedPlace(
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

// ─── Anchored provider chain ─────────────────────────────────────────────────

/** A candidate this far from EVERY anchor is the wrong place, whatever the bias said. */
const MAX_KM_FROM_ANY_ANCHOR = 100;

export interface AnchoredSearchOptions extends PlaceProviderSearchOptions {
  /**
   * Does this provider's (gated) answer actually answer the question?
   * A provider that returns rows the caller's arbitration then filters to
   * nothing has NOT answered — without this, OSM returning junk-shaped rows
   * stopped the chain and Google was never consulted, which is how a Home
   * Depot query died on the word "The" while Google would have matched any
   * casual phrasing of it. Defaults to "any gated candidate counts".
   */
  accept?: (candidates: ProviderCandidate[]) => boolean;
}

export interface AnchoredSearchResult {
  /** Which provider answered, or null when every anchor missed. */
  provider: 'osm' | 'google' | null;
  /** The anchor that produced the answer, null when unanchored or empty. */
  anchor: Anchor | null;
  candidates: ProviderCandidate[];
}

/**
 * Try each anchor in priority order; at each, OSM first (free, well-tuned for
 * chains) and Google only on an OSM miss (business names OSM lacks — the
 * Melaleuca case). First anchor that yields gated candidates wins.
 *
 * Short-circuiting, never merging: mixing two providers' results creates
 * duplicate-branch problems the proximity dedupe was not designed for.
 *
 * The distance gate replaces the old hard 50 km bound. Google's locationBias
 * is soft — it can return a match on another continent — and the gate is what
 * makes that safe: a candidate must be within 100 km of at least ONE anchor
 * (any anchor, not just the winning one, so a genuinely local errand while
 * travelling survives the home anchor's pass). An anchor whose candidates are
 * all gated out counts as a miss and the chain continues.
 */
export async function searchPlaceCandidates(
  query: string,
  anchors: Anchor[],
  opts?: AnchoredSearchOptions
): Promise<AnchoredSearchResult> {
  const withinGate = (c: ProviderCandidate): boolean =>
    anchors.length === 0 ||
    anchors.some((a) => haversineKm(a.lat, a.lng, c.lat, c.lng) <= MAX_KM_FROM_ANY_ANCHOR);

  // No anchors: single unanchored pass. The gate has nothing to measure from,
  // so it stands down — scoring's own >100 km confidence clamp still applies
  // downstream.
  const anchorPasses: Array<Anchor | null> = anchors.length > 0 ? anchors : [null];

  // The cache is keyed on the anchor's ~11 km cell, so it only participates
  // when there IS an anchor. withAddress bypasses it in both directions:
  // entries are written from the cheap field mask and lack addresses, and a
  // sheet-bound lookup must not poison the cache with costlier-SKU data
  // either. Cache failures degrade to a live call — never a failed resolution.
  const cacheable = !opts?.withAddress;

  const fetchThroughCache = async (
    provider: PlaceProvider,
    near: { lat: number; lng: number } | undefined
  ): Promise<ProviderCandidate[]> => {
    if (!near || !cacheable) {
      return opts?.withAddress ? provider.search(query, near, { withAddress: true }) : provider.search(query, near);
    }
    try {
      const cached = await PlaceProviderCacheModel.get(query, near.lat, near.lng, provider.name);
      if (cached !== null) return cached; // [] is an answer: "this provider has nothing here"
    } catch (error) {
      console.warn(`[PlaceResolution] Cache read failed for "${query}":`, error);
    }
    const found = await provider.search(query, near);
    try {
      // Raw response, pre-gate: the gate depends on the anchor set, which
      // varies call to call — it re-applies on every read.
      await PlaceProviderCacheModel.put(query, near.lat, near.lng, provider.name, found);
    } catch (error) {
      console.warn(`[PlaceResolution] Cache write failed for "${query}":`, error);
    }
    return found;
  };

  for (const anchor of anchorPasses) {
    const near = anchor ? { lat: anchor.lat, lng: anchor.lng } : undefined;
    for (const provider of [osmProvider, googleProvider]) {
      const found = await fetchThroughCache(provider, near);
      const gated = found.filter(withinGate);
      if (gated.length > 0 && (!opts?.accept || opts.accept(gated))) {
        return { provider: provider.name, anchor, candidates: gated };
      }
    }
  }

  return { provider: null, anchor: null, candidates: [] };
}

/**
 * For a chain name we create a geofence per branch, so pick the N NEAREST to
 * the user (provider order is by prominence/distance-from-anchor, not
 * distance-from-user — the anchor may be home while the user is away).
 * Without a user location, keep the provider's own order.
 */
export function selectNearestResolved(
  resolved: ResolvedPlace[],
  userLocation?: { lat: number; lng: number },
  n = 3
): ResolvedPlace[] {
  const sorted = userLocation
    ? resolved
        .slice()
        .sort(
          (a, b) =>
            haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) -
            haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng)
        )
    : resolved;
  return sorted.slice(0, n);
}
