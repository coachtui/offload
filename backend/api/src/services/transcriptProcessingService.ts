/**
 * Background processing for a saved transcript.
 *
 * save-transcript persists the raw transcript and returns immediately; this is
 * the work that used to happen inline while the client waited. Nothing here is
 * on a request path, so it is free to take as long as a five-minute note needs.
 *
 * Contract: never throws. A session either reaches 'completed' or 'failed', and
 * the transcript stays on the row either way, so a failed run is re-runnable.
 */

import { parseTranscript, checkMLServiceHealth } from './mlService';
import type { ParseTranscriptResponse } from './mlService';
import { createObject } from './objectService';
import { Session } from '../models/Session';
import { resolveObjectPlaces } from './placeService';
import { typeEntities } from './entityTyping';
import { sendToUser } from './pushService';
import {
  textHasArrivalTrigger,
  extractPlacesFromText,
  shouldResolvePlaces,
} from './arrivalTrigger';
import type { GeoPoint } from '@shared/types';

/**
 * How many objects to write concurrently.
 *
 * Each write is a Postgres insert, a vector-store round trip, and the category
 * rule pass. Sequentially, a five-minute note's ~30 objects cost ~30x a single
 * write. Bounded rather than unbounded because these share the Postgres pool
 * with live requests, and a 30-wide burst would starve them.
 */
const WRITE_CONCURRENCY = 5;

export interface ProcessResult {
  objectIds: string[];
  /**
   * Legacy alias kept for installed clients: true iff arrivalArmed is
   * non-empty. It used to mean "we found place names and will TRY to resolve
   * them" — which had the client showing the Always-permission sheet for
   * reminders that never came to exist.
   */
  hasGeofenceCandidates: boolean;
  /** Every place name the note mentioned (labels for prompts, not promises). */
  placeNames: string[];
  /** Names an arrival reminder is actually armed for. */
  arrivalArmed: string[];
  /** Names waiting on the user to set a location (pending lookups). */
  needsLocation: string[];
  /** True when the parse was skipped or failed and the note was stored whole. */
  degraded: boolean;
}

/** Run `worker` over `items` at most `limit` at a time, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Parse a transcript into atomic objects and persist them.
 *
 * Degrades to a single unparsed object when the ML service is down or the parse
 * fails — losing a note the user already spoke is the worst outcome available,
 * so it is the one case this code refuses to produce.
 */
