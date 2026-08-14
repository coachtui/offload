/**
 * Place Service
 *
 * Orchestrates place extraction → resolution → memory → geofence registration.
 * Called fire-and-forget from voice.ts after ML parsing.
 */

import { PlaceModel } from '../models/Place';
import { GeofenceModel } from '../models/Geofence';
import { AtomicObjectModel } from '../models/AtomicObject';
import { PlaceLookupModel } from '../models/PlaceLookup';
import { ReminderLifecycleEventModel } from '../models/ReminderLifecycleEvent';
import {
  searchPlaceCandidates,
  candidateToResolvedPlace,
  selectNearestResolved,
  haversineKm,
} from './placeResolutionService';
import { resolveAnchors } from './placeAnchors';
import { arbitrate } from './candidateArbitration';
import { matchPlaceName } from './placeNameMatch';
import { sendSilentToUser } from './pushService';
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
  | 'PLACE_UNRESOLVABLE' // historical rows only — superseded by PLACE_NEEDS_USER
  | 'PLACE_PROVIDER_FALLBACK'
  | 'PLACE_NEEDS_USER'
  | 'PLACE_USER_RESOLVED'
  | 'PLACE_LOOKUP_DISMISSED'
  | 'GEOFENCE_CREATED'
  | 'GEOFENCE_REARMED'
  | 'GEOFENCE_REAPED'
  | 'GEOFENCE_SKIPPED_LOW_CONFIDENCE'
  | 'GEOFENCE_LIMIT_REACHED';

/**
 * Console for Railway's live tail, plus a persisted row for
 * GET /diagnostics/reminders — which had been reading an empty table since
 * migration 010, because nothing ever wrote to it. Fire-and-forget: the
 * model's record() never throws, and diagnostics must never break the
 * pipeline they observe.
 */
export function logLifecycle(
  event: ReminderLifecycleEvent,
  details: Record<string, unknown>
): void {
  console.log(`[ReminderLifecycle] ${event}`, JSON.stringify(details));
  void ReminderLifecycleEventModel.record(event, details);
}

// ─── Place resolution pipeline ───────────────────────────────────────────────

export interface PlaceResolutionSummary {
  /** Names a region now covers (created, or linked to one that exists) — an arrival will fire. */
  armed: string[];
  /** Names queued as pending lookups — the user has to place them before anything can fire. */
  needsLocation: string[];
}

/**
 * Resolve place names from a parsed atomic object and create place records + geofences.
 * Must not throw. The returned summary is what makes the completion push honest:
 * "armed" and "needs your help" are different messages, and the old boolean
 * conflated them into "we tried".
 */
export async function resolveObjectPlaces(
  userId: string,
  objectId: string,
  placeNames: string[],
  userLocation?: { latitude: number; longitude: number },
  noteText?: string
): Promise<PlaceResolutionSummary> {
  logLifecycle('REMINDER_CANDIDATE_DETECTED', { userId, objectId, placeNames, hasUserLocation: !!userLocation });
  console.log(`[placeService] resolveObjectPlaces: ${placeNames.length} place(s) for object ${objectId}${userLocation ? ` (user at ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)})` : ' (no user location)'}`);
  const summary: PlaceResolutionSummary = { armed: [], needsLocation: [] };
  let geofencesChanged = false;
  for (const rawName of placeNames) {
    try {
      const { changed, outcome } = await resolveAndLinkPlace(userId, objectId, rawName, userLocation, noteText);
      geofencesChanged = geofencesChanged || changed;
      if (outcome === 'armed') summary.armed.push(rawName);
      else if (outcome === 'pending') summary.needsLocation.push(rawName);
    } catch (err) {
      console.warn(`[placeService] Failed to resolve place "${rawName}" for object ${objectId}:`, err);
    }
  }
  console.log(`[placeService] resolveObjectPlaces: complete for object ${objectId} — client must re-sync geofences`);

  // New regions exist server-side but iOS knows nothing until device JS runs a
  // sync. Foreground covers itself (post-save syncs at +12s/+35s), but a user
  // who records and immediately quits has no running JS — this silent push is
  // the wake-up that closes that gap. Best-effort by design: iOS throttles
  // content-available pushes, older builds lack the background mode, and the
  // post-save/app-active syncs remain the primary arming paths either way.
  if (geofencesChanged) {
    await sendSilentToUser(userId, { type: 'geofence-sync', objectId });
  }
  return summary;
}

