/**
 * WebSocket handler for voice streaming
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import { verifyToken } from '../auth/jwt';
import {
  startSession,
  processAudioChunk,
  stopSession,
  isSessionActive,
  getActiveSession,
} from '../services/voiceSessionService';
import {
  connectionLimiter,
  messageLimiter,
  sessionLimiter,
} from '../utils/rateLimiter';
import { validateAudioChunk } from '../utils/audioValidator';
import type { GeoPoint, TranscriptionChunk, WebSocketEvent } from '@shared/types';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  isAlive?: boolean;
}

// Message types from client
type ClientMessage =
  | { type: 'start_session'; deviceId: string; location?: GeoPoint; metadata?: Record<string, any> }
  | { type: 'audio_chunk'; data: string } // base64 encoded audio
  | { type: 'stop_session' }
  | { type: 'ping' };

// Message types to client
type ServerMessage =
  | { type: 'session_started'; sessionId: string }
  | { type: 'transcription'; chunk: TranscriptionChunk }
  | { type: 'session_stopped'; sessionId: string; transcript: string; audioUrl: string; objectId?: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' };

/**
 * Set up WebSocket server for voice streaming
 */
export function setupVoiceWebSocket(wss: WebSocketServer): void {
  // Connection handler
  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    // Get client IP for rate limiting
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                     req.socket.remoteAddress ||
                     'unknown';

    // Check connection rate limit
    const connectionCheck = connectionLimiter.check(clientIp);
    if (!connectionCheck.allowed) {
      ws.close(4029, `Rate limit exceeded. Retry after ${connectionCheck.retryAfter} seconds`);
      return;
    }

    // Authenticate connection
    const authenticated = await authenticateConnection(ws, req);
    if (!authenticated) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.isAlive = true;

    // Set up ping/pong for connection health
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Message handler
    ws.on('message', async (data: Buffer) => {
      try {
        // Check message rate limit
        if (ws.userId) {
          const messageCheck = messageLimiter.check(ws.userId);
          if (!messageCheck.allowed) {
            sendMessage(ws, {
              type: 'error',
              message: `Rate limit exceeded. Retry after ${messageCheck.retryAfter} seconds`,
              code: 'RATE_LIMITED',
            });
            return;
          }
        }

        // Check if this is binary audio data
        if (Buffer.isBuffer(data) && ws.sessionId && isSessionActive(ws.sessionId)) {
          await handleAudioData(ws, data);
          return;
        }

        // Otherwise, parse as JSON message
        const message = JSON.parse(data.toString()) as ClientMessage;
        await handleMessage(ws, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
        sendMessage(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Close handler
    ws.on('close', async () => {
      if (ws.sessionId && isSessionActive(ws.sessionId)) {
        try {
          await stopSession(ws.sessionId);
        } catch (error) {
          console.error('Error stopping session on disconnect:', error);
        }
      }
    });

    // Error handler
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Heartbeat interval to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
}

/**
 * Authenticate WebSocket connection via JWT token
 */
async function authenticateConnection(
  ws: AuthenticatedWebSocket,
  req: IncomingMessage
): Promise<boolean> {
  try {
    // Get token from query string or header
    const url = parseUrl(req.url || '', true);
    const token = (url.query.token as string) || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return false;
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return false;
    }

    ws.userId = payload.userId;
    return true;
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return false;
  }
}

/**
 * Handle incoming JSON messages
 */
async function handleMessage(ws: AuthenticatedWebSocket, message: ClientMessage): Promise<void> {
  if (!ws.userId) {
    sendMessage(ws, { type: 'error', message: 'Not authenticated', code: 'UNAUTHORIZED' });
    return;
  }

  switch (message.type) {
    case 'start_session':
      await handleStartSession(ws, message);
      break;

    case 'audio_chunk':
      await handleAudioChunk(ws, message);
      break;

    case 'stop_session':
      await handleStopSession(ws);
      break;

    case 'ping':
      sendMessage(ws, { type: 'pong' });
      break;

    default:
      sendMessage(ws, { type: 'error', message: 'Unknown message type' });
  }
}

/**
 * Handle session start request
 */
async function handleStartSession(
  ws: AuthenticatedWebSocket,
  message: { type: 'start_session'; deviceId: string; location?: GeoPoint; metadata?: Record<string, any> }
): Promise<void> {
  if (!ws.userId) return;

  // Check session creation rate limit
  const sessionCheck = sessionLimiter.check(ws.userId);
  if (!sessionCheck.allowed) {
    sendMessage(ws, {
      type: 'error',
      message: `Session rate limit exceeded. Retry after ${sessionCheck.retryAfter} seconds`,
      code: 'SESSION_RATE_LIMITED',
    });
    return;
  }

  // Check if already in a session
  if (ws.sessionId && isSessionActive(ws.sessionId)) {
    sendMessage(ws, { type: 'error', message: 'Already in a session', code: 'SESSION_ACTIVE' });
    return;
  }

  const session = await startSession(ws.userId, {
    deviceId: message.deviceId,
    location: message.location,
    metadata: message.metadata,
    onTranscriptUpdate: (chunk) => {
      sendMessage(ws, { type: 'transcription', chunk });
    },
  });

  ws.sessionId = session.id;

  sendMessage(ws, {
    type: 'session_started',
    sessionId: session.id,
  });
}

/**
 * Handle audio chunk (base64 encoded)
 */
async function handleAudioChunk(
  ws: AuthenticatedWebSocket,
  message: { type: 'audio_chunk'; data: string }
): Promise<void> {
  if (!ws.sessionId || !isSessionActive(ws.sessionId)) {
    sendMessage(ws, { type: 'error', message: 'No active session', code: 'NO_SESSION' });
    return;
  }

  const audioBuffer = Buffer.from(message.data, 'base64');

  // Validate audio chunk
  const validation = validateAudioChunk(audioBuffer);
  if (!validation.valid) {
    sendMessage(ws, {
      type: 'error',
      message: validation.error || 'Invalid audio data',
      code: 'INVALID_AUDIO',
    });
    return;
  }

  await processAudioChunk(ws.sessionId, audioBuffer);
}

/**
 * Handle raw binary audio data
 */
async function handleAudioData(ws: AuthenticatedWebSocket, data: Buffer): Promise<void> {
  if (!ws.sessionId) return;

  // Validate audio chunk
  const validation = validateAudioChunk(data);
  if (!validation.valid) {
    sendMessage(ws, {
      type: 'error',
      message: validation.error || 'Invalid audio data',
      code: 'INVALID_AUDIO',
    });
    return;
  }

  try {
    await processAudioChunk(ws.sessionId, data);
  } catch (error) {
    console.error('Error processing audio chunk:', error);
    sendMessage(ws, {
      type: 'error',
      message: 'Failed to process audio',
      code: 'AUDIO_ERROR',
    });
  }
}

/**
 * Handle session stop request
 */
async function handleStopSession(ws: AuthenticatedWebSocket): Promise<void> {
  if (!ws.sessionId || !isSessionActive(ws.sessionId)) {
    sendMessage(ws, { type: 'error', message: 'No active session', code: 'NO_SESSION' });
    return;
  }

  const result = await stopSession(ws.sessionId);

  sendMessage(ws, {
    type: 'session_stopped',
    sessionId: ws.sessionId,
    transcript: result.transcript,
    audioUrl: result.audioUrl,
    objectId: result.objectId,
  });

  ws.sessionId = undefined;
}

/**
 * Send message to client
 */
function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast to all authenticated clients (for future use)
 */
export function broadcastEvent(wss: WebSocketServer, event: WebSocketEvent): void {
  wss.clients.forEach((client: AuthenticatedWebSocket) => {
    if (client.readyState === WebSocket.OPEN && client.userId) {
      client.send(JSON.stringify(event));
    }
  });
}
