/**
 * Place Service
 *
 * Orchestrates place extraction → resolution → memory → geofence registration.
 * Called fire-and-forget from voice.ts after ML parsing.
 */

import { PlaceModel } from '../models/Place';
import { GeofenceModel } from '../models/Geofence';
import { AtomicObjectModel } from '../models/AtomicObject';
import { resolvePlaceNameMulti } from './placeResolutionService';
import { matchPlaceName } from './placeNameMatch';
import type { AtomicObject } from '@shared/types';

// Maximum number of inferred geofences per user (leaves room for manual ones within OS 20-limit)
const MAX_INFERRED_GEOFENCES = 15;

// Minimum confidence to auto-create a geofence.
// Lowered from 0.6 → 0.45: Nominatim returns reliable matches for named stores (Costco,
// Longs, etc.) but their OSM importance scores are low (~0.3–0.4), yielding confidence
// ~0.38–0.50 even with the category boost. 0.45 passes these known-good commercial matches
// while still filtering out vague/ambiguous place names.
const GEOFENCE_CONFIDENCE_THRESHOLD = 0.45;

// Fixed radius for all inferred geofences (metres). 150m (not 100m) because iOS
// region monitoring is coarse — a 100m radius is often missed, especially when
// arriving by car. 150m trades a little precision for reliable entry detection.
const INFERRED_RADIUS_METERS = 150;

// Anti-spam window: one ping per visit, but a genuine later return re-fires (1 hour)
const COOLDOWN_MS = 60 * 60 * 1000;

// ─── Place resolution pipeline ───────────────────────────────────────────────

// ─── Lifecycle logging ────────────────────────────────────────────────────────

export type ReminderLifecycleEvent =
  | 'REMINDER_CANDIDATE_DETECTED'
  | 'PLACE_RESOLVED'
  | 'PLACE_DEDUPED'
  | 'PLACE_UNRESOLVABLE'
  | 'GEOFENCE_CREATED'
  | 'GEOFENCE_REARMED'
  | 'GEOFENCE_REAPED'
  | 'GEOFENCE_SKIPPED_LOW_CONFIDENCE'
  | 'GEOFENCE_LIMIT_REACHED';

