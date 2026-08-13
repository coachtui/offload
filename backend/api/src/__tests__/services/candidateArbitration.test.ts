import { arbitrate } from '../../services/candidateArbitration';
import type { ProviderCandidate } from '../../services/placeProviders/types';

/**
 * Fixtures reconstruct the live Text Search captures of 2026-08-12 (names,
 * addresses and structure verbatim; coordinates re-attached from the known
 * geography, since that capture's field mask omitted places.location).
 * The structure is the specification:
 *   - Foodland: 20 rows including non-Foodland noise the name filter must drop
 *   - Costco: 20 rows where departments share each warehouse's address
 *   - Melaleuca: 2 exact-name rows 6.9 km apart — the case that started this
 */

function cand(name: string, lat: number, lng: number, category: string | null, id: string): ProviderCandidate {
  return { name, address: null, lat, lng, providerPlaceId: `google:${id}`, category };
}

// ─── Costco: 5 real locations, departments co-located with their warehouse ───
const COSTCO = [
  // Waipahu (94-1231 Ka Uka Blvd)
  cand('Costco Wholesale', 21.4022, -158.0157, 'warehouse_store', 'waipahu'),
  cand('Costco Gas Station', 21.4026, -158.0162, 'gas_station', 'waipahu-gas'),
  cand('Costco Food Court', 21.4022, -158.0156, 'food_court', 'waipahu-food'),
  cand('Costco Tire Service Center', 21.4021, -158.0158, 'tire_shop', 'waipahu-tire'),
  cand('Costco Pharmacy', 21.4023, -158.0157, 'pharmacy', 'waipahu-rx'),
  cand('Costco Optical Department', 21.4022, -158.0158, 'store', 'waipahu-opt'),
  // Kapolei (4589 Kapolei Pkwy)
  cand('Costco Wholesale', 21.3282, -158.0864, 'warehouse_store', 'kapolei'),
  cand('Costco Gas Station', 21.3286, -158.0859, 'gas_station', 'kapolei-gas'),
  cand('Costco Wholesale - Food Court', 21.3282, -158.0863, 'food_court', 'kapolei-food'),
  cand('Costco Bakery', 21.3281, -158.0864, 'bakery', 'kapolei-bakery'),
  cand('Costco Tire Service Center', 21.3283, -158.0865, 'tire_shop', 'kapolei-tire'),
  // Iwilei (525 Alakawa St)
  cand('Costco Wholesale', 21.3204, -157.8722, 'warehouse_store', 'iwilei'),
  cand('Costco Gas Station', 21.3208, -157.8727, 'gas_station', 'iwilei-gas'),
  cand('Costco Food Court', 21.3204, -157.8723, 'food_court', 'iwilei-food'),
  cand('Costco Tire Service Center', 21.3205, -157.8721, 'tire_shop', 'iwilei-tire'),
  cand('Costco Pharmacy', 21.3204, -157.8722, 'pharmacy', 'iwilei-rx'),
  // Hawaii Kai (333A Keahole St)
  cand('Costco Wholesale', 21.2946, -157.7112, 'warehouse_store', 'hawaii-kai'),
  cand('Costco Food Court', 21.2946, -157.7113, 'food_court', 'hawaii-kai-food'),
  // Pearl City (98-600 Kamehameha Hwy) — showroom + logistics share the address
  cand('Costco Wholesale Home Showroom', 21.3970, -157.9737, 'warehouse_store', 'pearl-city'),
  cand('Costco Wholesale Logistics', 21.3971, -157.9738, null, 'pearl-city-logistics'),
];

// ─── Foodland: many branches + the noise rows Text Search mixed in ───────────
const FOODLAND = [
  cand('Foodland', 21.3402, -158.0301, 'grocery_store', 'ewa'),
  cand('Foodland Gas Station', 21.3404, -158.0303, 'gas_station', 'ewa-gas'), // same lot as Ewa
  cand('Foodland Farms', 21.3352, -158.0803, 'grocery_store', 'kapolei-farms'),
  cand('Foodland Kapolei', 21.3335, -158.0888, 'grocery_store', 'kapolei'),
  cand('Foodland Farms Pearl City', 21.3942, -157.9702, 'grocery_store', 'pearl-city'),
  cand('Foodland Farms Ala Moana', 21.2905, -157.8420, 'grocery_store', 'ala-moana'),
  cand('Foodland Pupukea', 21.6432, -158.0632, 'grocery_store', 'pupukea'),
  cand('Foodland Waipio', 21.4176, -158.0083, 'grocery_store', 'waipio'),
  cand('Foodland Dillingham', 21.3252, -157.8735, 'grocery_store', 'dillingham'),
  cand('Foodland Market City', 21.2864, -157.7995, 'grocery_store', 'market-city'),
  cand('Foodland Mililani', 21.4513, -158.0018, 'grocery_store', 'mililani'),
  cand('Foodland Kailua', 21.3921, -157.7396, 'grocery_store', 'kailua'),
  cand('Foodland', 21.4064, -157.7508, 'supermarket', 'kaneohe'),
  cand('Foodland Wahiawa', 21.5028, -158.0236, 'grocery_store', 'wahiawa'),
  cand('Foodland Laie', 21.6465, -157.9252, 'grocery_store', 'laie'),
  cand('Foodland Farms Aina Haina', 21.2782, -157.7527, 'grocery_store', 'aina-haina'),
  // Noise: same query, not the place
  cand('Ewa Town Center', 21.3403, -158.0304, 'shopping_mall', 'noise-ewa'),
  cand('Waikiki Market', 21.2780, -157.8265, 'supermarket', 'noise-waikiki'),
  cand('Kapolei Village Center', 21.3336, -158.0887, 'shopping_mall', 'noise-kapolei'),
  cand('KAHALA MKT. by Foodland', 21.2769, -157.7877, 'grocery_store', 'kahala'),
];

