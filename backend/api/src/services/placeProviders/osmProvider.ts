/**
 * OpenStreetMap Nominatim provider.
 *
 * Free, no API key, and reliable for chains and geography. Its blind spot is
 * business names: it is volunteer-mapped, so a warehouse tenant or a small
 * local office is often absent even when the street and the building are
 * present. That gap is what the Google provider covers.
 */

import type { PlaceProvider, ProviderCandidate } from './types';

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy requires a genuine, identifiable User-Agent with a real
// contact. Placeholder domains (e.g. example.com) are on their blocklist and get a
// 403 — which silently broke ALL place resolution in production (see git history).
const USER_AGENT = 'Offload/1.0 (https://tuialailima.com; tui@tuialailima.com)';

// ~0.45° ≈ 50km half-width box around the anchor.
const VIEWBOX_DELTA = 0.45;

// Nominatim's /search maximum. We fetch a BROAD candidate pool because Nominatim
// orders by importance, not distance, and a user's closest branch of a chain often
// has LOWER importance than busier branches in town — with a small limit it never
// enters the pool at all, so a later distance sort would pick a far branch (e.g. a
// McDonald's 15km away instead of the one 0.6km away).
const RESULT_LIMIT = '40';

const REQUEST_TIMEOUT_MS = 5000;

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
}

/** Use the result's `name` field if present, else the first part of display_name. */
function candidateName(result: NominatimResult): string {
  return result.name?.trim() || result.display_name.split(',')[0].trim();
}

async function search(
  query: string,
  near?: { lat: number; lng: number }
): Promise<ProviderCandidate[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: RESULT_LIMIT,
      addressdetails: '1',
    });

    if (near) {
      params.set(
        'viewbox',
        `${near.lng - VIEWBOX_DELTA},${near.lat + VIEWBOX_DELTA},${near.lng + VIEWBOX_DELTA},${near.lat - VIEWBOX_DELTA}`
      );
      // bounded=1 HARD-restricts results to the viewbox. With bounded=0 a generic
      // chain name like "McDonald's" returns the globally "most important" matches
      // (Spain, Australia, Mexico…) and ignores the box entirely — producing
      // geofences thousands of km away that never fire. Hard-bounding to the
      // anchor's region returns the actual nearby locations.
      params.set('bounded', '1');
    }

    const url = `${NOMINATIM_SEARCH}?${params.toString()}`;
    console.log(`[osmProvider] Searching "${query}"${near ? ` near ${near.lat.toFixed(4)}, ${near.lng.toFixed(4)}` : ' (no anchor)'}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[osmProvider] Nominatim responded with ${response.status}`);
      return [];
    }

    const results = (await response.json()) as NominatimResult[];
    if (!results || results.length === 0) {
      console.log(`[osmProvider] No results for "${query}"`);
      return [];
    }

    return results.map((r) => ({
      name: candidateName(r),
      address: r.display_name ?? null,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      providerPlaceId: `osm:${r.place_id}`,
      category: r.type || r.class || null,
      relevance: r.importance,
    }));
  } catch (error) {
    console.warn(`[osmProvider] Error searching "${query}":`, error);
    return [];
  }
}

export const osmProvider: PlaceProvider = {
  name: 'osm',
  search,
};
