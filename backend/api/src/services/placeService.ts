/**
 * Place Service
 *
 * Orchestrates place extraction → resolution → memory → geofence registration.
 * Called fire-and-forget from voice.ts after ML parsing.
 */

import { PlaceModel } from '../models/Place';
import { GeofenceModel } from '../models/Geofence';
import { AtomicObjectModel } from '../models/AtomicObject';
import { resolvePlaceName } from './placeResolutionService';
import type { AtomicObject } from '@shared/types';

// Maximum number of inferred geofences per user (leaves room for manual ones within OS 20-limit)
const MAX_INFERRED_GEOFENCES = 15;

// Minimum confidence to auto-create a geofence
const GEOFENCE_CONFIDENCE_THRESHOLD = 0.6;

// Cooldown duration in milliseconds (2 hours)
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

// ─── Place resolution pipeline ───────────────────────────────────────────────

/**
 * Resolve place names from a parsed atomic object and create place records + geofences.
 * Called asynchronously (fire-and-forget) from voice.ts — must not throw.
 */
export async function resolveObjectPlaces(
  userId: string,
  objectId: string,
  placeNames: string[],
  userLocation?: { latitude: number; longitude: number }
): Promise<void> {
  for (const rawName of placeNames) {
    try {
      await resolveAndLinkPlace(userId, objectId, rawName, userLocation);
    } catch (err) {
      console.warn(`[placeService] Failed to resolve place "${rawName}" for object ${objectId}:`, err);
    }
  }
}

async function resolveAndLinkPlace(
  userId: string,
  objectId: string,
  rawName: string,
  userLocation?: { latitude: number; longitude: number }
): Promise<void> {
  const normalizedQuery = rawName.trim();
  if (!normalizedQuery) return;

  console.log(`[placeService] Resolving place "${normalizedQuery}" for object ${objectId}`);

  // ─── 1. Fuzzy-match existing places by name ────────────────────────────────
  const nameMatches = await PlaceModel.findByUserAndName(userId, normalizedQuery);
  if (nameMatches.length > 0) {
    const existing = nameMatches[0];
    console.log(`[placeService] Found existing place by name: ${existing.id} (${existing.normalizedName})`);
    await PlaceModel.linkObject(existing.id, objectId, 'mentioned_in_note');
    return;
  }

  // ─── 2. Geocode via OSM Nominatim ─────────────────────────────────────────
  const userLatLng = userLocation
    ? { lat: userLocation.latitude, lng: userLocation.longitude }
    : undefined;

  const resolved = await resolvePlaceName(normalizedQuery, userLatLng);

  if (!resolved) {
    console.log(`[placeService] Could not resolve "${normalizedQuery}" — skipping`);
    return;
  }

  // ─── 3. Proximity de-dup (same place within 300m already exists?) ──────────
  const nearby = await PlaceModel.findNearby(userId, resolved.lat, resolved.lng, 300);
  const sameNameNearby = nearby.find(
    p => p.normalizedName.toLowerCase().includes(resolved.normalizedName.toLowerCase()) ||
         resolved.normalizedName.toLowerCase().includes(p.normalizedName.toLowerCase())
  );

  if (sameNameNearby) {
    console.log(`[placeService] Deduped to nearby place: ${sameNameNearby.id} (${sameNameNearby.normalizedName})`);
    await PlaceModel.linkObject(sameNameNearby.id, objectId, 'mentioned_in_note');
    return;
  }

  // ─── 4. Create new place record ────────────────────────────────────────────
  const userConfirmed = resolved.confidence >= GEOFENCE_CONFIDENCE_THRESHOLD;
  const place = await PlaceModel.create({
    userId,
    rawName: resolved.rawName,
    normalizedName: resolved.normalizedName,
    providerPlaceId: resolved.providerPlaceId,
    lat: resolved.lat,
    lng: resolved.lng,
    radiusMeters: resolved.radiusMeters,
    category: resolved.category,
    confidence: resolved.confidence,
    userConfirmed,
    createdBy: 'inferred',
  });

  console.log(`[placeService] Created place ${place.id} "${place.normalizedName}" (confidence: ${place.confidence})`);

  // ─── 5. Link object to place ───────────────────────────────────────────────
  await PlaceModel.linkObject(place.id, objectId, 'mentioned_in_note');

  // ─── 6. Optionally register inferred geofence ─────────────────────────────
  if (userConfirmed) {
    await maybeCreateInferredGeofence(userId, place);
  } else {
    console.log(`[placeService] Confidence too low (${resolved.confidence}) — skipping geofence for "${resolved.normalizedName}"`);
  }
}

