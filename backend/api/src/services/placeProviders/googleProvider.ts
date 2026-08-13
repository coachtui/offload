/**
 * Google Places API (New) provider — Text Search.
 *
 * Covers the gap OSM cannot: business names. OSM is volunteer-mapped geography,
 * so a warehouse tenant like Melaleuca (590 Paiea St) simply is not in it, while
 * Google indexes the business itself. This provider is the fallback in the
 * chain, called only when OSM returns nothing — OSM keeps the well-mapped
 * chain-store majority free.
 *
 * Cost discipline lives in the field mask: id/displayName/location/primaryType
 * is the cheap SKU. `formattedAddress` moves the request into a costlier one,
 * and is only ever needed when we are about to show the user a choice — so it
 * is opt-in via `withAddress`, not default.
 *
 * The key is server-side only (Railway env). Its absence is a supported state,
 * not an error: search returns [] without fetching, the chain degrades to
 * OSM-only, and everything unresolved queues as a pending lookup.
 */

import type { PlaceProvider, PlaceProviderSearchOptions, ProviderCandidate } from './types';

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

// Cheap-SKU mask. Address is appended only on withAddress — see module comment.
const BASE_FIELD_MASK = 'places.id,places.displayName,places.location,places.primaryType';

// Soft bias, same reach as the OSM viewbox (~50 km). Bias, not restriction:
// anchors are tried in order and a wrong guess must cost nothing.
const BIAS_RADIUS_METERS = 50000.0;

// DISTANCE ranking puts the branches the user might actually reach at the top
// of the window; 10 results is plenty once the arbitration name-filter has
// dropped the noise Text Search mixes in.
const MAX_RESULTS = 10;

const REQUEST_TIMEOUT_MS = 5000;

interface TextSearchPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
}

async function search(
  query: string,
  near?: { lat: number; lng: number },
  opts?: PlaceProviderSearchOptions
): Promise<ProviderCandidate[]> {
  // Read at call time, not module scope, so a key added to the environment
  // takes effect without a restart-ordering hazard (and so tests can vary it).
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  try {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: MAX_RESULTS,
    };
    if (near) {
      body.rankPreference = 'DISTANCE';
      body.locationBias = {
        circle: {
          center: { latitude: near.lat, longitude: near.lng },
          radius: BIAS_RADIUS_METERS,
        },
      };
    }

    const fieldMask = opts?.withAddress
      ? `${BASE_FIELD_MASK},places.formattedAddress`
      : BASE_FIELD_MASK;

    console.log(`[googleProvider] Searching "${query}"${near ? ` near ${near.lat.toFixed(4)}, ${near.lng.toFixed(4)}` : ' (no anchor)'}...`);

    const response = await fetch(TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[googleProvider] Text Search responded with ${response.status}`);
      return [];
    }

    // A zero-result search returns {} — no `places` key at all.
    const data = (await response.json()) as { places?: TextSearchPlace[] };
    const places = data.places ?? [];
    if (places.length === 0) {
      console.log(`[googleProvider] No results for "${query}"`);
      return [];
    }

    return places
      .filter((p) => p.location && p.displayName?.text)
      .map((p) => ({
        name: p.displayName!.text!,
        address: p.formattedAddress ?? null,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        providerPlaceId: `google:${p.id}`,
        category: p.primaryType ?? null,
        // relevance deliberately absent: Google has no importance equivalent,
        // and the confidence calculation's neutral default is the fair score.
      }));
  } catch (error) {
    console.warn(`[googleProvider] Error searching "${query}":`, error);
    return [];
  }
}

export const googleProvider: PlaceProvider = {
  name: 'google',
  search,
};
