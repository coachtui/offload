/**
 * Unit tests for Audio Validator
 */

import {
  detectAudioFormat,
  getMimeType,
  validateAudioData,
  validateAudioChunk,
  validateForWhisper,
  parseWavHeader,
} from '../../utils/audioValidator';

describe('AudioValidator', () => {
  describe('detectAudioFormat', () => {
    it('should detect WebM format', () => {
      // WebM magic bytes
      const webmBuffer = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x00, 0x00]);
      expect(detectAudioFormat(webmBuffer)).toBe('webm');
    });

    it('should detect OGG format', () => {
      // OGG magic bytes "OggS"
      const oggBuffer = Buffer.from([0x4F, 0x67, 0x67, 0x53, 0x00, 0x00]);
      expect(detectAudioFormat(oggBuffer)).toBe('ogg');
    });

    it('should detect WAV format', () => {
      // RIFF header for WAV
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
      expect(detectAudioFormat(wavBuffer)).toBe('wav');
    });

    it('should detect MP3 with ID3 header', () => {
      // ID3 tag
      const mp3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);
      expect(detectAudioFormat(mp3Buffer)).toBe('mp3');
    });

    it('should detect MP3 sync word', () => {
      // MP3 sync word
      const mp3Buffer = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
      expect(detectAudioFormat(mp3Buffer)).toBe('mp3');
    });

    it('should detect FLAC format', () => {
      // FLAC magic "fLaC"
      const flacBuffer = Buffer.from([0x66, 0x4C, 0x61, 0x43, 0x00]);
      expect(detectAudioFormat(flacBuffer)).toBe('flac');
    });

    it('should detect AAC format', () => {
      // AAC ADTS header
      const aacBuffer = Buffer.from([0xFF, 0xF1, 0x00, 0x00]);
      expect(detectAudioFormat(aacBuffer)).toBe('aac');
    });

    it('should detect M4A format', () => {
      // M4A ftyp box
      const m4aBuffer = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
      expect(detectAudioFormat(m4aBuffer)).toBe('m4a');
    });

    it('should return null for unknown format', () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(detectAudioFormat(unknownBuffer)).toBe(null);
    });

    it('should return null for buffer too small', () => {
      const smallBuffer = Buffer.from([0x1A, 0x45]);
      expect(detectAudioFormat(smallBuffer)).toBe(null);
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME type for webm', () => {
      expect(getMimeType('webm')).toBe('audio/webm');
    });

    it('should return correct MIME type for ogg', () => {
      expect(getMimeType('ogg')).toBe('audio/ogg');
    });

    it('should return correct MIME type for wav', () => {
      expect(getMimeType('wav')).toBe('audio/wav');
    });

    it('should return correct MIME type for mp3', () => {
      expect(getMimeType('mp3')).toBe('audio/mpeg');
    });

    it('should return octet-stream for unknown format', () => {
      expect(getMimeType('unknown')).toBe('application/octet-stream');
    });
  });

  describe('validateAudioData', () => {
    it('should validate valid WebM audio', () => {
      const webmBuffer = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, ...Array(100).fill(0)]);
      const result = validateAudioData(webmBuffer);

      expect(result.valid).toBe(true);
      expect(result.format).toBe('webm');
      expect(result.details?.mimeType).toBe('audio/webm');
    });

    it('should reject empty buffer', () => {
      const result = validateAudioData(Buffer.from([]));

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Empty');
    });

    it('should reject buffer exceeding size limit', () => {
      const largeBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB
      const result = validateAudioData(largeBuffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('should reject unrecognized format for non-chunks', () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, ...Array(100).fill(0)]);
      const result = validateAudioData(unknownBuffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unrecognized');
    });

    it('should respect custom allowed formats', () => {
      const webmBuffer = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, ...Array(100).fill(0)]);
      const result = validateAudioData(webmBuffer, { allowedFormats: ['wav', 'mp3'] });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });

  describe('validateAudioChunk', () => {
    it('should allow valid audio chunks', () => {
      const webmChunk = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, ...Array(100).fill(0)]);
      const result = validateAudioChunk(webmChunk);

      expect(result.valid).toBe(true);
    });

    it('should allow small chunks without header', () => {
      // Small chunk without recognizable header (continuation data)
      const continuationChunk = Buffer.from([0x00, 0x01]);
      const result = validateAudioChunk(continuationChunk);

      expect(result.valid).toBe(true);
      expect(result.format).toBe('unknown');
    });

    it('should reject oversized chunks', () => {
      const largeChunk = Buffer.alloc(6 * 1024 * 1024); // 6MB
      const result = validateAudioChunk(largeChunk);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });
  });

  describe('validateForWhisper', () => {
    it('should validate Whisper-compatible formats', () => {
      const formats = [
        { magic: [0x1A, 0x45, 0xDF, 0xA3], name: 'webm' },
        { magic: [0x4F, 0x67, 0x67, 0x53], name: 'ogg' },
        { magic: [0x66, 0x4C, 0x61, 0x43], name: 'flac' },
      ];

      for (const format of formats) {
        const buffer = Buffer.from([...format.magic, ...Array(100).fill(0)]);
        const result = validateForWhisper(buffer);
        expect(result.valid).toBe(true);
        expect(result.format).toBe(format.name);
      }
    });

    it('should reject files over 25MB', () => {
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024);
      largeBuffer[0] = 0x1A;
      largeBuffer[1] = 0x45;
      largeBuffer[2] = 0xDF;
      largeBuffer[3] = 0xA3;

      const result = validateForWhisper(largeBuffer);
      expect(result.valid).toBe(false);
    });
  });

  describe('parseWavHeader', () => {
    it('should parse valid WAV header', () => {
      // Minimal WAV header
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36, 4); // File size - 8
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16); // Chunk size
      wavHeader.writeUInt16LE(1, 20); // Audio format (PCM)
      wavHeader.writeUInt16LE(2, 22); // Channels
      wavHeader.writeUInt32LE(44100, 24); // Sample rate
      wavHeader.writeUInt32LE(176400, 28); // Byte rate
      wavHeader.writeUInt16LE(4, 32); // Block align
      wavHeader.writeUInt16LE(16, 34); // Bits per sample

      const result = parseWavHeader(wavHeader);

      expect(result).not.toBeNull();
      expect(result?.channels).toBe(2);
      expect(result?.sampleRate).toBe(44100);
    });

    it('should return null for invalid WAV', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const result = parseWavHeader(invalidBuffer);
      expect(result).toBeNull();
    });

    it('should return null for buffer too small', () => {
      const smallBuffer = Buffer.from('RIFF');
      const result = parseWavHeader(smallBuffer);
      expect(result).toBeNull();
    });

    it('should return null for non-WAVE format', () => {
      const buffer = Buffer.alloc(44);
      buffer.write('RIFF', 0);
      buffer.write('XXXX', 8); // Not WAVE

      const result = parseWavHeader(buffer);
      expect(result).toBeNull();
    });
  });
});
