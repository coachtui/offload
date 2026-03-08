/**
 * Place model — hub.places, hub.object_place_links, hub.place_trigger_state
 */

import { query, queryOne, queryMany } from '../db/queries';

export interface PlaceRow {
  id: string;
  user_id: string;
  raw_name: string;
  normalized_name: string;
  provider_place_id: string | null;
  lat: number;
  lng: number;
  radius_meters: number;
  category: string | null;
  confidence: number;
  user_confirmed: boolean;
  created_by: 'manual' | 'inferred';
  created_at: Date;
}

export interface ObjectPlaceLinkRow {
  id: string;
  object_id: string;
  place_id: string;
  relevance_score: number;
  link_reason: string;
  active: boolean;
  dismissed_at: Date | null;
  snoozed_until: Date | null;
  created_at: Date;
}

export interface PlaceTriggerStateRow {
  id: string;
  user_id: string;
  place_id: string;
  last_entered_at: Date | null;
  last_notified_at: Date | null;
  cooldown_until: Date | null;
  visit_count: number;
}

export interface Place {
  id: string;
  userId: string;
  rawName: string;
  normalizedName: string;
  providerPlaceId: string | null;
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string | null;
  confidence: number;
  userConfirmed: boolean;
  createdBy: 'manual' | 'inferred';
  createdAt: Date;
}

export interface PlaceCreateInput {
  userId: string;
  rawName: string;
  normalizedName: string;
  providerPlaceId?: string | null;
  lat: number;
  lng: number;
  radiusMeters?: number;
  category?: string | null;
  confidence?: number;
  userConfirmed?: boolean;
  createdBy?: 'manual' | 'inferred';
}

export interface PlaceTriggerState {
  id: string;
  userId: string;
  placeId: string;
  lastEnteredAt: Date | null;
  lastNotifiedAt: Date | null;
  cooldownUntil: Date | null;
  visitCount: number;
}

function rowToPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    userId: row.user_id,
    rawName: row.raw_name,
    normalizedName: row.normalized_name,
    providerPlaceId: row.provider_place_id,
    lat: parseFloat(row.lat.toString()),
    lng: parseFloat(row.lng.toString()),
    radiusMeters: row.radius_meters,
    category: row.category,
    confidence: parseFloat(row.confidence.toString()),
    userConfirmed: row.user_confirmed,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function rowToTriggerState(row: PlaceTriggerStateRow): PlaceTriggerState {
  return {
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    lastEnteredAt: row.last_entered_at,
    lastNotifiedAt: row.last_notified_at,
    cooldownUntil: row.cooldown_until,
    visitCount: row.visit_count,
  };
}

// ─── Haversine helper (mirrors GeofenceModel.calculateDistance) ───────────────
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Place CRUD ───────────────────────────────────────────────────────────────

export class PlaceModel {
  /**
   * Find places by user with a fuzzy name match (case-insensitive ILIKE)
   */
  static async findByUserAndName(userId: string, name: string): Promise<Place[]> {
    const rows = await queryMany<PlaceRow>(
      `SELECT * FROM hub.places
       WHERE user_id = $1 AND lower(normalized_name) LIKE lower($2)
       ORDER BY created_at DESC`,
      [userId, `%${name.replace(/[%_]/g, '\\$&')}%`]
    );
    return rows.map(rowToPlace);
  }

  /**
   * Find places within radiusMeters of a lat/lng for proximity de-dup.
   * Uses bounding-box pre-filter then Haversine in JS (no PostGIS required).
   */
  static async findNearby(
    userId: string,
    lat: number,
    lng: number,
    radiusMeters: number
  ): Promise<Place[]> {
    const degLat = radiusMeters / 111000;
    const degLng = radiusMeters / (111000 * Math.cos((lat * Math.PI) / 180));
    const rows = await queryMany<PlaceRow>(
      `SELECT * FROM hub.places
       WHERE user_id = $1
         AND lat BETWEEN $2 - $3 AND $2 + $3
         AND lng BETWEEN $4 - $5 AND $4 + $5`,
      [userId, lat, degLat, lng, degLng]
    );
    return rows
      .map(rowToPlace)
      .filter(p => haversineMeters(lat, lng, p.lat, p.lng) <= radiusMeters);
  }

  /**
   * Find place by ID
   */
  static async findById(id: string): Promise<Place | null> {
    const row = await queryOne<PlaceRow>('SELECT * FROM hub.places WHERE id = $1', [id]);
    return row ? rowToPlace(row) : null;
  }

