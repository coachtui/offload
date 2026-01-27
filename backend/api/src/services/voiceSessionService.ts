/**
 * Voice Session Service - manages voice recording sessions
 */

import { Session, SessionCreateInput } from '../models/Session';
import { createObject } from './objectService';
import { uploadAudioChunk, mergeAudioChunks, getAudioUrl } from './storageService';
import { StreamingTranscriber, TranscriptionResult } from './transcriptionService';
import { parseTranscript, checkMLServiceHealth } from './mlService';
import type { GeoPoint, TranscriptionChunk } from '@shared/types';

export interface ActiveSession {
  session: Session;
  transcriber: StreamingTranscriber;
  chunkIndex: number;
  fullTranscript: string;
  onTranscriptUpdate?: (chunk: TranscriptionChunk) => void;
  startTime: Date;
  lastActivityTime: Date;
}

// In-memory store for active sessions
const activeSessions = new Map<string, ActiveSession>();

// Session timeout (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Start a new voice recording session
 */
export async function startSession(
  userId: string,
  options: {
    deviceId: string;
    location?: GeoPoint;
    metadata?: Record<string, any>;
    onTranscriptUpdate?: (chunk: TranscriptionChunk) => void;
  }
): Promise<Session> {
  const sessionInput: SessionCreateInput = {
    userId,
    deviceId: options.deviceId,
    location: options.location,
    metadata: options.metadata,
  };

  const session = await Session.create(sessionInput);

  // Create streaming transcriber
  const transcriber = new StreamingTranscriber({
    onTranscript: (result, isFinal) => {
      handleTranscriptUpdate(session.id, result, isFinal, options.onTranscriptUpdate);
    },
  });

  // Store active session
  const activeSession: ActiveSession = {
    session,
    transcriber,
    chunkIndex: 0,
    fullTranscript: '',
    onTranscriptUpdate: options.onTranscriptUpdate,
    startTime: new Date(),
    lastActivityTime: new Date(),
  };

  activeSessions.set(session.id, activeSession);

  // Set timeout for session
  scheduleSessionTimeout(session.id);

  return session;
}

/**
 * Handle transcript updates
 */
function handleTranscriptUpdate(
  sessionId: string,
  result: TranscriptionResult,
  isFinal: boolean,
  callback?: (chunk: TranscriptionChunk) => void
): void {
  const activeSession = activeSessions.get(sessionId);
  if (!activeSession) return;

  // Append to full transcript
  if (result.text.trim()) {
    activeSession.fullTranscript += (activeSession.fullTranscript ? ' ' : '') + result.text;
  }

  // Notify via callback
  if (callback) {
    const chunk: TranscriptionChunk = {
      sessionId,
      chunkIndex: activeSession.chunkIndex,
      transcript: result.text,
      partial: !isFinal,
      timestamp: Date.now(),
    };
    callback(chunk);
  }
}

/**
 * Process incoming audio chunk
 */
export async function processAudioChunk(
  sessionId: string,
  audioData: Buffer
): Promise<void> {
  const activeSession = activeSessions.get(sessionId);
  if (!activeSession) {
    throw new Error('Session not found or not active');
  }

  console.log(`📦 Received audio chunk for session ${sessionId}: ${audioData.length} bytes`);

  // Update activity time
  activeSession.lastActivityTime = new Date();

  // Store chunk in MinIO (optional - fail gracefully if storage unavailable)
  try {
    await uploadAudioChunk(sessionId, activeSession.chunkIndex, audioData);
    activeSession.chunkIndex++;
  } catch (error) {
    console.warn(`Failed to upload audio chunk for session ${sessionId}:`, error instanceof Error ? error.message : 'Unknown error');
    // Continue without storage - session will still work
    activeSession.chunkIndex++;
  }

  // Add to transcriber buffer (optional - fail gracefully if Whisper unavailable)
  try {
    await activeSession.transcriber.addChunk(audioData);
  } catch (error) {
    console.warn(`Failed to transcribe audio chunk for session ${sessionId}:`, error instanceof Error ? error.message : 'Unknown error');
    // Continue without transcription - session will still be saved
  }
}

/**
 * Stop a voice session and finalize
 */
