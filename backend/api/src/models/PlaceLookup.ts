/**
 * PlaceLookup model — hub.place_lookups, hub.place_provider_cache
 *
 * A place_lookup row is what happened when a spoken place name could not be
 * silently resolved. The same table serves three roles:
 *   - the "needs your help" queue the UI renders (status = 'pending')
 *   - the retry ledger a later provider or backfill re-runs
 *   - the per-user ignore list (status = 'dismissed' rows), so a word the
 *     user said "not a place" to stops re-queueing on every future note
 */

import { query, queryOne, queryMany } from '../db/queries';
import type { ProviderCandidate } from '../services/placeProviders/types';

export interface PlaceLookupRow {
  id: string;
  user_id: string;
  object_id: string;
  query: string;
  status: 'pending' | 'resolved' | 'dismissed';
  candidates: ProviderCandidate[];
  provider: string | null;
  recorded_lat: string | number | null;
  recorded_lng: string | number | null;
  resolved_place_id: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface PlaceLookup {
  id: string;
  userId: string;
  objectId: string;
  query: string;
  status: 'pending' | 'resolved' | 'dismissed';
  candidates: ProviderCandidate[];
  provider: string | null;
  recordedLat: number | null;
  recordedLng: number | null;
  resolvedPlaceId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

function rowToLookup(row: PlaceLookupRow): PlaceLookup {
  return {
    id: row.id,
    userId: row.user_id,
    objectId: row.object_id,
    query: row.query,
    status: row.status,
    candidates: row.candidates ?? [],
    provider: row.provider,
    recordedLat: row.recorded_lat === null ? null : parseFloat(row.recorded_lat.toString()),
    recordedLng: row.recorded_lng === null ? null : parseFloat(row.recorded_lng.toString()),
    resolvedPlaceId: row.resolved_place_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export class PlaceLookupModel {
  /**
   * Upsert on (object, lower(query)): re-processing a transcript re-runs
   * place resolution, and the second pass must refresh the candidates rather
   * than duplicate the question — and must NOT resurrect a row the user has
   * already resolved or dismissed (the WHERE guard on the update).
   */
  static async create(input: {
    userId: string;
    objectId: string;
    query: string;
    candidates: ProviderCandidate[];
    provider: string | null;
    recorded?: { lat: number; lng: number };
  }): Promise<PlaceLookup> {
    const row = await queryOne<PlaceLookupRow>(
      `INSERT INTO hub.place_lookups
         (user_id, object_id, query, candidates, provider, recorded_lat, recorded_lng)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       ON CONFLICT (object_id, lower(query)) DO UPDATE
         SET candidates = EXCLUDED.candidates,
             provider = EXCLUDED.provider,
             recorded_lat = COALESCE(EXCLUDED.recorded_lat, hub.place_lookups.recorded_lat),
             recorded_lng = COALESCE(EXCLUDED.recorded_lng, hub.place_lookups.recorded_lng)
         WHERE hub.place_lookups.status = 'pending'
       RETURNING *`,
      [
        input.userId,
        input.objectId,
        input.query,
        JSON.stringify(input.candidates),
        input.provider,
        input.recorded?.lat ?? null,
        input.recorded?.lng ?? null,
      ]
    );
    // A conflict against a resolved/dismissed row returns nothing — fetch it,
    // callers still get the row's actual state.
    if (row) return rowToLookup(row);
    const existing = await queryOne<PlaceLookupRow>(
      `SELECT * FROM hub.place_lookups WHERE object_id = $1 AND lower(query) = lower($2)`,
      [input.objectId, input.query]
    );
    if (!existing) throw new Error('place_lookups upsert returned no row and none exists');
    return rowToLookup(existing);
  }

  static async findById(id: string): Promise<PlaceLookup | null> {
    const row = await queryOne<PlaceLookupRow>(
      'SELECT * FROM hub.place_lookups WHERE id = $1',
      [id]
    );
    return row ? rowToLookup(row) : null;
  }

  static async findPendingByUser(userId: string): Promise<PlaceLookup[]> {
    const rows = await queryMany<PlaceLookupRow>(
      `SELECT * FROM hub.place_lookups
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(rowToLookup);
  }

  static async findByObject(objectId: string): Promise<PlaceLookup[]> {
    const rows = await queryMany<PlaceLookupRow>(
      'SELECT * FROM hub.place_lookups WHERE object_id = $1 ORDER BY created_at DESC',
      [objectId]
    );
    return rows.map(rowToLookup);
  }

  /** Pending rows eligible for a re-run (new provider, backfill, taught name). */
  static async findRetryable(userId: string): Promise<PlaceLookup[]> {
    const rows = await queryMany<PlaceLookupRow>(
      `SELECT * FROM hub.place_lookups
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [userId]
    );
    return rows.map(rowToLookup);
  }

  /**
   * Only a pending row can resolve — never resurrect a dismissed one.
   * placeId is null when the user pointed at an existing geofence instead of
   * creating a place.
   */
  static async markResolved(id: string, placeId: string | null): Promise<PlaceLookup | null> {
    const row = await queryOne<PlaceLookupRow>(
      `UPDATE hub.place_lookups
       SET status = 'resolved', resolved_place_id = $2, resolved_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, placeId]
    );
    return row ? rowToLookup(row) : null;
  }

  static async markDismissed(id: string): Promise<PlaceLookup | null> {
    const row = await queryOne<PlaceLookupRow>(
      `UPDATE hub.place_lookups
       SET status = 'dismissed'
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );
    return row ? rowToLookup(row) : null;
  }

  /**
   * Has the user told us this word is not a place? Dismissed rows ARE the
   * ignore list — no separate table to drift out of sync.
   */
  static async isQueryIgnored(userId: string, queryText: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM hub.place_lookups
         WHERE user_id = $1 AND lower(query) = $2 AND status = 'dismissed'
       ) AS exists`,
      [userId, queryText.toLowerCase()]
    );
    return row?.exists ?? false;
  }
}

// ─── Provider response cache ─────────────────────────────────────────────────

/** ~0.1° ≈ 11 km — one cell covers a metro, so "Melaleuca" hits one row island-wide. */
function cellOf(value: number): number {
  return Math.round(value * 10) / 10;
}

export class PlaceProviderCacheModel {
  /** Fresh (≤30 days) cached candidates, or null. TTL lives in the SQL. */
  static async get(
    queryText: string,
    lat: number,
    lng: number,
    provider: string
  ): Promise<ProviderCandidate[] | null> {
    const row = await queryOne<{ candidates: ProviderCandidate[] }>(
      `SELECT candidates FROM hub.place_provider_cache
       WHERE query_key = $1 AND cell_lat = $2 AND cell_lng = $3 AND provider = $4
         AND created_at > NOW() - INTERVAL '30 days'`,
      [queryText.toLowerCase(), cellOf(lat), cellOf(lng), provider]
    );
    return row ? row.candidates : null;
  }

  static async put(
    queryText: string,
    lat: number,
    lng: number,
    provider: string,
    candidates: ProviderCandidate[]
  ): Promise<void> {
    await query(
      `INSERT INTO hub.place_provider_cache (query_key, cell_lat, cell_lng, provider, candidates)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (query_key, cell_lat, cell_lng, provider) DO UPDATE
         SET candidates = EXCLUDED.candidates, created_at = NOW()`,
      [queryText.toLowerCase(), cellOf(lat), cellOf(lng), provider, JSON.stringify(candidates)]
    );
  }
}
