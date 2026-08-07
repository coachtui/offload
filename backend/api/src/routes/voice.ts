/**
 * Voice session API routes
 * Uses Deepgram for real-time transcription (mobile connects directly to Deepgram)
 */

import { Router, Request, Response, json } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { Session } from '../models/Session';
import { DEEPGRAM_KEYWORDS } from '../config/keywords';
import { transcribeWithGpt4o } from '../services/transcriptionService';
import { processSessionInBackground } from '../services/transcriptProcessingService';

const router = Router();

// All voice routes require authentication
router.use(authenticate);

// Deterministic arrival/errand detection — see services/arrivalTrigger.ts

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

    // Persist the transcript and hand off. The parse and the per-object writes
    // scale with how long the user talked, so keeping them on the request path
    // made the client's timeout a function of note length — an unwinnable race
    // that showed up as "Couldn't save your note" on notes that had, in fact,
    // saved. The transcript is durable at this point; everything after it is
    // recoverable work.
    const session = await Session.create({
      userId,
      deviceId: 'mobile-deepgram',
      location: geoLocation,
      metadata: { duration, transcriptionMethod: 'deepgram', ...metadata },
      transcript,
      status: 'processing',
    });
    console.log('[Voice] session created:', session.id, '— processing in background');

    // Deliberately not awaited. setImmediate defers past the response flush so a
    // slow parse cannot delay the reply the client is waiting on.
    setImmediate(() => {
      void processSessionInBackground(session);
    });

    // 202: accepted, not yet complete. The old fields are still present and
    // empty so a client built against the synchronous contract (the March
    // production build, on a different runtime version) keeps parsing the body
    // instead of erroring. New clients key off `status`.
    res.status(202).json({
      sessionId: session.id,
      status: 'processing',
      objectIds: [],
      objectCount: 0,
      hasGeofenceCandidates: false,
      placeNames: [],
    });
  } catch (error) {
    console.error('[Voice] save-transcript error:', error);
    res.status(500).json({
      error: 'Failed to save transcript',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Validation for the audio transcription endpoint. audioChunks are base64-encoded
// raw PCM segments as they arrived from the mobile microphone (each chunk is a
// whole number of bytes, so decoding per-chunk and concatenating is safe —
// joining the base64 strings themselves would not be, due to padding).
const transcribeAudioSchema = z.object({
  audioChunks: z.array(z.string()).min(1, 'audioChunks is required'),
  sampleRate: z.number().optional(),
  channels: z.number().optional(),
});

/**
 * POST /api/v1/voice/transcribe-audio - Transcribe raw PCM audio with gpt-4o-transcribe
 *
 * The mobile app streams audio to Deepgram for the live word-by-word preview, and
 * also accumulates the raw PCM. On stop it sends that audio here for a final,
 * higher-accuracy transcript that becomes the saved note. Returns { transcript };
 * on any failure the client falls back to the Deepgram preview text.
 *
 * Uses a route-scoped JSON body limit (audio payloads far exceed the global 100kb).
 */
router.post(
  // Base64 audio inflates ~33% over the raw bytes; keep the body limit above the
  // 24MB WAV cap in transcribeWithGpt4o so that guard returns the clear error.
  '/transcribe-audio',
  json({ limit: '40mb' }),
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    console.log(`[Voice] POST /transcribe-audio — userId: ${userId}`);

    try {
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const validationResult = transcribeAudioSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.warn('[Voice] transcribe-audio validation failed:', validationResult.error.errors);
        return res.status(400).json({
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const { audioChunks, sampleRate, channels } = validationResult.data;

      // Decode each base64 chunk independently, then concat the raw bytes.
      const pcm = Buffer.concat(audioChunks.map((c) => Buffer.from(c, 'base64')));
      console.log('[Voice] transcribe-audio — chunks:', audioChunks.length, '— pcm bytes:', pcm.length);

      if (pcm.length === 0) {
        return res.status(400).json({ error: 'Empty audio' });
      }

      const result = await transcribeWithGpt4o(pcm, { sampleRate, channels });
      const transcript = result.text.trim();
      console.log('[Voice] transcribe-audio — gpt-4o transcript length:', transcript.length);

      res.json({ transcript });
    } catch (error) {
      console.error('[Voice] transcribe-audio error:', error);
      res.status(500).json({
        error: 'Failed to transcribe audio',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

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
