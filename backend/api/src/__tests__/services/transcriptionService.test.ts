/**
 * Unit tests for Transcription Service
 */

import {
  transcribeAudio,
  transcribeAudioFile,
  transcribeWithGpt4o,
  pcmToWav,
  StreamingTranscriber,
  testWhisperConnection,
  TranscriptionResult,
} from '../../services/transcriptionService';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock OpenAI. The service constructs `new OpenAI()` once at module load, so the
// mock must return a SINGLETON instance — otherwise mocks configured in tests
// would target a different object than the one the service actually uses. The
// singleton is created inside the (hoisted) factory to avoid a temporal-dead-zone
// error, then retrieved below after the service module is imported.
jest.mock('openai', () => {
  const instance = {
    audio: {
      transcriptions: {
        create: jest.fn(),
      },
    },
    models: {
      list: jest.fn(),
    },
  };
  const ctor: any = jest.fn(() => instance);
  // The service also imports the named `toFile` helper. Provide a lightweight
  // stand-in that just echoes the buffer so create() receives an upload object.
  ctor.toFile = jest.fn(async (data: any, name?: string) => ({ data, name }));
  return ctor;
});

// Retrieve the singleton the service is actually using.
const mockOpenAIInstance = (jest.requireMock('openai') as jest.Mock)();

beforeEach(() => {
  jest.clearAllMocks();
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

    it('should not leave temp files behind (uploads from buffer)', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });

      const audioBuffer = Buffer.from('mock audio data');
      await transcribeAudio(audioBuffer);

      // The buffer is uploaded directly via toFile — no whisper_ temp file is written.
      const tempFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('whisper_'));
      expect(tempFiles.length).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const audioBuffer = Buffer.from('mock audio data');

      await expect(transcribeAudio(audioBuffer)).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('pcmToWav', () => {
    it('prepends a valid 44-byte WAV header with default 16kHz mono 16-bit', () => {
      const pcm = Buffer.alloc(8000); // 0.25s of 16kHz/16-bit mono
      const wav = pcmToWav(pcm);

      expect(wav.length).toBe(44 + pcm.length);
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
      expect(wav.toString('ascii', 36, 40)).toBe('data');

      expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunk size
      expect(wav.readUInt16LE(20)).toBe(1); // PCM format
      expect(wav.readUInt16LE(22)).toBe(1); // channels
      expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
      expect(wav.readUInt32LE(28)).toBe(16000 * 2); // byte rate (mono 16-bit)
      expect(wav.readUInt16LE(32)).toBe(2); // block align
      expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
      expect(wav.readUInt32LE(40)).toBe(pcm.length); // data chunk size
    });

    it('honors custom sample rate and channel count', () => {
      const pcm = Buffer.alloc(100);
      const wav = pcmToWav(pcm, { sampleRate: 44100, channels: 2 });

      expect(wav.readUInt16LE(22)).toBe(2); // channels
      expect(wav.readUInt32LE(24)).toBe(44100); // sample rate
      expect(wav.readUInt32LE(28)).toBe(44100 * 2 * 2); // byte rate (stereo 16-bit)
      expect(wav.readUInt16LE(32)).toBe(4); // block align
    });

    it('preserves the original PCM bytes after the header', () => {
      const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
      const wav = pcmToWav(pcm);
      expect(wav.subarray(44)).toEqual(pcm);
    });
  });

  describe('transcribeWithGpt4o', () => {
    it('uses gpt-4o-transcribe with response_format json', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'clean transcript' });

      const result = await transcribeWithGpt4o(Buffer.alloc(1600));

      expect(result.text).toBe('clean transcript');
      expect(mockOpenAIInstance.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-transcribe',
          response_format: 'json',
        })
      );
      // Must NOT request verbose_json — gpt-4o-transcribe rejects it
      const callArg = mockOpenAIInstance.audio.transcriptions.create.mock.calls[0][0];
      expect(callArg.response_format).not.toBe('verbose_json');
    });

    it('throws on empty audio buffer', async () => {
      await expect(transcribeWithGpt4o(Buffer.alloc(0))).rejects.toThrow('Empty audio');
    });

    it('does not leave temp files behind (uploads from buffer)', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue({ text: 'x' });
      await transcribeWithGpt4o(Buffer.alloc(1600));

      const tempFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('gpt4o_'));
      expect(tempFiles.length).toBe(0);
    });

    it('propagates API errors so the caller can fall back', async () => {
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(new Error('API down'));
      await expect(transcribeWithGpt4o(Buffer.alloc(1600))).rejects.toThrow('API down');
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