  /**
   * Create a new place
   */
  static async create(input: PlaceCreateInput): Promise<Place> {
    const row = await queryOne<PlaceRow>(
      `INSERT INTO hub.places (
        user_id, raw_name, normalized_name, provider_place_id,
        lat, lng, radius_meters, category, confidence,
        user_confirmed, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        input.userId,
        input.rawName,
        input.normalizedName,
        input.providerPlaceId ?? null,
        input.lat,
        input.lng,
        input.radiusMeters ?? 150,
        input.category ?? null,
        input.confidence ?? 0.5,
        input.userConfirmed ?? false,
        input.createdBy ?? 'inferred',
      ]
    );
    if (!row) throw new Error('Failed to create place');
    return rowToPlace(row);
  }

  /**
   * List all places for a user
   */
  static async findByUserId(userId: string): Promise<Place[]> {
    const rows = await queryMany<PlaceRow>(
      'SELECT * FROM hub.places WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(rowToPlace);
  }

  // ─── Object ↔ Place linking ───────────────────────────────────────────────

  /**
   * Link an object to a place (idempotent — duplicate links ignored)
   */
  static async linkObject(
    placeId: string,
    objectId: string,
    reason: string = 'mentioned_in_note'
  ): Promise<void> {
    await query(
      `INSERT INTO hub.object_place_links (object_id, place_id, link_reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (object_id, place_id) DO NOTHING`,
      [objectId, placeId, reason]
    );
  }

  /**
   * Get active linked objects for a place, optionally filtering out dismissed-this-visit items.
   * sinceEnteredAt: if provided, objects dismissed after this timestamp are excluded.
   */
  static async getLinkedObjectIds(
    placeId: string,
    sinceEnteredAt?: Date | null
  ): Promise<string[]> {
    const rows = await queryMany<{ object_id: string }>(
      `SELECT opl.object_id
       FROM hub.object_place_links opl
       JOIN hub.atomic_objects ao ON ao.id = opl.object_id
       WHERE opl.place_id = $1
         AND opl.active = true
         AND ao.deleted_at IS NULL
         AND (opl.snoozed_until IS NULL OR opl.snoozed_until < NOW())
         AND ($2::timestamptz IS NULL OR opl.dismissed_at IS NULL OR opl.dismissed_at < $2)
       ORDER BY opl.created_at ASC`,
      [placeId, sinceEnteredAt ?? null]
    );
    return rows.map(r => r.object_id);
  }

  /**
   * Set a link as inactive (Done action)
   */
  static async setLinkInactive(placeId: string, objectId: string): Promise<void> {
    await query(
      `UPDATE hub.object_place_links SET active = false
       WHERE place_id = $1 AND object_id = $2`,
      [placeId, objectId]
    );
  }

  /**
   * Set dismissed_at to NOW() (Dismiss for current visit)
   */
  static async dismissLink(placeId: string, objectId: string): Promise<void> {
    await query(
      `UPDATE hub.object_place_links SET dismissed_at = NOW()
       WHERE place_id = $1 AND object_id = $2`,
      [placeId, objectId]
    );
  }

  /**
   * Set snoozed_until timestamp
   */
  static async snoozeLink(placeId: string, objectId: string, until: Date): Promise<void> {
    await query(
      `UPDATE hub.object_place_links SET snoozed_until = $3
       WHERE place_id = $1 AND object_id = $2`,
      [placeId, objectId, until]
    );
  }

  /**
   * Remove a link entirely (Unlink action)
   */
  static async removeLink(placeId: string, objectId: string): Promise<void> {
    await query(
      `DELETE FROM hub.object_place_links WHERE place_id = $1 AND object_id = $2`,
      [placeId, objectId]
    );
  }

  // ─── Trigger state ────────────────────────────────────────────────────────

  /**
   * Get trigger state for user + place
   */
  static async getTriggerState(
    userId: string,
    placeId: string
  ): Promise<PlaceTriggerState | null> {
    const row = await queryOne<PlaceTriggerStateRow>(
      `SELECT * FROM hub.place_trigger_state WHERE user_id = $1 AND place_id = $2`,
      [userId, placeId]
    );
    return row ? rowToTriggerState(row) : null;
  }

  /**
   * Upsert trigger state — inserts on first visit, updates on subsequent ones.
   */
  static async upsertTriggerState(
    userId: string,
    placeId: string,
    updates: {
      lastEnteredAt?: Date;
      lastNotifiedAt?: Date;
      cooldownUntil?: Date;
      incrementVisit?: boolean;
    }
  ): Promise<PlaceTriggerState> {
    const row = await queryOne<PlaceTriggerStateRow>(
      `INSERT INTO hub.place_trigger_state
         (user_id, place_id, last_entered_at, last_notified_at, cooldown_until, visit_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, place_id) DO UPDATE SET
         last_entered_at  = COALESCE($3, place_trigger_state.last_entered_at),
         last_notified_at = COALESCE($4, place_trigger_state.last_notified_at),
         cooldown_until   = COALESCE($5, place_trigger_state.cooldown_until),
         visit_count      = CASE WHEN $7 THEN place_trigger_state.visit_count + 1
                                 ELSE place_trigger_state.visit_count END
       RETURNING *`,
      [
        userId,
        placeId,
        updates.lastEnteredAt ?? null,
        updates.lastNotifiedAt ?? null,
        updates.cooldownUntil ?? null,
        updates.incrementVisit ? 1 : 0,
        updates.incrementVisit ?? false,
      ]
    );
    if (!row) throw new Error('Failed to upsert trigger state');
    return rowToTriggerState(row);
  }

  // ─── Geofence count ───────────────────────────────────────────────────────

  /**
   * Count inferred geofences for a user (used for OS limit enforcement)
   */
  static async countInferredGeofences(userId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
      `SELECT count(*) AS count FROM hub.geofences
       WHERE user_id = $1 AND created_by = 'inferred'`,
      [userId]
    );
    return parseInt(row?.count ?? '0', 10);
  }
}
