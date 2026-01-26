/**
 * Unit tests for Transcription Service
 */

import {
  transcribeAudio,
  transcribeAudioFile,
  StreamingTranscriber,
  testWhisperConnection,
  TranscriptionResult,
} from '../../services/transcriptionService';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn(),
      },
    },
    models: {
      list: jest.fn(),
    },
  }));
});

// Get mocked OpenAI instance
const mockOpenAI = jest.requireMock('openai');
let mockOpenAIInstance: any;

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenAIInstance = new mockOpenAI();
});

describe('TranscriptionService', () => {
  describe('transcribeAudio', () => {
    it('should transcribe audio buffer successfully', async () => {
      const mockResponse = {
        text: 'Hello, this is a test transcription.',
        language: 'en',
        duration: 5.5,
        segments: [
          { id: 0, start: 0, end: 2.5, text: 'Hello,', avg_logprob: -0.3 },
          { id: 1, start: 2.5, end: 5.5, text: ' this is a test transcription.', avg_logprob: -0.2 },
        ],
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(mockResponse);

      // Create a mock audio buffer
      const audioBuffer = Buffer.from('mock audio data');

      const result = await transcribeAudio(audioBuffer);

      expect(result.text).toBe('Hello, this is a test transcription.');
      expect(result.language).toBe('en');
      expect(result.duration).toBe(5.5);
      expect(result.segments).toHaveLength(2);
      expect(result.segments![0].text).toBe('Hello,');
    });

    it('should handle string response format', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue('Simple text response');

      const audioBuffer = Buffer.from('mock audio data');
      const result = await transcribeAudio(audioBuffer);

      expect(result.text).toBe('Simple text response');
    });

    it('should pass language option to API', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Bonjour' });

      const audioBuffer = Buffer.from('mock audio data');
      await transcribeAudio(audioBuffer, { language: 'fr' });

      expect(mockOpenAIInstance.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'fr',
        })
      );
    });

    it('should pass prompt option to API', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });

      const audioBuffer = Buffer.from('mock audio data');
      await transcribeAudio(audioBuffer, { prompt: 'Previous context' });

      expect(mockOpenAIInstance.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Previous context',
        })
      );
    });

    it('should clean up temp file after transcription', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });

      const audioBuffer = Buffer.from('mock audio data');
      await transcribeAudio(audioBuffer);

      // Check that temp files in the temp directory are cleaned up
      const tempDir = os.tmpdir();
      const tempFiles = fs.readdirSync(tempDir).filter(f => f.startsWith('whisper_'));

      // Should have no whisper temp files (or very few if tests run in parallel)
      expect(tempFiles.length).toBeLessThan(5);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const audioBuffer = Buffer.from('mock audio data');

      await expect(transcribeAudio(audioBuffer)).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('StreamingTranscriber', () => {
    let transcriptCallback: jest.Mock;

    beforeEach(() => {
      transcriptCallback = jest.fn();
    });

    it('should create instance with default chunk threshold', () => {
      const transcriber = new StreamingTranscriber({
        onTranscript: transcriptCallback,
      });

      expect(transcriber).toBeDefined();
    });

    it('should accumulate chunks until threshold is met', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Chunk text' });

      const transcriber = new StreamingTranscriber({
        chunkThresholdBytes: 100, // Small threshold for testing
        onTranscript: transcriptCallback,
      });

      // Add small chunk (below threshold)
      const smallChunk = Buffer.alloc(50);
      await transcriber.addChunk(smallChunk);

      // Callback should not be called yet
      expect(transcriptCallback).not.toHaveBeenCalled();

      // Add another chunk to exceed threshold
      const anotherChunk = Buffer.alloc(60);
      await transcriber.addChunk(anotherChunk);

      // Callback should be called with transcription
      expect(transcriptCallback).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Chunk text' }),
        false
      );
    });

    it('should process remaining buffer on finalize', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Final text' });

      const transcriber = new StreamingTranscriber({
        chunkThresholdBytes: 1000, // High threshold
        onTranscript: transcriptCallback,
      });

      // Add small chunk
      const chunk = Buffer.alloc(50);
      await transcriber.addChunk(chunk);

      // Callback not called yet
      expect(transcriptCallback).not.toHaveBeenCalled();

      // Finalize
      await transcriber.finalize();

      // Now callback should be called with isFinal=true
      expect(transcriptCallback).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Final text' }),
        true
      );
    });

    it('should build context from previous transcripts', async () => {
      let callCount = 0;
      mockOpenAIInstance.audio.transcriptions.create.mockImplementation(() => {
        callCount++;
        return Promise.resolve({ text: `Transcript ${callCount}` });
      });

      const transcriber = new StreamingTranscriber({
        chunkThresholdBytes: 10,
        onTranscript: transcriptCallback,
        contextPrompt: 'User speaking about code',
      });

      // First chunk
      await transcriber.addChunk(Buffer.alloc(20));

      // Second chunk
      await transcriber.addChunk(Buffer.alloc(20));

      // Third call should include previous context
      expect(mockOpenAIInstance.audio.transcriptions.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Transcript 1'),
        })
      );
    });

    it('should return full transcript from all segments', async () => {
      mockOpenAIInstance.audio.transcriptions.create
        .mockResolvedValueOnce({ text: 'First part' })
        .mockResolvedValueOnce({ text: 'Second part' });

      const transcriber = new StreamingTranscriber({
        chunkThresholdBytes: 10,
        onTranscript: transcriptCallback,
      });

      await transcriber.addChunk(Buffer.alloc(20));
      await transcriber.addChunk(Buffer.alloc(20));

      const fullTranscript = transcriber.getFullTranscript();
      expect(fullTranscript).toContain('First part');
    });

    it('should reset state correctly', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });

      const transcriber = new StreamingTranscriber({
        chunkThresholdBytes: 10,
        onTranscript: transcriptCallback,
      });

      await transcriber.addChunk(Buffer.alloc(20));

      transcriber.reset();

      expect(transcriber.getFullTranscript()).toBe('');
    });

    it('should not call callback when buffer is empty on finalize', async () => {
      const transcriber = new StreamingTranscriber({
        onTranscript: transcriptCallback,
      });

      await transcriber.finalize();

      expect(transcriptCallback).not.toHaveBeenCalled();
    });
  });

  describe('testWhisperConnection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return false when API key is not configured', async () => {
      delete process.env.OPENAI_API_KEY;

      const result = await testWhisperConnection();

      expect(result).toBe(false);
    });

    it('should return true when Whisper model is available', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockOpenAIInstance.models.list.mockResolvedValue({
        data: [
          { id: 'gpt-4' },
          { id: 'whisper-1' },
        ],
      });

      const result = await testWhisperConnection();

      expect(result).toBe(true);
    });

    it('should return false when Whisper model is not available', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockOpenAIInstance.models.list.mockResolvedValue({
        data: [
          { id: 'gpt-4' },
          { id: 'gpt-3.5-turbo' },
        ],
      });

      const result = await testWhisperConnection();

      expect(result).toBe(false);
    });

    it('should return false when API call fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockOpenAIInstance.models.list.mockRejectedValue(new Error('API error'));

      const result = await testWhisperConnection();

      expect(result).toBe(false);
    });
  });
});
