/**
 * Voice session API routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import {
  startSession,
  stopSession,
  getSessionStatus,
  listUserSessions,
  isSessionActive,
} from '../services/voiceSessionService';
import { getAudioUrl, getSessionStorageStats } from '../services/storageService';

const router = Router();

// All voice routes require authentication
router.use(authenticate);

// Validation schemas
const startSessionSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
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
 * POST /api/v1/voice/sessions - Start a new voice session
 * Note: For real-time streaming, use WebSocket instead
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validationResult = startSessionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { deviceId, location, metadata } = validationResult.data;

    const session = await startSession(userId, {
      deviceId,
      location,
      metadata,
    });

    res.status(201).json({
      session: session.toVoiceSession(),
      message: 'Session started. Use WebSocket for audio streaming.',
      websocketUrl: `/ws/voice?token=YOUR_JWT_TOKEN`,
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({
      error: 'Failed to start session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions - List user's voice sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
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

    const result = await listUserSessions(userId, {
      status: statusFilter,
      limit,
      offset,
    });

    res.json({
      sessions: result.sessions.map((s) => s.toVoiceSession()),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions/:id - Get session status
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const status = await getSessionStatus(id);

    // Verify ownership
    if (status.session.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({
      session: status.session.toVoiceSession(),
      isActive: status.isActive,
      currentTranscript: status.currentTranscript,
      chunkCount: status.chunkCount,
      duration: status.duration,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Session not found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    console.error('Error getting session status:', error);
    res.status(500).json({
      error: 'Failed to get session status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/voice/sessions/:id/stop - Stop a voice session
 */
router.post('/sessions/:id/stop', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Check if session exists and is active
    if (!isSessionActive(id)) {
      // Try to get session to check ownership
      const status = await getSessionStatus(id);
      if (status.session.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(400).json({ error: 'Session is not active' });
    }

    const result = await stopSession(id);

    // Verify ownership
    if (result.session.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({
      session: result.session.toVoiceSession(),
      transcript: result.transcript,
      audioUrl: result.audioUrl,
      objectId: result.objectId,
    });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({
      error: 'Failed to stop session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions/:id/audio - Get audio playback URL
 */
router.get('/sessions/:id/audio', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const expiry = parseInt(req.query.expiry as string) || 3600;

    // Get session to verify ownership
    const status = await getSessionStatus(id);
    if (status.session.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (status.isActive) {
      return res.status(400).json({ error: 'Session is still recording' });
    }

    const audioUrl = await getAudioUrl(id, expiry);

    res.json({
      audioUrl,
      expiresIn: expiry,
    });
  } catch (error) {
    console.error('Error getting audio URL:', error);
    res.status(500).json({
      error: 'Failed to get audio URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/voice/sessions/:id/stats - Get session storage stats
 */
router.get('/sessions/:id/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Get session to verify ownership
    const status = await getSessionStatus(id);
    if (status.session.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const stats = await getSessionStorageStats(id);

    res.json({
      sessionId: id,
      totalSize: stats.totalSize,
      totalSizeFormatted: formatBytes(stats.totalSize),
      chunkCount: stats.chunkCount,
    });
  } catch (error) {
    console.error('Error getting session stats:', error);
    res.status(500).json({
      error: 'Failed to get session stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
