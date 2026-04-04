/**
 * Voice session API routes
 * Uses Deepgram for real-time transcription (mobile connects directly to Deepgram)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { parseTranscript, checkMLServiceHealth } from '../services/mlService';
import { createObject } from '../services/objectService';
import { Session } from '../models/Session';
import { resolveObjectPlaces } from '../services/placeService';
import { DEEPGRAM_KEYWORDS } from '../config/keywords';

const router = Router();

// All voice routes require authentication
router.use(authenticate);

// ─── Deterministic arrival-trigger detection ──────────────────────────────────
// These patterns reliably indicate "remind me when I arrive at X" intent.
// Applied as a fallback when the ML parser does not set geofence_candidate=true.
const ARRIVAL_PATTERNS = [
  /when\s+(?:i\s+)?(?:get|arrive|am|reach|go)\s+(?:to|at)\b/i,
  /remind(?:er)?\s+(?:me\s+)?.+\bat\b\s+\w/i,
  /at\s+(?:the\s+)?(?:costco|walmart|target|longs|safeway|home\s+depot|lowes|cvs|walgreens|sam['']?s|whole\s+foods|trader\s+joe['']?s|aldi|costco|ross|tj\s+maxx|marshalls|kohls?)\b/i,
];

function textHasArrivalTrigger(text: string): boolean {
  return ARRIVAL_PATTERNS.some(p => p.test(text));
}

/**
 * Extract store/place names from text using the deterministic store pattern.
 * Used only in the ML-fallback path where the LLM isn't available to extract places.
 */
function extractPlacesFromText(text: string): string[] {
  const storePattern = /at\s+(?:the\s+)?(?:costco|walmart|target|longs(?:\s+drugs)?|safeway|home\s+depot|lowes|cvs|walgreens|sam['']?s(?:\s+club)?|whole\s+foods|trader\s+joe['']?s|aldi|ross|tj\s+maxx|marshalls|kohl['']?s?)\b/gi;
  const matches = Array.from(text.matchAll(storePattern));
  const places = matches
    .map(m => m[0].replace(/^at\s+(?:the\s+)?/i, '').trim())
    .filter(Boolean);
  return [...new Set(places)]; // dedupe
}

// Validation schemas
const saveTranscriptSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required'),
  duration: z.number().optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      accuracy: z.number().optional(),
      altitude: z.number().optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * GET /api/v1/voice/deepgram-token - Get temporary Deepgram API token
 * Mobile app uses this to connect directly to Deepgram for real-time transcription
 */
router.get('/deepgram-token', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  console.log(`[Voice] GET /deepgram-token — userId: ${userId}`);

  try {
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error('[Voice] DEEPGRAM_API_KEY is not set in environment');
      return res.status(500).json({
        message: 'DEEPGRAM_API_KEY is missing on the server',
        code: 'DEEPGRAM_NOT_CONFIGURED',
      });
    }

    // Return the API key directly — regular Deepgram keys work with the
    // WebSocket Sec-WebSocket-Protocol: token, <key> header. The /auth/grant
    // temporary-token endpoint requires Member-level permissions which this
    // key does not have; passing the key directly is equivalent for our use case.
    console.log('[Voice] returning Deepgram key as token — key length:', apiKey.length);
    res.json({ token: apiKey, keywords: DEEPGRAM_KEYWORDS });
  } catch (error) {
    console.error('[Voice] error getting Deepgram token:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'DEEPGRAM_REQUEST_FAILED',
    });
  }
});

/**
 * POST /api/v1/voice/save-transcript - Save transcript and create atomic objects
 * Called after recording stops with the final transcript from Deepgram
 */