async function maybeCreateInferredGeofence(
  userId: string,
  place: { id: string; normalizedName: string; lat: number; lng: number; radiusMeters: number; category: string | null }
): Promise<void> {
  const currentCount = await PlaceModel.countInferredGeofences(userId);
  if (currentCount >= MAX_INFERRED_GEOFENCES) {
    console.log(`[placeService] Inferred geofence limit reached (${currentCount}/${MAX_INFERRED_GEOFENCES}) — place stored but not monitored: ${place.normalizedName}`);
    return;
  }

  try {
    const geofence = await GeofenceModel.create(userId, {
      name: place.normalizedName,
      center: { latitude: place.lat, longitude: place.lng },
      radius: place.radiusMeters,
      type: 'custom',
      associatedObjects: [],
      notificationSettings: {
        enabled: true,
        onEnter: true,
        onExit: false,
      },
      placeId: place.id,
      createdBy: 'inferred',
    });

    console.log(`[placeService] Created inferred geofence ${geofence.id} for place "${place.normalizedName}"`);
  } catch (err) {
    console.warn(`[placeService] Failed to create inferred geofence for "${place.normalizedName}":`, err);
  }
}

// ─── Place objects ────────────────────────────────────────────────────────────

/**
 * Get active linked objects for a place (for PlaceSummaryScreen and notify endpoint).
 * Filters out: inactive links, snoozed items, deleted objects.
 * If sinceEnteredAt provided, also filters dismissed-this-visit items.
 */
export async function getPlaceObjects(
  userId: string,
  placeId: string,
  sinceEnteredAt?: Date | null
): Promise<AtomicObject[]> {
  const place = await PlaceModel.findById(placeId);
  if (!place || place.userId !== userId) return [];

  const objectIds = await PlaceModel.getLinkedObjectIds(placeId, sinceEnteredAt);
  if (objectIds.length === 0) return [];

  const models = await AtomicObjectModel.findByIds(objectIds);
  return models.map(m => m.toAtomicObject());
}

// ─── Notify endpoint ─────────────────────────────────────────────────────────

/**
 * Called when a place-linked geofence fires.
 * Checks cooldown, updates trigger state, returns active objects.
 * Returns null if currently in cooldown (notification should be suppressed).
 */
export async function getPlaceNotifyPayload(
  userId: string,
  placeId: string
): Promise<{ objects: AtomicObject[]; placeName: string } | null> {
  const place = await PlaceModel.findById(placeId);
  if (!place || place.userId !== userId) return null;

  const now = new Date();

  // Check cooldown
  const state = await PlaceModel.getTriggerState(userId, placeId);
  if (state?.cooldownUntil && state.cooldownUntil > now) {
    console.log(`[placeService] Place ${placeId} in cooldown until ${state.cooldownUntil.toISOString()}`);
    return null;
  }

  // Mark enter + set cooldown + increment visit
  const lastEnteredAt = now;
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS);
  await PlaceModel.upsertTriggerState(userId, placeId, {
    lastEnteredAt,
    lastNotifiedAt: now,
    cooldownUntil,
    incrementVisit: true,
  });

  // Get objects, excluding items dismissed in this visit (sinceEnteredAt = lastEnteredAt)
  const objects = await getPlaceObjects(userId, placeId, lastEnteredAt);

  return { objects, placeName: place.normalizedName };
}

// ─── Object actions ───────────────────────────────────────────────────────────

export async function markPlaceObjectDone(
  userId: string,
  placeId: string,
  objectId: string
): Promise<void> {
  await verifyPlaceOwnership(userId, placeId);
  await PlaceModel.setLinkInactive(placeId, objectId);
}

export async function dismissPlaceObject(
  userId: string,
  placeId: string,
  objectId: string
): Promise<void> {
  await verifyPlaceOwnership(userId, placeId);
  await PlaceModel.dismissLink(placeId, objectId);
}

export async function snoozePlaceObject(
  userId: string,
  placeId: string,
  objectId: string,
  until: Date
): Promise<void> {
  await verifyPlaceOwnership(userId, placeId);
  await PlaceModel.snoozeLink(placeId, objectId, until);
}

export async function unlinkPlaceObject(
  userId: string,
  placeId: string,
  objectId: string
): Promise<void> {
  await verifyPlaceOwnership(userId, placeId);
  await PlaceModel.removeLink(placeId, objectId);
}

async function verifyPlaceOwnership(userId: string, placeId: string): Promise<void> {
  const place = await PlaceModel.findById(placeId);
  if (!place) throw Object.assign(new Error('Place not found'), { status: 404 });
  if (place.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
}
