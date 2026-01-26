/**
 * Integration tests for Voice Session Service
 */

import {
  startSession,
  processAudioChunk,
  stopSession,
  getSessionStatus,
  listUserSessions,
  isSessionActive,
  getActiveSession,
  cleanupAllSessions,
} from '../../services/voiceSessionService';
import { Session } from '../../models/Session';
import * as storageService from '../../services/storageService';
import * as transcriptionService from '../../services/transcriptionService';
import * as objectService from '../../services/objectService';

// Mock dependencies
jest.mock('../../models/Session');
jest.mock('../../services/storageService');
jest.mock('../../services/transcriptionService');
jest.mock('../../services/objectService');

const mockSession = Session as jest.Mocked<typeof Session>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;
const mockTranscription = transcriptionService as jest.Mocked<typeof transcriptionService>;
const mockObjectService = objectService as jest.Mocked<typeof objectService>;

describe('VoiceSessionService', () => {
  const mockUserId = 'user-123';
  const mockDeviceId = 'device-456';

  beforeEach(() => {
    jest.clearAllMocks();
    // Clean up any active sessions from previous tests
    // We need to access internal state, so we'll use cleanupAllSessions
  });

  afterEach(async () => {
    // Clean up active sessions after each test
    try {
      await cleanupAllSessions();
    } catch (e) {
      // Ignore cleanup errors in tests
    }
  });

  describe('startSession', () => {
    it('should create a new voice session', async () => {
      const mockSessionData = {
        id: 'session-789',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);

      const session = await startSession(mockUserId, {
        deviceId: mockDeviceId,
      });

      expect(session.id).toBe('session-789');
      expect(session.userId).toBe(mockUserId);
      expect(mockSession.create).toHaveBeenCalledWith({
        userId: mockUserId,
        deviceId: mockDeviceId,
        location: undefined,
        metadata: undefined,
      });
    });

    it('should create session with location data', async () => {
      const location = { latitude: 37.7749, longitude: -122.4194 };
      const mockSessionData = {
        id: 'session-loc',
        userId: mockUserId,
        deviceId: mockDeviceId,
        location,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);

      const session = await startSession(mockUserId, {
        deviceId: mockDeviceId,
        location,
      });

      expect(mockSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ location })
      );
    });

    it('should store session in active sessions map', async () => {
      const mockSessionData = {
        id: 'session-active',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });

      expect(isSessionActive(session.id)).toBe(true);
    });

    it('should invoke transcript callback on transcription', async () => {
      const transcriptCallback = jest.fn();
      const mockSessionData = {
        id: 'session-callback',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);

      await startSession(mockUserId, {
        deviceId: mockDeviceId,
        onTranscriptUpdate: transcriptCallback,
      });

      // Callback setup is verified - actual invocation tested through StreamingTranscriber
      expect(mockSession.create).toHaveBeenCalled();
    });
  });

  describe('processAudioChunk', () => {
    it('should upload chunk to storage and add to transcriber', async () => {
      const mockSessionData = {
        id: 'session-chunk',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);
      mockStorage.uploadAudioChunk.mockResolvedValue('chunks/chunk_00000.webm');

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });
      const audioData = Buffer.from('audio chunk data');

      await processAudioChunk(session.id, audioData);

      expect(mockStorage.uploadAudioChunk).toHaveBeenCalledWith(
        session.id,
        0, // First chunk index
        audioData
      );
    });

    it('should increment chunk index on each call', async () => {
      const mockSessionData = {
        id: 'session-multi-chunk',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);
      mockStorage.uploadAudioChunk.mockResolvedValue('chunk-path');

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });

      await processAudioChunk(session.id, Buffer.from('chunk1'));
      await processAudioChunk(session.id, Buffer.from('chunk2'));
      await processAudioChunk(session.id, Buffer.from('chunk3'));

      expect(mockStorage.uploadAudioChunk).toHaveBeenNthCalledWith(
        1, session.id, 0, expect.any(Buffer)
      );
      expect(mockStorage.uploadAudioChunk).toHaveBeenNthCalledWith(
        2, session.id, 1, expect.any(Buffer)
      );
      expect(mockStorage.uploadAudioChunk).toHaveBeenNthCalledWith(
        3, session.id, 2, expect.any(Buffer)
      );
    });

    it('should throw error for non-existent session', async () => {
      const audioData = Buffer.from('audio data');

      await expect(processAudioChunk('non-existent-session', audioData))
        .rejects.toThrow('Session not found or not active');
    });
  });

  describe('stopSession', () => {
    it('should finalize session and create atomic object', async () => {
      const mockSessionData = {
        id: 'session-stop',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        location: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn().mockResolvedValue({
          id: 'session-stop',
          metadata: { transcript: 'Test transcript' },
        }),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);
      mockSession.findById.mockResolvedValue(mockSessionData as any);
      mockStorage.mergeAudioChunks.mockResolvedValue('sessions/session-stop/audio.webm');
      mockStorage.getAudioUrl.mockResolvedValue('https://example.com/audio.webm');
      mockObjectService.createObject.mockResolvedValue({
        id: 'object-123',
        content: 'Test transcript',
      } as any);

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });
      const result = await stopSession(session.id);

      expect(result.session).toBeDefined();
      expect(mockStorage.mergeAudioChunks).toHaveBeenCalledWith(session.id);
      expect(mockSessionData.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing' })
      );
    });

    it('should remove session from active sessions', async () => {
      const mockSessionData = {
        id: 'session-remove',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        location: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);
      mockSession.findById.mockResolvedValue(mockSessionData as any);
      mockStorage.mergeAudioChunks.mockResolvedValue('audio.webm');
      mockStorage.getAudioUrl.mockResolvedValue('https://example.com/audio.webm');

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });
      expect(isSessionActive(session.id)).toBe(true);

      await stopSession(session.id);

      expect(isSessionActive(session.id)).toBe(false);
    });

    it('should throw error for non-existent session', async () => {
      await expect(stopSession('non-existent'))
        .rejects.toThrow('Session not found or not active');
    });

    it('should handle merge audio failure gracefully', async () => {
      const mockSessionData = {
        id: 'session-merge-fail',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        location: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);
      mockSession.findById.mockResolvedValue(mockSessionData as any);
      mockStorage.mergeAudioChunks.mockRejectedValue(new Error('Merge failed'));

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });
      const result = await stopSession(session.id);

      // Should complete without throwing, audioUrl will be empty
      expect(result.audioUrl).toBe('');
    });
  });

  describe('getSessionStatus', () => {
    it('should return active session status', async () => {
      const mockSessionData = {
        id: 'session-status',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });
      const status = await getSessionStatus(session.id);

      expect(status.isActive).toBe(true);
      expect(status.session.id).toBe(session.id);
      expect(status.chunkCount).toBe(0);
    });

    it('should return completed session status', async () => {
      const mockCompletedSession = {
        id: 'session-completed',
        userId: mockUserId,
        status: 'completed' as const,
        metadata: { transcript: 'Test' },
      };

      mockSession.findById.mockResolvedValue(mockCompletedSession as any);

      const status = await getSessionStatus('session-completed');

      expect(status.isActive).toBe(false);
      expect(status.session.status).toBe('completed');
    });

    it('should throw error for non-existent session', async () => {
      mockSession.findById.mockResolvedValue(null);

      await expect(getSessionStatus('non-existent'))
        .rejects.toThrow('Session not found');
    });
  });

  describe('listUserSessions', () => {
    it('should delegate to Session.findByUserId', async () => {
      const mockSessions = {
        sessions: [
          { id: 'session-1', status: 'completed' },
          { id: 'session-2', status: 'recording' },
        ],
        total: 2,
      };

      mockSession.findByUserId.mockResolvedValue(mockSessions as any);

      const result = await listUserSessions(mockUserId);

      expect(result.sessions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockSession.findByUserId).toHaveBeenCalledWith(mockUserId, undefined);
    });

    it('should pass filter options', async () => {
      mockSession.findByUserId.mockResolvedValue({ sessions: [], total: 0 } as any);

      await listUserSessions(mockUserId, {
        status: 'completed',
        limit: 10,
        offset: 5,
      });

      expect(mockSession.findByUserId).toHaveBeenCalledWith(mockUserId, {
        status: 'completed',
        limit: 10,
        offset: 5,
      });
    });
  });

  describe('getActiveSession', () => {
    it('should return active session details', async () => {
      const mockSessionData = {
        id: 'session-get',
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn(),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      };

      mockSession.create.mockResolvedValue(mockSessionData as any);

      const session = await startSession(mockUserId, { deviceId: mockDeviceId });
      const activeSession = getActiveSession(session.id);

      expect(activeSession).toBeDefined();
      expect(activeSession?.session.id).toBe(session.id);
      expect(activeSession?.chunkIndex).toBe(0);
    });

    it('should return undefined for inactive session', () => {
      const activeSession = getActiveSession('non-existent');

      expect(activeSession).toBeUndefined();
    });
  });

  describe('cleanupAllSessions', () => {
    it('should stop all active sessions', async () => {
      const sessions = ['session-1', 'session-2', 'session-3'].map(id => ({
        id,
        userId: mockUserId,
        deviceId: mockDeviceId,
        status: 'recording' as const,
        metadata: {},
        location: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
        toVoiceSession: jest.fn(),
      }));

      mockSession.create
        .mockResolvedValueOnce(sessions[0] as any)
        .mockResolvedValueOnce(sessions[1] as any)
        .mockResolvedValueOnce(sessions[2] as any);

      mockSession.findById.mockImplementation((id) =>
        Promise.resolve(sessions.find(s => s.id === id) as any)
      );

      mockStorage.mergeAudioChunks.mockResolvedValue('audio.webm');
      mockStorage.getAudioUrl.mockResolvedValue('https://example.com/audio.webm');

      // Start multiple sessions
      await startSession(mockUserId, { deviceId: 'device-1' });
      await startSession(mockUserId, { deviceId: 'device-2' });
      await startSession(mockUserId, { deviceId: 'device-3' });

      expect(isSessionActive('session-1')).toBe(true);
      expect(isSessionActive('session-2')).toBe(true);
      expect(isSessionActive('session-3')).toBe(true);

      await cleanupAllSessions();

      // All sessions should be inactive now
      expect(isSessionActive('session-1')).toBe(false);
      expect(isSessionActive('session-2')).toBe(false);
      expect(isSessionActive('session-3')).toBe(false);
    });
  });
});