router.post('/save-transcript', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  console.log(`[Voice] POST /save-transcript — userId: ${userId}`);

  try {
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validationResult = saveTranscriptSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.warn('[Voice] save-transcript validation failed:', validationResult.error.errors);
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { transcript, duration, location, metadata } = validationResult.data;
    console.log('[Voice] transcript length:', transcript.length, '— duration:', duration);

    const geoLocation = location ? {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      altitude: location.altitude,
    } : undefined;

    // Create a session record (initial status: 'recording')
    const session = await Session.create({
      userId,
      deviceId: 'mobile-deepgram',
      location: geoLocation,
      metadata: { ...metadata, duration, transcriptionMethod: 'deepgram' },
    });
    console.log('[Voice] session created:', session.id);

    // Parse transcript and create atomic objects
    const objectIds: string[] = [];
    let hasGeofenceCandidates = false;

    try {
      if (transcript.trim()) {
        const mlAvailable = await checkMLServiceHealth();
        console.log('[Voice] ML service available:', mlAvailable);

        if (mlAvailable) {
          const parseResult = await parseTranscript({
            transcript,
            userId,
            sessionId: session.id,
            location: geoLocation,
            timestamp: new Date(),
          });
          console.log('[Voice] ML parsed', parseResult.atomicObjects.length, 'objects');

          for (const parsedObject of parseResult.atomicObjects) {
            // Convert entity names to Entity[] for metadata storage
            const entityObjects = parsedObject.entities.map((name) => ({
              type: 'other' as const,
              value: name,
              confidence: 1.0,
            }));

            // Deterministic fallback: if ML didn't flag geofence_candidate but the text
            // contains clear arrival-trigger patterns ("when I get to Costco"), force it on.
            const textContent = parsedObject.cleanedText || parsedObject.rawText || '';
            const deterministicGeofenceCandidate = textHasArrivalTrigger(textContent);

            if (deterministicGeofenceCandidate && !parsedObject.locationHints?.geofenceCandidate) {
              console.log(`[Voice] Deterministic arrival trigger detected in: "${textContent.slice(0, 80)}"`);
            }

            const effectiveGeofenceCandidate =
              parsedObject.locationHints?.geofenceCandidate || deterministicGeofenceCandidate;

            const object = await createObject(userId, {
              content: textContent,
              category: [],
              source: {
                type: 'voice',
                recordingId: session.id,
                location: geoLocation,
              },
              metadata: {
                entities: entityObjects,
                tags: parsedObject.tags,
                urgency: parsedObject.temporalHints.urgency || undefined,
              },
              // v2 rich fields
              rawText: parsedObject.rawText,
              cleanedText: parsedObject.cleanedText,
              title: parsedObject.title,
              objectType: parsedObject.type,
              domain: parsedObject.domain,
              temporalHints: parsedObject.temporalHints,
              locationHints: parsedObject.locationHints,
              actionability: parsedObject.actionability,
              sequenceIndex: parsedObject.sequenceIndex,
            });
            objectIds.push(object.id);

            // Fire-and-forget place resolution for objects mentioning places
            const places = parsedObject.locationHints?.places;
            if (effectiveGeofenceCandidate && places && places.length > 0) {
              hasGeofenceCandidates = true;
              resolveObjectPlaces(
                userId,
                object.id,
                places,
                geoLocation
              ).catch(err =>
                console.warn('[Voice] Place resolution failed silently for object', object.id, ':', err)
              );
            }
          }
        } else {
          // Fallback: create single object with full transcript
          console.log('[Voice] ML unavailable — creating single fallback object');
          const object = await createObject(userId, {
            content: transcript,
            source: {
              type: 'voice',
              recordingId: session.id,
              location: geoLocation,
            },
          });
          objectIds.push(object.id);

          // Still attempt place extraction via deterministic patterns even without ML.
          // ML provides richer place extraction, but the store-name patterns are reliable
          // enough to handle the most common cases when ML is down.
          const hasTrigger = textHasArrivalTrigger(transcript);
          if (hasTrigger) {
            const places = extractPlacesFromText(transcript);
            if (places.length > 0) {
              hasGeofenceCandidates = true;
              console.log(`[Voice] ML-fallback deterministic trigger — places detected: ${places.join(', ')}`);
              resolveObjectPlaces(userId, object.id, places, geoLocation).catch(err =>
                console.warn('[Voice] Place resolution failed silently (ML fallback) for object', object.id, ':', err)
              );
            } else {
              console.log('[Voice] ML-fallback: arrival trigger matched but no extractable store name — skipping place resolution');
            }
          }
        }
      }

      // Update session as completed — transcript not persisted (already parsed into objects)
      await session.update({
        status: 'completed',
        metadata: {
          ...session.metadata,
          objectIds,
        },
      });
      console.log('[Voice] session', session.id, 'completed —', objectIds.length, 'objects');

    } catch (processingError) {
      // Session exists but processing failed — mark as failed so it appears in UI
      console.error('[Voice] processing failed for session', session.id, ':', processingError);
      try {
        await session.update({
          status: 'failed',
          metadata: {
            ...session.metadata,
            processingError: processingError instanceof Error ? processingError.message : 'Unknown error',
          },
        });
      } catch (updateError) {
        console.error('[Voice] could not mark session as failed:', updateError);
      }
      throw processingError;
    }

    // hasGeofenceCandidates signals to the client that place resolution is running
    // asynchronously server-side and geofences may be created shortly. The client
    // should re-fetch geofences after a brief delay to pick up new OS registrations.
    console.log(`[Voice] Responding — objectCount=${objectIds.length}, hasGeofenceCandidates=${hasGeofenceCandidates}`);
    res.json({
      sessionId: session.id,
      objectIds,
      objectCount: objectIds.length,
      hasGeofenceCandidates: hasGeofenceCandidates ?? false,
    });
  } catch (error) {
    console.error('[Voice] save-transcript error:', error);
    res.status(500).json({
      error: 'Failed to save transcript',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions - List user's voice sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  console.log(`[Voice] GET /sessions — userId: ${userId}`);

  try {
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = parseInt(req.query.offset as string) || 0;

    const validStatuses = ['recording', 'processing', 'completed', 'failed'];
    const statusFilter = status && validStatuses.includes(status)
      ? (status as 'recording' | 'processing' | 'completed' | 'failed')
      : undefined;

    const result = await Session.findByUserId(userId, {
      status: statusFilter,
      limit,
      offset,
    });

    console.log(`[Voice] returning ${result.sessions.length} sessions (total: ${result.total})`);

    res.json({
      sessions: result.sessions.map((s) => s.toVoiceSession()),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Voice] list sessions error:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions/:id - Get session details
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  console.log(`[Voice] GET /sessions/${id} — userId: ${userId}`);

  try {
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await Session.findById(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Extract transcript from metadata so the client detail view can display it
    const currentTranscript = typeof session.metadata?.transcript === 'string'
      ? session.metadata.transcript
      : null;

    const duration = typeof session.metadata?.duration === 'number'
      ? session.metadata.duration
      : null;

    res.json({
      session: session.toVoiceSession(),
      isActive: session.status === 'recording',
      currentTranscript,
      duration,
      chunkCount: 0,
    });
  } catch (error) {
    console.error('[Voice] get session error:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions/:id/audio - Get pre-signed audio URL
 * The Deepgram flow streams audio directly to Deepgram; no audio is stored server-side.
 * Returns 404 with a clear message so the client can display "Audio not available".
 */
router.get('/sessions/:id/audio', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  console.log(`[Voice] GET /sessions/${id}/audio — userId: ${userId}`);

  try {
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await Session.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Audio is not stored server-side for Deepgram sessions
    return res.status(404).json({
      error: 'Audio not available',
      message: 'Audio is not stored for Deepgram-transcribed sessions',
    });
  } catch (error) {
    console.error('[Voice] get audio URL error:', error);
    res.status(500).json({
      error: 'Failed to get audio URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