interface LinkResult {
  /** True when the user's geofence set changed (a region was created). */
  changed: boolean;
  /** armed: a region will fire for this name. pending: queued, needs the user. none: skipped. */
  outcome: 'armed' | 'pending' | 'none';
}

async function resolveAndLinkPlace(
  userId: string,
  objectId: string,
  rawName: string,
  userLocation?: { latitude: number; longitude: number },
  noteText?: string
): Promise<LinkResult> {
  const normalizedQuery = rawName.trim();
  if (!normalizedQuery) return { changed: false, outcome: 'none' };

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
    // geofenceId, NOT placeId: this branch matched a manual geofence, and a
    // geofence id is not in hub.places. Writing it as placeId violates
    // reminder_lifecycle_events_place_id_fkey, so the row is rejected and the
    // trail loses its first event for exactly the places that matter most —
    // the ones the user taught by hand.
    logLifecycle('PLACE_DEDUPED', { userId, objectId, geofenceId: geofence.id, name: geofence.name, reason: `manual_geofence_${geofenceMatch.reason}` });
    await GeofenceModel.addLinkedObject(geofence.id, objectId);
    // Labeled place is authoritative — do not geocode or create an inferred place.
    return { changed: false, outcome: 'armed' };
  }

  // ─── 1b. Match existing inferred places by name — ALL of them ──────────────
  // Same matcher as the manual step, so "costco gasoline station" dedupes onto
  // the existing "Costco Gasoline" place instead of geocoding a near-duplicate.
  //
  // Every matching place gets the note, not just the best match. The geocode
  // fan-out deliberately creates a place per nearby branch of a chain so the
  // note fires at whichever branch the user shows up at; linking only one
  // match here silently reduced a chain note to a single arbitrary branch
  // (newest-first order), which is how a Foodland note ended up attached to
  // one branch's region while the user stood inside the other branch's — with
  // both the OS path and the proximity check correctly silent, because the
  // region they were inside held no notes.
  const userPlaces = await PlaceModel.findByUserId(userId);
  const matchedPlaces = userPlaces.filter(
    p => matchPlaceName(normalizedQuery, [p], x => x.normalizedName) !== null
  );
  let geofencesChanged = false;
  if (matchedPlaces.length > 0) {
    // Three or more stored places sharing this name are the fossil of a chain
    // fan-out — the same evidence a live 'chain' verdict rests on. Their
    // per-row confidences may predate the chain floor (the stranded-Costco
    // case), so the rearm gate accepts the sibling count as chain evidence.
    const chainEvidence = matchedPlaces.length >= 3;
    for (const existing of matchedPlaces) {
      const match = matchPlaceName(normalizedQuery, [existing], x => x.normalizedName)!;
      console.log(`[placeService] Found existing place by name: ${existing.id} (${existing.normalizedName}) via ${match.reason}`);
      logLifecycle('PLACE_DEDUPED', { userId, objectId, placeId: existing.id, name: existing.normalizedName, reason: `name_${match.reason}` });
      await PlaceModel.linkObject(existing.id, objectId, 'mentioned_in_note');
      geofencesChanged = (await rearmInferredGeofence(userId, existing, chainEvidence)) || geofencesChanged;
    }

    // If every known branch is far from where the note was recorded, the local
    // branch has no place record yet — fall through to the geocoder so it gets
    // one (step 3's proximity dedupe keeps this from duplicating anything).
    // Without a user location there is no way to judge "far", so keep the old
    // behavior and stop here.
    const NEARBY_BRANCH_KM = 10;
    const someBranchNearby = !userLocation || matchedPlaces.some(
      p => haversineKm(userLocation.latitude, userLocation.longitude, p.lat, p.lng) <= NEARBY_BRANCH_KM
    );
    if (someBranchNearby) return { changed: geofencesChanged, outcome: 'armed' };
    console.log(`[placeService] No matched "${normalizedQuery}" place within ${NEARBY_BRANCH_KM}km of user — geocoding for a local branch`);
  }

  // ─── 1c. The user's ignore list ────────────────────────────────────────────
  // A word the user has answered "not a place" to must not re-queue on every
  // future note that contains it.
  if (await PlaceLookupModel.isQueryIgnored(userId, normalizedQuery)) {
    console.log(`[placeService] "${normalizedQuery}" is on the user's ignore list — skipping`);
    return { changed: geofencesChanged, outcome: 'none' };
  }

  // ─── 2. Anchored provider chain + arbitration ──────────────────────────────
  const userLatLng = userLocation
    ? { lat: userLocation.latitude, lng: userLocation.longitude }
    : undefined;

  const anchors = await resolveAnchors({
    userId,
    noteText: noteText ?? '',
    placeName: normalizedQuery,
    recorded: userLatLng,
  });
  // accept: a provider's answer only counts if arbitration can use it. OSM
  // returning rows the name filter rejects wholesale is a MISS, and the chain
  // moves on to Google — whose matching of casual speech is the structural
  // answer to "people don't pronounce canonical POI names".
  const search = await searchPlaceCandidates(normalizedQuery, anchors, {
    accept: (candidates) => arbitrate(normalizedQuery, candidates).verdict !== 'none',
  });

  if (search.provider === 'google') {
    logLifecycle('PLACE_PROVIDER_FALLBACK', {
      userId,
      objectId,
      query: normalizedQuery,
      anchorSource: search.anchor?.source ?? null,
      candidateCount: search.candidates.length,
    });
  }

  const { verdict, locations } = arbitrate(normalizedQuery, search.candidates);

  // ─── 2b. Nothing found, or same name at two different destinations: ASK. ──
  // The old pipeline logged PLACE_UNRESOLVABLE and dropped the name on the
  // floor — invisible until the user drove somewhere and nothing fired. Now
  // both outcomes become a pending lookup: a visible row in Places, a chip on
  // the note, and a retry ledger for later backfills.
  if (verdict === 'none' || verdict === 'ambiguous') {
    // The confirm sheet needs addresses to distinguish two same-name rows, and
    // the cheap-SKU search deliberately omits them. Re-fetch with addresses
    // only here — exactly the "about to ask the user" case the field-mask
    // discipline exists for. Best-effort: the bare candidates still ask a
    // usable question if this second pass fails.
    let pendingCandidates = locations;
    if (verdict === 'ambiguous') {
      const enriched = await searchPlaceCandidates(normalizedQuery, anchors, {
        withAddress: true,
        accept: (candidates) => arbitrate(normalizedQuery, candidates).verdict !== 'none',
      });
      const rearbitrated = arbitrate(normalizedQuery, enriched.candidates);
      if (rearbitrated.locations.length > 0) pendingCandidates = rearbitrated.locations;
    }

    logLifecycle('PLACE_NEEDS_USER', {
      userId,
      objectId,
      query: normalizedQuery,
      verdict,
      provider: search.provider,
      candidateCount: pendingCandidates.length,
    });
    try {
      await PlaceLookupModel.create({
        userId,
        objectId,
        query: normalizedQuery,
        candidates: pendingCandidates,
        provider: verdict === 'none' ? null : search.provider,
        recorded: userLatLng,
      });
    } catch (err) {
      // The queue write is the fallback of the fallback — its failure must not
      // abort the remaining place names on this note.
      console.warn(`[placeService] Failed to queue pending lookup for "${normalizedQuery}":`, err);
    }
    // Far-branch fall-through can arrive here having already linked existing
    // branches in 1b — that name IS armed; the pending row is a bonus question,
    // not a blocker, and the push must not nag about it.
    return { changed: geofencesChanged, outcome: matchedPlaces.length > 0 ? 'armed' : 'pending' };
  }

  // ─── 2c. single arms as-is; chain fans out to the nearest 3 ────────────────
  // A chain verdict floors confidence at the geofence threshold. The threshold
  // exists to filter VAGUE names, and arbitration has already adjudicated
  // that: >=3 same-name branches surviving the name filter is definitionally
  // a real chain. Without this floor, the per-candidate base signal — OSM
  // importance, ~0.001 for branch POIs — left every Costco branch at
  // 0.35-0.40 against the 0.45 gate: places created, no regions, bell
  // silently off (field-found 2026-08-13).
  const resolvedList = selectNearestResolved(
    locations.map((c) => {
      const resolved = candidateToResolvedPlace(c, normalizedQuery, userLatLng);
      return verdict === 'chain' && resolved.confidence < GEOFENCE_CONFIDENCE_THRESHOLD
        ? { ...resolved, confidence: GEOFENCE_CONFIDENCE_THRESHOLD }
        : resolved;
    }),
    userLatLng
  );
  console.log(`[placeService] "${normalizedQuery}" → ${verdict} (${locations.length} location(s), arming ${resolvedList.length}) via ${search.provider}`);

  for (const resolved of resolvedList) {
    // ─── 3. Proximity de-dup (same place within 300m already exists?) ────────
    const nearby = await PlaceModel.findNearby(userId, resolved.lat, resolved.lng, 300);
    const sameNameNearby = nearby.find(
      p => p.normalizedName.toLowerCase().includes(resolved.normalizedName.toLowerCase()) ||
           resolved.normalizedName.toLowerCase().includes(p.normalizedName.toLowerCase())
    );

    if (sameNameNearby) {
      console.log(`[placeService] Deduped to nearby place: ${sameNameNearby.id} (${sameNameNearby.normalizedName})`);
      logLifecycle('PLACE_DEDUPED', { userId, objectId, placeId: sameNameNearby.id, name: sameNameNearby.normalizedName, reason: 'proximity' });
      await PlaceModel.linkObject(sameNameNearby.id, objectId, 'mentioned_in_note');
      geofencesChanged = (await rearmInferredGeofence(userId, sameNameNearby, verdict === 'chain')) || geofencesChanged;
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
      userId,
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
      geofencesChanged = (await maybeCreateInferredGeofence(userId, place)) || geofencesChanged;
    } else {
      logLifecycle('GEOFENCE_SKIPPED_LOW_CONFIDENCE', {
        userId,
        objectId,
        placeId: place.id,
        name: resolved.normalizedName,
        confidence: resolved.confidence,
        threshold: GEOFENCE_CONFIDENCE_THRESHOLD,
      });
      console.log(`[placeService] Confidence ${resolved.confidence} < ${GEOFENCE_CONFIDENCE_THRESHOLD} — skipping geofence for "${resolved.normalizedName}"`);
    }
  }
  return { changed: geofencesChanged, outcome: 'armed' };
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
  place: { id: string; normalizedName: string; lat: number; lng: number; radiusMeters: number; category: string | null; confidence?: number },
  chainEvidence = false
): Promise<boolean> {
  try {
    const existingRegions = await GeofenceModel.findByPlaceId(userId, place.id);
    if (existingRegions.length > 0) return false;

    // Same bar as first-time creation — a place we were never confident enough
    // to monitor doesn't become monitorable just by being mentioned again.
    // EXCEPT under chain evidence (a live chain verdict, or >=3 stored
    // same-name siblings): the stored confidence predates the chain floor and
    // reflects OSM's near-zero importance for branch POIs, not vagueness.
    if (
      !chainEvidence &&
      typeof place.confidence === 'number' &&
      place.confidence < GEOFENCE_CONFIDENCE_THRESHOLD
    ) {
      console.log(`[placeService] Place ${place.id} "${place.normalizedName}" below confidence threshold (${place.confidence}) — not re-arming`);
      return false;
    }

    logLifecycle('GEOFENCE_REARMED', { userId, placeId: place.id, name: place.normalizedName });
    console.log(`[placeService] Re-arming geofence for existing place ${place.id} "${place.normalizedName}"`);
    return await maybeCreateInferredGeofence(userId, place);
  } catch (err) {
    console.warn(`[placeService] Failed to re-arm geofence for place ${place.id}:`, err);
    return false;
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
        logLifecycle('GEOFENCE_REARMED', { userId, placeId: place.id, name: place.normalizedName, reason });
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
      userId,
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
      userId,
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
      userId,
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

// ─── Pending lookups — the "needs your help" queue ───────────────────────────

export interface PendingLookupView {
  id: string;
  query: string;
  objectId: string;
  notePreview: string | null;
  provider: string | null;
  createdAt: Date;
  candidates: Array<{
    name: string;
    address: string | null;
    lat: number;
    lng: number;
    category: string | null;
    /** From where the note was recorded, when that is known. */
    distanceKm: number | null;
  }>;
}

/** Pending rows with note previews and per-candidate distances, for the sheet. */
export async function getPendingPlaceLookups(userId: string): Promise<PendingLookupView[]> {
  const lookups = await PlaceLookupModel.findPendingByUser(userId);
  if (lookups.length === 0) return [];

  const objectIds = [...new Set(lookups.map((l) => l.objectId))];
  const objects = await AtomicObjectModel.findByIds(objectIds);
  const previews = new Map<string, string>();
  for (const model of objects) {
    const obj = model.toAtomicObject();
    const text = obj.title || obj.content || '';
    previews.set(obj.id, text.length > 80 ? `${text.slice(0, 77)}…` : text);
  }

  return lookups.map((l) => ({
    id: l.id,
    query: l.query,
    objectId: l.objectId,
    notePreview: previews.get(l.objectId) ?? null,
    provider: l.provider,
    createdAt: l.createdAt,
    candidates: l.candidates.map((c) => ({
      name: c.name,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      category: c.category,
      distanceKm:
        l.recordedLat !== null && l.recordedLng !== null
          ? Math.round(haversineKm(l.recordedLat, l.recordedLng, c.lat, c.lng) * 10) / 10
          : null,
    })),
  }));
}

export type PendingResolveChoice =
  | { candidateIndex: number }
  | { lat: number; lng: number; radius?: number }
  | { geofenceId: string };

/**
 * The user answered the question. Whichever affordance they used — a listed
 * candidate, "use my current location", "pick on the map" (both arrive as
 * coordinates), or an existing geofence — the result is the same shape as a
 * promoted place: a MANUAL geofence, so the name-match step catches every
 * future mention of this word and the question is never asked again.
 *
 * Notes ride on geofence_objects (not object_place_links) because that is the
 * table manual-geofence detail views read — mirroring promotePlaceToGeofence,
 * and for the same reason the manual-match step links there.
 */
export async function resolvePendingLookup(
  userId: string,
  lookupId: string,
  choice: PendingResolveChoice
): Promise<GeofenceModel> {
  const lookup = await PlaceLookupModel.findById(lookupId);
  if (!lookup) throw Object.assign(new Error('Lookup not found'), { status: 404 });
  if (lookup.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (lookup.status !== 'pending') {
    throw Object.assign(new Error('Lookup already handled'), { status: 409 });
  }

  let geofence: GeofenceModel;
  let placeId: string | null = null;
  let method: string;

  if ('geofenceId' in choice) {
    const existing = await GeofenceModel.findById(choice.geofenceId);
    if (!existing || existing.userId !== userId) {
      throw Object.assign(new Error('Geofence not found'), { status: 404 });
    }
    geofence = existing;
    method = 'existing_geofence';
  } else {
    let lat: number;
    let lng: number;
    let name = lookup.query;
    let category: string | null = null;
    let providerPlaceId: string | null = null;

    if ('candidateIndex' in choice) {
      const candidate = lookup.candidates[choice.candidateIndex];
      if (!candidate) throw Object.assign(new Error('No such candidate'), { status: 400 });
      ({ lat, lng } = candidate);
      name = candidate.name;
      category = candidate.category;
      providerPlaceId = candidate.providerPlaceId;
      method = 'candidate';
    } else {
      ({ lat, lng } = choice);
      method = 'coordinates';
    }

    const radius = 'radius' in choice && choice.radius ? choice.radius : 200;

    const place = await PlaceModel.create({
      userId,
      rawName: lookup.query,
      normalizedName: name,
      providerPlaceId,
      lat,
      lng,
      radiusMeters: radius,
      category,
      confidence: 1.0, // the user pointed at it — there is no higher signal
      userConfirmed: true,
      createdBy: 'manual',
    });
    placeId = place.id;

    const existingManual = (await GeofenceModel.findByUserAndName(userId, name))
      .find((g) => g.createdBy === 'manual');
    geofence = existingManual ?? await GeofenceModel.create(userId, {
      name,
      center: { latitude: lat, longitude: lng },
      radius,
      type: 'custom',
      notificationSettings: { enabled: true, onEnter: true, onExit: false },
      placeId: place.id,
      createdBy: 'manual',
    });
  }

  await GeofenceModel.addLinkedObject(geofence.id, lookup.objectId);
  await PlaceLookupModel.markResolved(lookupId, placeId);
  logLifecycle('PLACE_USER_RESOLVED', {
    userId,
    objectId: lookup.objectId,
    placeId,
    geofenceId: geofence.id,
    query: lookup.query,
    method,
  });

  return geofence;
}

/**
 * "Not a place" / "don't ask again". The dismissed row itself is the
 * ignore-list entry (see PlaceLookupModel.isQueryIgnored), so this word stops
 * re-queueing on every future note without any extra bookkeeping.
 */
export async function dismissPendingLookup(userId: string, lookupId: string): Promise<void> {
  const lookup = await PlaceLookupModel.findById(lookupId);
  if (!lookup) throw Object.assign(new Error('Lookup not found'), { status: 404 });
  if (lookup.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  await PlaceLookupModel.markDismissed(lookupId);
  logLifecycle('PLACE_LOOKUP_DISMISSED', {
    userId,
    objectId: lookup.objectId,
    query: lookup.query,
  });
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