function logLifecycle(
  event: ReminderLifecycleEvent,
  details: Record<string, unknown>
): void {
  console.log(`[ReminderLifecycle] ${event}`, JSON.stringify(details));
}

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
  logLifecycle('REMINDER_CANDIDATE_DETECTED', { objectId, placeNames, hasUserLocation: !!userLocation });
  console.log(`[placeService] resolveObjectPlaces: ${placeNames.length} place(s) for object ${objectId}${userLocation ? ` (user at ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)})` : ' (no user location)'}`);
  for (const rawName of placeNames) {
    try {
      await resolveAndLinkPlace(userId, objectId, rawName, userLocation);
    } catch (err) {
      console.warn(`[placeService] Failed to resolve place "${rawName}" for object ${objectId}:`, err);
    }
  }
  console.log(`[placeService] resolveObjectPlaces: complete for object ${objectId} — client must re-sync geofences`);
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

  // ─── 1. Match a manually-labeled geofence ──────────────────────────────────
  // The user's own labels are authoritative and are checked FIRST — before both
  // inferred places and the geocoder — so a note about a place they named can
  // never be hijacked by an OSM result (which is how a Costco note ended up on
  // an auto-created "Costco Gasoline" geofence 25km away).
  //
  // Only MANUAL geofences are eligible here. Inferred geofences surface their
  // notes through the backing place's object_place_links, not geofence_objects
  // (see getGeofenceObjects) — linking one here would write a row the detail
  // view never reads, silently dropping the note again.
  const userGeofences = await GeofenceModel.findByUserId(userId);
  const manualGeofences = userGeofences.filter(g => g.createdBy === 'manual');
  const geofenceMatch = matchPlaceName(normalizedQuery, manualGeofences, g => g.name);
  if (geofenceMatch) {
    const geofence = geofenceMatch.candidate;
    console.log(`[placeService] Matched labeled geofence "${geofence.name}" (${geofence.id}) via ${geofenceMatch.reason} — linking object ${objectId}`);
    logLifecycle('PLACE_DEDUPED', { objectId, placeId: geofence.id, name: geofence.name, reason: `manual_geofence_${geofenceMatch.reason}` });
    await GeofenceModel.addLinkedObject(geofence.id, objectId);
    return; // labeled place is authoritative — do not geocode or create an inferred place
  }

  // ─── 1b. Match an existing inferred place by name ──────────────────────────
  // Same matcher, so "costco gasoline station" dedupes onto the existing
  // "Costco Gasoline" place instead of geocoding a near-duplicate.
  const userPlaces = await PlaceModel.findByUserId(userId);
  const placeMatch = matchPlaceName(normalizedQuery, userPlaces, p => p.normalizedName);
  if (placeMatch) {
    const existing = placeMatch.candidate;
    console.log(`[placeService] Found existing place by name: ${existing.id} (${existing.normalizedName}) via ${placeMatch.reason}`);
    logLifecycle('PLACE_DEDUPED', { objectId, placeId: existing.id, name: existing.normalizedName, reason: `name_${placeMatch.reason}` });
    await PlaceModel.linkObject(existing.id, objectId, 'mentioned_in_note');
    await rearmInferredGeofence(userId, existing);
    return;
  }

  // ─── 2. Geocode via OSM Nominatim (up to 3 candidates) ───────────────────
  const userLatLng = userLocation
    ? { lat: userLocation.latitude, lng: userLocation.longitude }
    : undefined;

  const resolvedList = await resolvePlaceNameMulti(normalizedQuery, userLatLng);

  if (resolvedList.length === 0) {
    console.log(`[placeService] Could not resolve "${normalizedQuery}" — skipping`);
    logLifecycle('PLACE_UNRESOLVABLE', { objectId, query: normalizedQuery, reason: 'nominatim_no_results' });
    return;
  }

  for (const resolved of resolvedList) {
    // ─── 3. Proximity de-dup (same place within 300m already exists?) ────────
    const nearby = await PlaceModel.findNearby(userId, resolved.lat, resolved.lng, 300);
    const sameNameNearby = nearby.find(
      p => p.normalizedName.toLowerCase().includes(resolved.normalizedName.toLowerCase()) ||
           resolved.normalizedName.toLowerCase().includes(p.normalizedName.toLowerCase())
    );

    if (sameNameNearby) {
      console.log(`[placeService] Deduped to nearby place: ${sameNameNearby.id} (${sameNameNearby.normalizedName})`);
      logLifecycle('PLACE_DEDUPED', { objectId, placeId: sameNameNearby.id, name: sameNameNearby.normalizedName, reason: 'proximity' });
      await PlaceModel.linkObject(sameNameNearby.id, objectId, 'mentioned_in_note');
      await rearmInferredGeofence(userId, sameNameNearby);
      continue;
    }

    // ─── 4. Create new place record ──────────────────────────────────────────
    const userConfirmed = resolved.confidence >= GEOFENCE_CONFIDENCE_THRESHOLD;
    const place = await PlaceModel.create({
      userId,
      rawName: resolved.rawName,
      normalizedName: resolved.normalizedName,
      providerPlaceId: resolved.providerPlaceId,
      lat: resolved.lat,
      lng: resolved.lng,
      radiusMeters: INFERRED_RADIUS_METERS,
      category: resolved.category,
      confidence: resolved.confidence,
      userConfirmed,
      createdBy: 'inferred',
    });

    logLifecycle('PLACE_RESOLVED', {
      objectId,
      placeId: place.id,
      name: place.normalizedName,
      lat: place.lat,
      lng: place.lng,
      confidence: place.confidence,
      threshold: GEOFENCE_CONFIDENCE_THRESHOLD,
      willCreateGeofence: userConfirmed,
    });
    console.log(`[placeService] Created place ${place.id} "${place.normalizedName}" (confidence: ${place.confidence}, threshold: ${GEOFENCE_CONFIDENCE_THRESHOLD})`);

    // ─── 5. Link object to place ─────────────────────────────────────────────
    await PlaceModel.linkObject(place.id, objectId, 'mentioned_in_note');

    // ─── 6. Optionally register inferred geofence ────────────────────────────
    if (userConfirmed) {
      await maybeCreateInferredGeofence(userId, place);
    } else {
      logLifecycle('GEOFENCE_SKIPPED_LOW_CONFIDENCE', {
        objectId,
        placeId: place.id,
        name: resolved.normalizedName,
        confidence: resolved.confidence,
        threshold: GEOFENCE_CONFIDENCE_THRESHOLD,
      });
      console.log(`[placeService] Confidence ${resolved.confidence} < ${GEOFENCE_CONFIDENCE_THRESHOLD} — skipping geofence for "${resolved.normalizedName}"`);
    }
  }
}

