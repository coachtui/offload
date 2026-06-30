/**
 * Geofence service - business logic for geofences
 */

import { GeofenceModel } from '../models/Geofence';
import { AtomicObjectModel } from '../models/AtomicObject';
import { PlaceModel } from '../models/Place';
import type { Geofence, GeofenceCreateRequest, GeoPoint, AtomicObject } from '@shared/types';
import { z } from 'zod';
import { queryMany } from '../db/queries';

// Validation schemas
export const createGeofenceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  center: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().optional(),
    altitude: z.number().optional(),
  }),
  radius: z.number().positive('Radius must be positive'),
  type: z.enum(['home', 'work', 'gym', 'store', 'custom']),
  associatedObjects: z.array(z.string().uuid()).optional(),
  notificationSettings: z.object({
    enabled: z.boolean().optional(),
    onEnter: z.boolean().optional(),
    onExit: z.boolean().optional(),
    quietHours: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
  }).optional(),
});

/**
 * Create a new geofence
 */
export async function createGeofence(
  userId: string,
  input: GeofenceCreateRequest
): Promise<Geofence> {
  // Validate input
  createGeofenceSchema.parse(input);

  // 'store' is a mobile-only type; DB constraint allows home/work/gym/custom only
  const dbInput = { ...input, type: (input.type as string) === 'store' ? 'custom' : input.type } as typeof input;
  const geofence = await GeofenceModel.create(userId, dbInput);
  return geofence.toGeofence();
}

/**
 * Get geofence by ID
 */
export async function getGeofenceById(
  userId: string,
  geofenceId: string
): Promise<Geofence> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) {
    throw new Error('Geofence not found');
  }

  if (geofence.userId !== userId) {
    throw new Error('Unauthorized');
  }

  return geofence.toGeofence();
}

/**
 * List geofences for a user
 */
export async function listGeofences(userId: string): Promise<Geofence[]> {
  const geofences = await GeofenceModel.findByUserId(userId);
  return geofences.map((gf) => gf.toGeofence());
}

/**
 * Check location against geofences, returning active geofences and their associated objects
 */
export async function checkLocation(
  userId: string,
  location: GeoPoint
): Promise<{
  activeGeofences: Geofence[];
  relevantObjects: AtomicObject[];
}> {
  const activeGeofences = await GeofenceModel.findByLocation(userId, location);

  // Collect linked object IDs from the join table for all active geofences
  const linkedIdArrays = await Promise.all(
    activeGeofences.map((gf) => GeofenceModel.getLinkedObjectIds(gf.id))
  );
  const objectIds = [...new Set(linkedIdArrays.flat())];

  const [pinned, candidates] = await Promise.all([
    objectIds.length > 0 ? AtomicObjectModel.findByIds(objectIds) : Promise.resolve([]),
    AtomicObjectModel.findGeofenceCandidates(userId),
  ]);

  // Merge: explicitly linked first, then ML-flagged candidates not already included
  const pinnedIds = new Set(pinned.map((o) => o.id));
  const merged = [...pinned, ...candidates.filter((o) => !pinnedIds.has(o.id))];

  return {
    activeGeofences: activeGeofences.map((gf) => gf.toGeofence()),
    relevantObjects: merged.map((o) => o.toAtomicObject()),
  };
}

// Anti-spam window for manual geofences: one ping per visit, genuine later return re-fires (1 hour).
const GEOFENCE_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Called when a manual geofence fires. Checks the re-fire cooldown, updates trigger
 * state, and returns open linked objects. Returns null when in cooldown (suppress).
 */
export async function getGeofenceNotifyPayload(
  userId: string,
  geofenceId: string
): Promise<{ objects: AtomicObject[]; geofenceName: string } | null> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  const now = new Date();

  const state = await GeofenceModel.getTriggerState(userId, geofenceId);
  if (state?.cooldownUntil && state.cooldownUntil > now) {
    console.log(`[geofenceService] Geofence ${geofenceId} in cooldown until ${state.cooldownUntil.toISOString()}`);
    return null;
  }

  const cooldownUntil = new Date(now.getTime() + GEOFENCE_COOLDOWN_MS);
  await GeofenceModel.upsertTriggerState(userId, geofenceId, {
    lastEnteredAt: now,
    lastNotifiedAt: now,
    cooldownUntil,
    incrementVisit: true,
  });

  const objects = await getGeofenceObjects(userId, geofenceId, true);
  return { objects, geofenceName: geofence.name };
}

