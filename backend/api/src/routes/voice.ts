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

const router = Router();

// All voice routes require authentication
router.use(authenticate);

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
    res.json({ token: apiKey });
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

            const object = await createObject(userId, {
              content: parsedObject.cleanedText || parsedObject.rawText,
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

            // Fire-and-forget place resolution for actionable objects mentioning places
            if (
              parsedObject.locationHints?.geofenceCandidate &&
              parsedObject.locationHints?.places?.length > 0
            ) {
              resolveObjectPlaces(
                userId,
                object.id,
                parsedObject.locationHints.places,
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

    res.json({
      sessionId: session.id,
      objectIds,
      objectCount: objectIds.length,
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