/**
 * Give a pre-existing place its geofence back when a new note lands on it.
 *
 * Places outlive their geofences in two ways: the reaper removes the region
 * once the last note closes, and a place that geocoded below the confidence
 * threshold never got one. Both leave a place that dedupe paths happily link
 * new notes to — and those notes would never ping, because nothing downstream
 * of the dedupe branches creates a region. Re-arming here is what makes the
 * reap safe to run at all.
 *
 * A place the user has since promoted to a manual geofence is left alone by
 * maybeCreateInferredGeofence's manual-shadow check, and a place still holding
 * a region short-circuits below, so this is a no-op in the common case.
 *
 * Never throws: re-arming is opportunistic housekeeping riding on the dedupe
 * branches of the multi-candidate geocode loop, and a failure here must not
 * abort the remaining candidates (the note's link is already written by the
 * time this runs — the loop finishing is what gets the OTHER branches linked).
 */
async function rearmInferredGeofence(
  userId: string,
  place: { id: string; normalizedName: string; lat: number; lng: number; radiusMeters: number; category: string | null; confidence?: number }
): Promise<void> {
  try {
    const existingRegions = await GeofenceModel.findByPlaceId(userId, place.id);
    if (existingRegions.length > 0) return;

    // Same bar as first-time creation — a place we were never confident enough
    // to monitor doesn't become monitorable just by being mentioned again.
    if (typeof place.confidence === 'number' && place.confidence < GEOFENCE_CONFIDENCE_THRESHOLD) {
      console.log(`[placeService] Place ${place.id} "${place.normalizedName}" below confidence threshold (${place.confidence}) — not re-arming`);
      return;
    }

    logLifecycle('GEOFENCE_REARMED', { placeId: place.id, name: place.normalizedName });
    console.log(`[placeService] Re-arming geofence for existing place ${place.id} "${place.normalizedName}"`);
    await maybeCreateInferredGeofence(userId, place);
  } catch (err) {
    console.warn(`[placeService] Failed to re-arm geofence for place ${place.id}:`, err);
  }
}

/**
 * Sweep for places that have open notes but no geofence, and give each one a
 * region back (subject to the usual confidence / manual-shadow / cap gates).
 *
 * This is the safety net that makes deleting geofences tolerable in a system
 * with no transactions across the reap and re-arm paths. Three ways a place
 * ends up stranded:
 *   1. A note was reopened (archived → open) after its geofence was reaped.
 *   2. The reap's statement snapshot raced a concurrent note-link commit and
 *      deleted a geofence that had just gained an open note.
 *   3. The inferred cap was full when the note was created; slots have since
 *      freed and the place can finally be monitored.
 * All three converge here: called after every reap and on every note reopen,
 * the sweep re-arms with a fresh snapshot, so any stale-read casualty heals on
 * the very next lifecycle event instead of persisting silently.
 *
 * Never throws. Returns the number of geofences created.
 */
