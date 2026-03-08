/**
 * Geofence service - business logic for geofences
 */

import { GeofenceModel } from '../models/Geofence';
import { AtomicObjectModel } from '../models/AtomicObject';
import type { Geofence, GeofenceCreateRequest, GeoPoint, AtomicObject } from '@shared/types';
import { z } from 'zod';

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
  const dbInput = { ...input, type: input.type === 'store' ? 'custom' : input.type } as typeof input;
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

/**
 * Get atomic objects explicitly linked to a geofence (join table only).
 *
 * Returns only objects the user has deliberately pinned to this geofence.
 * Does NOT mix in ML-flagged candidates — that separation is intentional.
 * If the geofence is disabled, returns an empty list so nothing is surfaced.
 */
export async function getGeofenceObjects(
  userId: string,
  geofenceId: string
): Promise<AtomicObject[]> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) throw new Error('Geofence not found');
  if (geofence.userId !== userId) throw new Error('Unauthorized');

  if (!geofence.notificationSettings.enabled) {
    console.log(`[geofenceService] getGeofenceObjects: geofence ${geofenceId} is disabled — returning empty`);
    return [];
  }

  const linkedIds = await GeofenceModel.getLinkedObjectIds(geofenceId);
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