export async function stopSession(
  sessionId: string
): Promise<{
  session: Session;
  transcript: string;
  audioUrl: string;
  objectId?: string;
}> {
  const activeSession = activeSessions.get(sessionId);
  if (!activeSession) {
    throw new Error('Session not found or not active');
  }

  try {
    // Finalize transcription (process remaining buffer)
    await activeSession.transcriber.finalize();

    // Get final transcript
    const transcript = activeSession.fullTranscript || activeSession.transcriber.getFullTranscript();

    // Merge audio chunks into final file
    let audioUrl = '';
    try {
      await mergeAudioChunks(sessionId);
      audioUrl = await getAudioUrl(sessionId);
    } catch (error) {
      console.error('Failed to merge audio chunks:', error);
    }

    // Update session status
    const updatedSession = await activeSession.session.update({
      status: 'processing',
      metadata: {
        ...activeSession.session.metadata,
        transcript,
        duration: Date.now() - activeSession.startTime.getTime(),
        chunkCount: activeSession.chunkIndex,
      },
    });

    // Parse transcript into atomic objects using ML service if we have content
    let objectId: string | undefined;
    const objectIds: string[] = [];

    if (transcript.trim()) {
      try {
        // Check if ML service is available
        const mlServiceAvailable = await checkMLServiceHealth();

        if (mlServiceAvailable) {
          // Parse transcript with ML service
          console.log(`Parsing transcript for session ${sessionId} with ML service...`);

          const parseResult = await parseTranscript({
            transcript,
            userId: activeSession.session.userId,
            sessionId,
            location: activeSession.session.location,
            timestamp: activeSession.startTime,
          });

          console.log(
            `ML service parsed ${parseResult.atomicObjects.length} atomic objects in ${parseResult.processingTime}s`
          );

          // Create atomic objects from parsed results
          for (const parsedObject of parseResult.atomicObjects) {
            const object = await createObject(activeSession.session.userId, {
              content: parsedObject.content,
              category: parsedObject.category,
              source: {
                type: 'voice',
                recordingId: sessionId,
                location: activeSession.session.location,
              },
              metadata: {
                entities: parsedObject.entities,
                sentiment: parsedObject.sentiment,
                urgency: parsedObject.urgency,
                tags: parsedObject.tags,
              },
            });
            objectIds.push(object.id);
          }

          objectId = objectIds[0]; // For backwards compatibility
        } else {
          // Fallback: create single object with full transcript
          console.warn('ML service not available, falling back to simple object creation');

          const object = await createObject(activeSession.session.userId, {
            content: transcript,
            source: {
              type: 'voice',
              recordingId: sessionId,
              location: activeSession.session.location,
            },
          });
          objectId = object.id;
          objectIds.push(object.id);
        }

        // Update session with object references
        await updatedSession.update({
          status: 'completed',
          metadata: {
            ...updatedSession.metadata,
            objectId,
            objectIds,
            parsedCount: objectIds.length,
          },
        });
      } catch (error) {
        console.error('Failed to create atomic objects:', error);
        await updatedSession.update({ status: 'failed' });
      }
    } else {
      await updatedSession.update({ status: 'completed' });
    }

    // Clean up active session
    activeSessions.delete(sessionId);

    return {
      session: await Session.findById(sessionId) as Session,
      transcript,
      audioUrl,
      objectId,
    };
  } catch (error) {
    // Mark session as failed
    await activeSession.session.update({ status: 'failed' });
    activeSessions.delete(sessionId);
    throw error;
  }
}

/**
 * Get session status
 */
export async function getSessionStatus(
  sessionId: string
): Promise<{
  session: Session;
  isActive: boolean;
  currentTranscript?: string;
  chunkCount?: number;
  duration?: number;
}> {
  const activeSession = activeSessions.get(sessionId);

  if (activeSession) {
    return {
      session: activeSession.session,
      isActive: true,
      currentTranscript: activeSession.fullTranscript,
      chunkCount: activeSession.chunkIndex,
      duration: Date.now() - activeSession.startTime.getTime(),
    };
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  return {
    session,
    isActive: false,
  };
}

/**
 * List user sessions
 */
export async function listUserSessions(
  userId: string,
  options?: {
    status?: Session['status'];
    limit?: number;
    offset?: number;
  }
): Promise<{ sessions: Session[]; total: number }> {
  return Session.findByUserId(userId, options);
}

/**
 * Check if session is active
 */
export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

/**
 * Get active session for WebSocket handlers
 */
export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Schedule session timeout
 */
function scheduleSessionTimeout(sessionId: string): void {
  setTimeout(async () => {
    const activeSession = activeSessions.get(sessionId);
    if (activeSession) {
      const timeSinceActivity = Date.now() - activeSession.lastActivityTime.getTime();
      if (timeSinceActivity >= SESSION_TIMEOUT_MS) {
        console.log(`Session ${sessionId} timed out, stopping...`);
        try {
          await stopSession(sessionId);
        } catch (error) {
          console.error(`Failed to stop timed-out session ${sessionId}:`, error);
          activeSessions.delete(sessionId);
        }
      } else {
        // Reschedule
        scheduleSessionTimeout(sessionId);
      }
    }
  }, SESSION_TIMEOUT_MS);
}

/**
 * Clean up all active sessions (for graceful shutdown)
 */
export async function cleanupAllSessions(): Promise<void> {
  const sessionIds = Array.from(activeSessions.keys());
  for (const sessionId of sessionIds) {
    try {
      await stopSession(sessionId);
    } catch (error) {
      console.error(`Failed to cleanup session ${sessionId}:`, error);
    }
  }
}
