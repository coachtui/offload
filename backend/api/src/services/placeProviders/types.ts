/**
 * Place provider contract.
 *
 * A provider turns a spoken name ("Melaleuca", "Foodland") into geographic
 * candidates. It does no scoring, no dedupe and no arbitration — those are
 * shared across providers and live upstream, so that adding a provider cannot
 * quietly change how candidates are judged.
 */

export interface ProviderCandidate {
  /** Display name as the provider knows it — "Costco Wholesale", not "Costco". */
  name: string;
  /** Formatted address, when the provider supplied one. Shown only when asking the user. */
  address: string | null;
  lat: number;
  lng: number;
  /** Namespaced so a candidate's origin survives into the places table: 'osm:123' | 'google:ChIJ…'. */
  providerPlaceId: string;
  /** Provider's own type label — OSM `type`/`class`, Google `primaryType`. */
  category: string | null;
  /**
   * The provider's own ranking signal, 0–1, where higher means more prominent.
   * OSM supplies `importance`. Providers without an equivalent leave this
   * undefined, and scoring falls back to its neutral default — so this must
   * never become the only thing a confidence calculation depends on.
   */
  relevance?: number;
}

export interface PlaceProviderSearchOptions {
  /**
   * Request a formatted address. Off by default because on Google this moves
   * the request into a costlier SKU, and the address is only ever displayed
   * when we are about to ask the user to choose. OSM returns one regardless.
   */
  withAddress?: boolean;
}

export interface PlaceProvider {
  readonly name: 'osm' | 'google';
  /**
   * Never throws and never rejects: a provider outage must degrade to "no
   * candidates" rather than fail the note save that triggered it.
   */
  search(
    query: string,
    near?: { lat: number; lng: number },
    opts?: PlaceProviderSearchOptions
  ): Promise<ProviderCandidate[]>;
}