export async function rearmStrandedInferredGeofences(userId: string, reason: string): Promise<number> {
  try {
    const stranded = await PlaceModel.findStrandedWithOpenNotes(userId);
    let rearmed = 0;
    for (const place of stranded) {
      if (place.confidence < GEOFENCE_CONFIDENCE_THRESHOLD && !place.userConfirmed) continue;
      if (await maybeCreateInferredGeofence(userId, place)) {
        rearmed++;
        logLifecycle('GEOFENCE_REARMED', { placeId: place.id, name: place.normalizedName, reason });
      }
    }
    if (rearmed > 0) {
      console.log(`[placeService] Re-armed ${rearmed} stranded place(s) after ${reason} — client must re-sync geofences`);
    }
    return rearmed;
  } catch (err) {
    console.warn(`[placeService] Stranded-geofence sweep failed after ${reason}:`, err);
    return 0;
  }
}

/**
 * Remove inferred geofences whose last open note just went away, freeing both
 * the MAX_INFERRED_GEOFENCES budget and the iOS region slot. Never throws —
 * every caller is a user action whose success must not hinge on housekeeping.
 *
 * Deliberately a whole-user sweep rather than a lookup scoped to the object
 * that closed: one note can be linked to several places, closing it can empty
 * more than one, and the sweep also clears the backlog of already-dead
 * geofences a user accumulated before this existed. It is a single indexed
 * DELETE, and it is idempotent.
 *
 * Returns the number reaped so callers can decide whether to tell the client to
 * re-sync its regions.
 */
export async function reapEmptyInferredGeofences(userId: string, reason: string): Promise<number> {
  try {
    const reaped = await GeofenceModel.deleteEmptyInferred(userId);
    if (reaped.length === 0) return 0;

    logLifecycle('GEOFENCE_REAPED', {
      reason,
      count: reaped.length,
      geofences: reaped.map(g => ({ id: g.id, name: g.name })),
    });
    console.log(`[placeService] Reaped ${reaped.length} empty inferred geofence(s) after ${reason}: ${reaped.map(g => g.name).join(', ')} — client must re-sync geofences`);

    // Heal any casualty of the reap racing a concurrent note-link commit: the
    // DELETE's statement snapshot can miss a link written moments earlier by
    // the fire-and-forget place-resolution pipeline, deleting a region a brand
    // new note was counting on. This sweep re-reads with a fresh snapshot and
    // re-arms anything the DELETE shouldn't have taken — turning a permanent
    // silent miss into a self-correcting blip. It also backfills places that
    // were blocked by the inferred cap now that slots just freed up.
    await rearmStrandedInferredGeofences(userId, `${reason}-post-reap`);

    return reaped.length;
  } catch (err) {
    console.warn(`[placeService] Failed to reap inferred geofences after ${reason}:`, err);
    return 0;
  }
}