export async function processTranscript(params: {
  userId: string;
  sessionId: string;
  transcript: string;
  geoLocation?: GeoPoint;
  /** Device IANA timezone at recording time — remind_at derives in this zone. */
  timezone?: string;
}): Promise<ProcessResult> {
  const { userId, sessionId, transcript, geoLocation, timezone } = params;

  const objectIds: string[] = [];
  const candidatePlaceNames: string[] = [];
  const arrivalArmed: string[] = [];
  const needsLocation: string[] = [];

  const source = {
    type: 'voice' as const,
    recordingId: sessionId,
    location: geoLocation,
  };

  // A parse can fail against a perfectly healthy service — most often by timing
  // out, since generation time scales with how many objects the note contains.
  // Health saying "up" is not evidence the parse worked.
  let parseResult: ParseTranscriptResponse | null = null;
  const mlAvailable = await checkMLServiceHealth();
  console.log('[Processing] ML service available:', mlAvailable);

  if (mlAvailable) {
    try {
      parseResult = await parseTranscript({
        transcript,
        userId,
        sessionId,
        location: geoLocation,
        timestamp: new Date(),
      });
      console.log('[Processing] ML parsed', parseResult.atomicObjects.length, 'objects');
    } catch (parseError) {
      console.error(
        '[Processing] ML parse failed — falling back to unparsed save:',
        parseError instanceof Error ? parseError.message : parseError
      );
    }
  }

  // An empty parse is treated as a failed one. The alternative is reporting a
  // successful save that wrote nothing, which is how a note disappears quietly.
  if (!parseResult || parseResult.atomicObjects.length === 0) {
    console.log(
      mlAvailable
        ? '[Processing] no parsed objects — storing transcript unparsed'
        : '[Processing] ML unavailable — storing transcript unparsed'
    );

    const object = await createObject(userId, { content: transcript, source });
    objectIds.push(object.id);

    // The deterministic store-name patterns are reliable enough to cover the
    // common cases when the richer ML extraction is unavailable.
    if (textHasArrivalTrigger(transcript)) {
      const places = extractPlacesFromText(transcript);
      if (places.length > 0) {
        candidatePlaceNames.push(...places);
        console.log(`[Processing] fallback place trigger — places: ${places.join(', ')}`);
        // Awaited (no longer fire-and-forget): the completion push reports
        // what happened, and honesty requires knowing. The transcript rides
        // along so a spoken region ("the Foodland in Hilo") can anchor there.
        const summary = await resolveObjectPlaces(userId, object.id, places, geoLocation, transcript)
          .catch((err) => {
            console.warn('[Processing] place resolution failed for', object.id, ':', err);
            return undefined;
          });
        arrivalArmed.push(...(summary?.armed ?? []));
        needsLocation.push(...(summary?.needsLocation ?? []));
      }
    }

    return {
      objectIds,
      hasGeofenceCandidates: arrivalArmed.length > 0,
      placeNames: [...new Set(candidatePlaceNames)],
      arrivalArmed,
      needsLocation,
      degraded: true,
    };
  }

  // Written concurrently, but results land back in parse order so objectIds
  // still reflect the sequence the user spoke in.
  const written = await mapWithConcurrency(
    parseResult.atomicObjects,
    WRITE_CONCURRENCY,
    async (parsedObject) => {
      const entityObjects = typeEntities(parsedObject.entities, parsedObject.people);

      // The parser only flags geofence_candidate for arrival phrasing, so a
      // dictated errand ("I need chicken from Costco") comes back false. These
      // rules rescue that case; they only ever ADD candidates, never remove one.
      const textContent = parsedObject.cleanedText || parsedObject.rawText || '';
      const parserFlag = parsedObject.locationHints?.geofenceCandidate;
      const parsedPlaces = parsedObject.locationHints?.places ?? [];
      const effectiveGeofenceCandidate = shouldResolvePlaces(
        textContent,
        parsedPlaces,
        parserFlag
      );

      const object = await createObject(userId, {
        content: textContent,
        category: [],
        source,
        metadata: {
          entities: entityObjects,
          tags: parsedObject.tags,
          urgency: parsedObject.temporalHints.urgency || undefined,
        },
        rawText: parsedObject.rawText,
        cleanedText: parsedObject.cleanedText,
        title: parsedObject.title,
        whyItMatters: parsedObject.whyItMatters,
        objectType: parsedObject.type,
        domain: parsedObject.domain,
        temporalHints: parsedObject.temporalHints,
        locationHints: parsedObject.locationHints,
        actionability: parsedObject.actionability,
        sequenceIndex: parsedObject.sequenceIndex,
        confidence: parsedObject.confidence,
        timezone,
      });

      return { object, effectiveGeofenceCandidate, parsedPlaces, textContent };
    }
  );

  for (const { object, effectiveGeofenceCandidate, parsedPlaces, textContent } of written) {
    objectIds.push(object.id);

    // Awaited, no longer fire-and-forget: the completion push now reports what
    // actually happened ("reminder armed" vs "needs a location"), which is
    // unknowable before resolution finishes. The seconds this adds are spent
    // off the request path — the 202 went out at save time — and only on notes
    // that name places. The object's own text rides along for named-region
    // anchoring.
    if (effectiveGeofenceCandidate && parsedPlaces.length > 0) {
      candidatePlaceNames.push(...parsedPlaces);
      const summary = await resolveObjectPlaces(userId, object.id, parsedPlaces, geoLocation, textContent)
        .catch((err) => {
          console.warn('[Processing] place resolution failed for', object.id, ':', err);
          return undefined;
        });
      arrivalArmed.push(...(summary?.armed ?? []));
      needsLocation.push(...(summary?.needsLocation ?? []));
    }
  }

  return {
    objectIds,
    hasGeofenceCandidates: arrivalArmed.length > 0,
    placeNames: [...new Set(candidatePlaceNames)],
    arrivalArmed,
    needsLocation,
    degraded: false,
  };
}