// ─── Melaleuca: the founding case — 2 exact-name rows, 6.9 km apart ─────────
const MELALEUCA = [
  cand('Melaleuca', 21.3366127, -157.9149545, 'store', 'paiea'),
  cand('Melaleuca', 21.3010952, -157.8622959, 'cosmetics_store', 'ala-moana-suite'),
];

describe('arbitrate', () => {
  it('returns none for an empty candidate set — the pending-lookup path', () => {
    const result = arbitrate('Melaleuca', []);
    expect(result.verdict).toBe('none');
    expect(result.locations).toEqual([]);
  });

  it('returns single for one candidate — auto-arm as today', () => {
    const result = arbitrate('Melaleuca', [MELALEUCA[0]]);
    expect(result.verdict).toBe('single');
    expect(result.locations).toHaveLength(1);
  });

  it('Melaleuca: 2 exact-name candidates 6.9 km apart → ambiguous, both preserved', () => {
    const result = arbitrate('Melaleuca', MELALEUCA);
    expect(result.verdict).toBe('ambiguous');
    expect(result.locations).toHaveLength(2);
    expect(result.locations.map((l) => l.providerPlaceId)).toEqual([
      'google:paiea',
      'google:ala-moana-suite',
    ]);
  });

  it('Foodland: filters the noise rows before counting, then reads as a chain', () => {
    const result = arbitrate('Foodland', FOODLAND);
    expect(result.verdict).toBe('chain');

    const names = result.locations.map((l) => l.name);
    expect(names).not.toContain('Ewa Town Center');
    expect(names).not.toContain('Waikiki Market');
    expect(names).not.toContain('Kapolei Village Center');
  });

  it('Foodland: the Ewa gas station folds into the Ewa store, which keeps its name', () => {
    const result = arbitrate('Foodland', FOODLAND);

    const names = result.locations.map((l) => l.name);
    expect(names).not.toContain('Foodland Gas Station');
    // 16 name-matching rows, minus the gas station collapse = 15 locations
    expect(result.locations).toHaveLength(15);
  });

  it('Costco: 20 rows collapse to 5 locations and no department name survives', () => {
    const result = arbitrate('Costco', COSTCO);
    expect(result.verdict).toBe('chain');
    expect(result.locations).toHaveLength(5);

    for (const loc of result.locations) {
      expect(loc.name).not.toMatch(/gas|gasoline|food court|tire|pharmacy|optical|bakery/i);
    }
    // The three warehouses plus Hawaii Kai all survive under the chain's own name
    expect(result.locations.filter((l) => l.name === 'Costco Wholesale')).toHaveLength(4);
  });

  it('a co-located pair (<300 m) collapses to one and reads as single — never asks', () => {
    const store = cand('Melaleuca', 21.3366, -157.9150, 'store', 'front');
    const entrance = cand('Melaleuca', 21.3368, -157.9152, 'store', 'parking'); // ~30 m away
    const result = arbitrate('Melaleuca', [store, entrance]);
    expect(result.verdict).toBe('single');
    expect(result.locations).toHaveLength(1);
  });

  it('prefix matching requires a word boundary — "Long" does not claim "Longs Drugs"', () => {
    const longs = cand('Longs Drugs', 21.30, -157.86, 'drugstore', 'longs');
    const result = arbitrate('Long', [longs]);
    expect(result.verdict).toBe('none');
  });

  it('"Home Depot" claims "The Home Depot" — leading articles carry no identity', () => {
    // Field case 2026-08-13: OSM names every branch "The Home Depot"; the
    // prefix test without article-stripping arbitrated the query to NONE.
    const branches = [
      cand('The Home Depot', 21.4390, -158.0010, 'shop', 'waipio'),
      cand('The Home Depot', 21.3320, -158.0910, 'shop', 'kapolei'),
      cand('The Home Depot', 21.3220, -157.8650, 'shop', 'iwilei'),
    ];
    const result = arbitrate('Home Depot', branches);
    expect(result.verdict).toBe('chain');
    expect(result.locations).toHaveLength(3);
  });

  it('works in the other direction too — "The Home Depot" claims "Home Depot"', () => {
    const result = arbitrate('The Home Depot', [cand('Home Depot', 21.44, -158.0, 'shop', 'x')]);
    expect(result.verdict).toBe('single');
  });

  it('article stripping does not weaken the word-boundary rule', () => {
    // A mid-word prefix must still be rejected after articles are stripped.
    const result = arbitrate('The Hom', [cand('The Home Depot', 21.44, -158.0, 'shop', 'x')]);
    expect(result.verdict).toBe('none');
  });

  it('name matching is case-insensitive', () => {
    const result = arbitrate('melaleuca', MELALEUCA);
    expect(result.verdict).toBe('ambiguous');
  });
});