async function maybeCreateInferredGeofence(
  userId: string,
  place: { id: string; normalizedName: string; lat: number; lng: number; radiusMeters: number; category: string | null }
): Promise<boolean> {
  // Never shadow a user's MANUALLY-labeled place with an inferred duplicate.
  // We deliberately do NOT block on existing *inferred* same-name geofences:
  // a chain like "McDonald's" has many branches, and we create a geofence for
  // each of the nearest few. (Re-recording the same note is de-duped earlier at
  // the place level via PlaceModel.findNearby, so this won't pile up duplicates.)
  const allGeofences = await GeofenceModel.findByUserId(userId);
  const manualGeofences = allGeofences.filter(g => g.createdBy === 'manual');
  const manualMatch = matchPlaceName(place.normalizedName, manualGeofences, g => g.name);
  if (manualMatch) {
    console.log(`[placeService] Manual geofence "${manualMatch.candidate.name}" exists (${manualMatch.reason}) — skipping inferred duplicate for "${place.normalizedName}"`);
    return false;
  }

  const currentCount = await PlaceModel.countInferredGeofences(userId);
  if (currentCount >= MAX_INFERRED_GEOFENCES) {
    logLifecycle('GEOFENCE_LIMIT_REACHED', {
      placeId: place.id,
      name: place.normalizedName,
      currentCount,
      max: MAX_INFERRED_GEOFENCES,
    });
    console.log(`[placeService] Inferred geofence limit reached (${currentCount}/${MAX_INFERRED_GEOFENCES}) — place stored but not monitored: ${place.normalizedName}`);
    return false;
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

    logLifecycle('GEOFENCE_CREATED', {
      geofenceId: geofence.id,
      placeId: place.id,
      name: place.normalizedName,
      lat: place.lat,
      lng: place.lng,
      radius: place.radiusMeters,
    });
    console.log(`[placeService] Created inferred geofence ${geofence.id} for place "${place.normalizedName}" — client must re-sync`);
    return true;
  } catch (err) {
    console.warn(`[placeService] Failed to create inferred geofence for "${place.normalizedName}":`, err);
    return false;
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
 * Returns null — notification should be suppressed — if currently in cooldown
 * OR the place has no open notes.
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

  // Only notify — and only burn the cooldown — when there's an open note to
  // show (mirrors getGeofenceNotifyPayload). Otherwise a note-less visit would
  // set the cooldown and suppress a legitimate notification if a note gets
  // attached and the place is re-entered within the window.
  const lastEnteredAt = now;
  const objects = await getPlaceObjects(userId, placeId, lastEnteredAt);
  if (objects.length === 0) {
    console.log(`[placeService] Place ${placeId} has no open notes — not notifying`);
    return null;
  }

  // Mark enter + set cooldown + increment visit
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS);
  await PlaceModel.upsertTriggerState(userId, placeId, {
    lastEnteredAt,
    lastNotifiedAt: now,
    cooldownUntil,
    incrementVisit: true,
  });

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
  await reapEmptyInferredGeofences(userId, 'place-object-done');
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
  await reapEmptyInferredGeofences(userId, 'place-object-unlinked');
}

// ─── Place promotion ──────────────────────────────────────────────────────────

/**
 * Promote a detected (inferred) place into a manual geofence reminder.
 * Creates the geofence at the place's location with smart defaults, migrates
 * the place's active note links onto it, and deactivates the original links so
 * the place stops appearing as a separate "detected" row in the overview.
 */
export async function promotePlaceToGeofence(
  userId: string,
  placeId: string
): Promise<GeofenceModel> {
  const place = await PlaceModel.findById(placeId);
  if (!place || place.userId !== userId) {
    const err: any = new Error('Place not found');
    err.status = 404;
    throw err;
  }

  const existingManual = (await GeofenceModel.findByUserAndName(userId, place.normalizedName))
    .find(g => g.createdBy === 'manual');
  const geofence = existingManual ?? await GeofenceModel.create(userId, {
    name: place.normalizedName,
    center: { latitude: place.lat, longitude: place.lng },
    radius: 200,
    type: 'custom',
    notificationSettings: { enabled: true, onEnter: true, onExit: false },
    placeId,
    createdBy: 'manual',
  });

  const objectIds = await PlaceModel.getActiveLinkObjectIds(placeId);
  for (const objectId of objectIds) {
    await GeofenceModel.addLinkedObject(geofence.id, objectId);
    await PlaceModel.setLinkInactive(placeId, objectId);
  }

  return geofence;
}

async function verifyPlaceOwnership(userId: string, placeId: string): Promise<void> {
  const place = await PlaceModel.findById(placeId);
  if (!place) throw Object.assign(new Error('Place not found'), { status: 404 });
  if (place.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
}