/**
 * Where a tap on the completion push should land.
 *
 * The note the push is announcing is the whole point of the tap, so send the
 * client at it rather than at Home. One note opens directly; several open the
 * list scoped to that recording, because picking one of six arbitrarily is
 * worse than showing all six. Zero notes has nothing to open.
 */
export function completionTarget(
  sessionId: string,
  objectIds: string[]
): { screen: 'Home' | 'Objects'; objectId?: string; sessionId: string } {
  if (objectIds.length === 1) {
    return { screen: 'Objects', objectId: objectIds[0], sessionId };
  }
  if (objectIds.length > 1) {
    return { screen: 'Objects', sessionId };
  }
  return { screen: 'Home', sessionId };
}

/** Wording for the completion push. Kept apart so it is trivially testable. */
export function completionMessage(result: ProcessResult): { title: string; body: string } {
  // A place that needs the user outranks everything else in the wording: it is
  // the one outcome where silence means a reminder that never fires.
  if (result.needsLocation.length > 0) {
    return {
      title: '✅ Note saved',
      body: `Tap to set where ${result.needsLocation[0]} is — the reminder needs a location.`,
    };
  }
  if (result.degraded) {
    return {
      title: '✅ Note saved',
      body: "Couldn't break it into separate notes — the full note is safe.",
    };
  }
  const n = result.objectIds.length;
  return {
    title: '✅ Note sorted',
    body: n === 1 ? 'Saved as 1 note' : `Sorted into ${n} notes`,
  };
}

/**
 * Process a session end to end and record the outcome on the row.
 *
 * Never throws — this is called from background contexts where a rejection has
 * nowhere to go and would take the process down.
 */
export async function processSessionInBackground(session: Session): Promise<void> {
  const transcript = session.transcript;
  if (!transcript || !transcript.trim()) {
    console.warn('[Processing] session', session.id, 'has no transcript — marking failed');
    await session
      .update({ status: 'failed', metadata: { ...session.metadata, processingError: 'No transcript' } })
      .catch((err) => console.error('[Processing] could not mark session failed:', err));
    return;
  }

  try {
    const result = await processTranscript({
      userId: session.userId,
      sessionId: session.id,
      transcript,
      geoLocation: session.location,
      // Old builds don't send one, and metadata is client-controlled — anything
      // non-string must degrade to the HST fallback, never fail the save.
      timezone:
        typeof session.metadata?.timezone === 'string'
          ? session.metadata.timezone
          : undefined,
    });

    await session.update({
      status: 'completed',
      metadata: {
        ...session.metadata,
        objectIds: result.objectIds,
        degraded: result.degraded,
        placeNames: result.placeNames,
      },
    });
    console.log('[Processing] session', session.id, 'completed —', result.objectIds.length, 'objects');

    const { title, body } = completionMessage(result);
    await sendToUser(session.userId, {
      title,
      body,
      data: {
        ...completionTarget(session.id, result.objectIds),
        objectIds: result.objectIds,
        hasGeofenceCandidates: result.hasGeofenceCandidates,
        placeNames: result.placeNames,
        arrivalArmed: result.arrivalArmed,
        needsLocation: result.needsLocation,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Processing] session', session.id, 'failed:', message);

    // The transcript stays on the row, so the recovery sweep can retry this.
    await session
      .update({ status: 'failed', metadata: { ...session.metadata, processingError: message } })
      .catch((err) => console.error('[Processing] could not mark session failed:', err));

    await sendToUser(session.userId, {
      title: "⚠️ Couldn't sort your note",
      body: 'Your recording is saved. Open Offload to see it.',
      data: { screen: 'Home', sessionId: session.id },
    }).catch(() => {});
  }
}
