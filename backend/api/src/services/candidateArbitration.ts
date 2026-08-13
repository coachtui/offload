/**
 * Candidate arbitration — decides what a set of geocoder results *means*.
 *
 * The question is not "how many candidates" but "are these interchangeable".
 * For a chain (Foodland), every branch is a valid target and fan-out is
 * correct; asking would force a choice the user cannot make yet. For a
 * same-name pair that are different destinations (Melaleuca's warehouse vs
 * its Ala Moana suite), arming either silently is a coin flip — ask.
 *
 * Measured against the live API (2026-08-12), `primaryType` cannot carry this
 * distinction: Foodland branches span grocery_store/supermarket/gas_station,
 * and Costco's departments span seven types at one address. What the data
 * does expose is NAME and CO-LOCATION, so that is what this uses:
 *
 *   1. Name filter    — drop rows that aren't the place ("Ewa Town Center"
 *                       from a Foodland query).
 *   2. Co-location    — rows within 300 m are one location; departments
 *      collapse          (Costco Gas Station, Food Court, Tire…) fold into
 *                       the warehouse whose address they share. Also the fix
 *                       for the historical "Costco Gasoline" geofence 25 km
 *                       from the intended store.
 *   3. Count          — 0 none / 1 single / 2 ambiguous / ≥3 chain.
 *
 * Pure function: no I/O, no provider knowledge beyond ProviderCandidate.
 */

import { haversineKm } from './placeResolutionService';
import type { ProviderCandidate } from './placeProviders/types';

export type ArbitrationVerdict = 'none' | 'single' | 'ambiguous' | 'chain';

export interface ArbitrationResult {
  verdict: ArbitrationVerdict;
  /** One representative per distinct location, input order preserved. */
  locations: ProviderCandidate[];
}

/** Two rows this close are the same destination, not two destinations. */
const CO_LOCATION_METERS = 300;

/**
 * Exact match, or query as a whole-word prefix ("Foodland" claims "Foodland
 * Farms" but "Long" does not claim "Longs Drugs"). Deliberately NOT substring:
 * "KAHALA MKT. by Foodland" is dropped, and that is accepted — a missed branch
 * costs one extra pending lookup, while a false positive arms a geofence on a
 * place the user never named.
 */
function nameMatchesQuery(name: string, query: string): boolean {
  const n = name.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q || !n.startsWith(q)) return false;
  if (n.length === q.length) return true;
  return !/[a-z0-9]/.test(n.charAt(q.length));
}

function metersBetween(a: ProviderCandidate, b: ProviderCandidate): number {
  return haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000;
}

/**
 * Pick the row that names the LOCATION rather than a department of it.
 *
 * "Closest name to the query" fails here: by edit distance, "Costco Bakery"
 * beats "Costco Wholesale". The signal that works is frequency across the
 * whole result set — a chain repeats its primary name at every branch
 * ("Costco Wholesale" ×4) while department names repeat less or not at all.
 * Ties break to the shorter name, then to provider order.
 */
function pickRepresentative(
  cluster: ProviderCandidate[],
  nameCounts: Map<string, number>
): ProviderCandidate {
  return cluster.reduce((best, c) => {
    const bestCount = nameCounts.get(best.name.toLowerCase()) ?? 0;
    const count = nameCounts.get(c.name.toLowerCase()) ?? 0;
    if (count > bestCount) return c;
    if (count === bestCount && c.name.length < best.name.length) return c;
    return best;
  });
}

export function arbitrate(query: string, candidates: ProviderCandidate[]): ArbitrationResult {
  // 1. Name filter
  const filtered = candidates.filter((c) => nameMatchesQuery(c.name, query));
  if (filtered.length === 0) return { verdict: 'none', locations: [] };

  // 2. Co-location collapse — greedy, any-member linkage so a strip of
  // adjacent departments chains into its warehouse.
  const clusters: ProviderCandidate[][] = [];
  for (const candidate of filtered) {
    const host = clusters.find((cluster) =>
      cluster.some((member) => metersBetween(member, candidate) <= CO_LOCATION_METERS)
    );
    if (host) host.push(candidate);
    else clusters.push([candidate]);
  }

  const nameCounts = new Map<string, number>();
  for (const c of filtered) {
    const key = c.name.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const locations = clusters.map((cluster) => pickRepresentative(cluster, nameCounts));

  // 3. Count
  const verdict: ArbitrationVerdict =
    locations.length === 1 ? 'single' : locations.length === 2 ? 'ambiguous' : 'chain';
  return { verdict, locations };
}