/**
 * Get atomic objects explicitly linked to a geofence (join table only).
 *
 * Returns only objects the user has deliberately pinned to this geofence.
 * Does NOT mix in ML-flagged candidates — that separation is intentional.
 * If the geofence is disabled, returns an empty list so nothing is surfaced.
 */
export async function getGeofenceObjects(
  userId: string,
  geofenceId: string,
  openOnly = false
): Promise<AtomicObject[]> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  if (!geofence.notificationSettings.enabled) {
    console.log(`[geofenceService] getGeofenceObjects: geofence ${geofenceId} is disabled — returning empty`);
    return [];
  }

  // Inferred geofences link their notes via the backing place (object_place_links),
  // NOT the geofence_objects join table. Resolve through the place so the detail
  // view matches the overview open-count and the on-arrival notification (which
  // both read place links). Without this, an inferred geofence detail shows zero
  // notes even though the overview says it has one.
  if (geofence.createdBy === 'inferred' && geofence.placeId) {
    const placeLinkedIds = await PlaceModel.getLinkedObjectIds(geofence.placeId);
    console.log(`[geofenceService] getGeofenceObjects: inferred geofence ${geofenceId} → ${placeLinkedIds.length} place-linked object(s) via place ${geofence.placeId}`);
    if (placeLinkedIds.length === 0) return [];
    const placeObjects = await AtomicObjectModel.findByIds(placeLinkedIds);
    return placeObjects.map((o) => o.toAtomicObject());
  }

  const linkedIds = openOnly
    ? await GeofenceModel.getOpenLinkedObjectIds(geofenceId)
    : await GeofenceModel.getLinkedObjectIds(geofenceId);
  console.log(`[geofenceService] getGeofenceObjects: geofence ${geofenceId} has ${linkedIds.length} linked object(s)`);

  if (linkedIds.length === 0) return [];

  const objects = await AtomicObjectModel.findByIds(linkedIds);
  // findByIds respects soft-delete (deleted_at IS NULL) and preserves order
  console.log(`[geofenceService] getGeofenceObjects: resolved ${objects.length}/${linkedIds.length} objects (delta = stale/deleted IDs)`);
  return objects.map((o) => o.toAtomicObject());
}

/**
 * Replace the full set of linked objects for a geofence.
 * Validates ownership of both the geofence and all supplied object IDs.
 */
export async function setGeofenceLinkedObjects(
  userId: string,
  geofenceId: string,
  objectIds: string[]
): Promise<void> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  // Validate object ownership — silently drop IDs that don't belong to the user or don't exist
  const validIds = objectIds.length > 0
    ? await filterValidObjectIds(userId, objectIds)
    : [];

  console.log(`[geofenceService] setGeofenceLinkedObjects: geofence ${geofenceId} → ${validIds.length} object(s) (${objectIds.length - validIds.length} invalid/foreign IDs dropped)`);
  await GeofenceModel.setLinkedObjects(geofenceId, validIds);
}

/**
 * Add a single object link to a geofence (idempotent).
 */
export async function addGeofenceLinkedObject(
  userId: string,
  geofenceId: string,
  objectId: string
): Promise<void> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  const object = await AtomicObjectModel.findById(objectId);
  if (!object) throw new Error('Object not found');
  if (object.userId !== userId) throw new Error('Unauthorized');

  console.log(`[geofenceService] addGeofenceLinkedObject: geofence ${geofenceId} ← object ${objectId}`);
  await GeofenceModel.addLinkedObject(geofenceId, objectId);
}

/**
 * Remove a single object link from a geofence. No-op if the link doesn't exist.
 */
export async function removeGeofenceLinkedObject(
  userId: string,
  geofenceId: string,
  objectId: string
): Promise<void> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  console.log(`[geofenceService] removeGeofenceLinkedObject: geofence ${geofenceId} ✕ object ${objectId}`);
  await GeofenceModel.removeLinkedObject(geofenceId, objectId);
}

/**
 * Update geofence
 */
export async function updateGeofence(
  userId: string,
  geofenceId: string,
  updates: Partial<{
    name: string;
    center: GeoPoint;
    radius: number;
    type: 'home' | 'work' | 'gym' | 'custom';
    associatedObjects: string[];
    notificationSettings: Partial<GeofenceModel['notificationSettings']>;
  }>
): Promise<Geofence> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) {
    throw new Error('Geofence not found');
  }

  if (geofence.userId !== userId) {
    throw new Error('Unauthorized');
  }

  const updated = await geofence.update(updates);
  return updated.toGeofence();
}

/**
 * Delete geofence
 */
export async function deleteGeofence(
  userId: string,
  geofenceId: string
): Promise<void> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) {
    throw new Error('Geofence not found');
  }

  if (geofence.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await geofence.delete();
}

/**
 * Filter a list of object IDs to those that exist, are not soft-deleted,
 * and belong to the given user. Used to guard against cross-user linking.
 */
async function filterValidObjectIds(userId: string, objectIds: string[]): Promise<string[]> {
  const objects = await AtomicObjectModel.findByIds(objectIds);
  return objects.filter((o) => o.userId === userId).map((o) => o.id);
}

export interface PlaceOverviewItem {
  kind: 'geofence' | 'place';
  id: string;
  name: string;
  openCount: number;
  labeled: boolean;
  enabled: boolean;
}

/**
 * Merged browse list, in three tiers:
 *  1. Manually-labeled geofences — always shown; open notes via geofence_objects.
 *  2. Inferred geofences (auto-created from a note) that still have >=1 open
 *     note — shown as real, toggleable reminders with their actual enabled
 *     state; open notes come via the linked place's active object_place_links.
 *  3. Detected places that have NO geofence yet (e.g. resolution below the
 *     geofence-confidence threshold) — promotable suggestions, bell off.
 *
 * Inferred geofences appear directly (tier 2) rather than as "detected places",
 * so each of N nearby branches of a chain (e.g. 3 McDonald's) is independently
 * toggleable by its own geofence id. A place is only listed in tier 3 when it
 * has no geofence, so it never double-lists alongside its own geofence.
 */
export async function getPlacesOverview(userId: string): Promise<PlaceOverviewItem[]> {
  const manualGeofences = await queryMany<{ id: string; name: string; open_count: string; notification_enabled: boolean }>(
    `SELECT g.id, g.name, g.notification_enabled,
            COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL) AS open_count
     FROM hub.geofences g
     LEFT JOIN hub.geofence_objects go ON go.geofence_id = g.id
     LEFT JOIN hub.atomic_objects ao ON ao.id = go.object_id
     WHERE g.user_id = $1 AND g.created_by = 'manual'
     GROUP BY g.id, g.name, g.notification_enabled
     ORDER BY open_count DESC, g.created_at DESC`,
    [userId]
  );

  const inferredGeofences = await queryMany<{ id: string; name: string; open_count: string; notification_enabled: boolean }>(
    `SELECT g.id, g.name, g.notification_enabled,
            COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL AND opl.active = true) AS open_count
     FROM hub.geofences g
     JOIN hub.object_place_links opl ON opl.place_id = g.place_id
     JOIN hub.atomic_objects ao ON ao.id = opl.object_id
     WHERE g.user_id = $1 AND g.created_by = 'inferred'
     GROUP BY g.id, g.name, g.notification_enabled
     HAVING COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL AND opl.active = true) >= 1
     ORDER BY open_count DESC, g.created_at DESC`,
    [userId]
  );

  const places = await queryMany<{ id: string; name: string; open_count: string }>(
    `SELECT p.id, p.normalized_name AS name,
            COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL AND opl.active = true) AS open_count
     FROM hub.places p
     JOIN hub.object_place_links opl ON opl.place_id = p.id
     JOIN hub.atomic_objects ao ON ao.id = opl.object_id
     WHERE p.user_id = $1
       AND NOT EXISTS (SELECT 1 FROM hub.geofences g WHERE g.place_id = p.id)
     GROUP BY p.id, p.normalized_name
     HAVING COUNT(ao.id) FILTER (WHERE ao.state IN ('open','active') AND ao.deleted_at IS NULL AND opl.active = true) >= 1
     ORDER BY open_count DESC`,
    [userId]
  );

  return [
    ...manualGeofences.map((g) => ({
      kind: 'geofence' as const, id: g.id, name: g.name,
      openCount: parseInt(g.open_count, 10), labeled: true,
      enabled: g.notification_enabled,
    })),
    ...inferredGeofences.map((g) => ({
      kind: 'geofence' as const, id: g.id, name: g.name,
      openCount: parseInt(g.open_count, 10), labeled: false,
      enabled: g.notification_enabled,
    })),
    ...places.map((p) => ({
      kind: 'place' as const, id: p.id, name: p.name,
      openCount: parseInt(p.open_count, 10), labeled: false,
      enabled: false,
    })),
  ];
}
