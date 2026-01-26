/**
 * Audio Format Validator
 * Validates audio data by checking magic bytes and format headers
 */

export interface AudioValidationResult {
  valid: boolean;
  format?: string;
  error?: string;
  details?: {
    mimeType: string;
    sampleRate?: number;
    channels?: number;
  };
}

// Magic bytes for common audio formats
const AUDIO_SIGNATURES: { name: string; mimeType: string; magic: number[]; offset?: number }[] = [
  // WebM (used for Opus audio)
  { name: 'webm', mimeType: 'audio/webm', magic: [0x1A, 0x45, 0xDF, 0xA3] },

  // OGG (Opus, Vorbis)
  { name: 'ogg', mimeType: 'audio/ogg', magic: [0x4F, 0x67, 0x67, 0x53] }, // "OggS"

  // WAV (RIFF header)
  { name: 'wav', mimeType: 'audio/wav', magic: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"

  // MP3 (ID3 header or sync word)
  { name: 'mp3', mimeType: 'audio/mpeg', magic: [0x49, 0x44, 0x33] }, // "ID3"
  { name: 'mp3', mimeType: 'audio/mpeg', magic: [0xFF, 0xFB] }, // Sync word
  { name: 'mp3', mimeType: 'audio/mpeg', magic: [0xFF, 0xFA] }, // Sync word
  { name: 'mp3', mimeType: 'audio/mpeg', magic: [0xFF, 0xF3] }, // Sync word
  { name: 'mp3', mimeType: 'audio/mpeg', magic: [0xFF, 0xF2] }, // Sync word

  // FLAC
  { name: 'flac', mimeType: 'audio/flac', magic: [0x66, 0x4C, 0x61, 0x43] }, // "fLaC"

  // AAC (ADTS header)
  { name: 'aac', mimeType: 'audio/aac', magic: [0xFF, 0xF1] },
  { name: 'aac', mimeType: 'audio/aac', magic: [0xFF, 0xF9] },

  // M4A (ftyp box)
  { name: 'm4a', mimeType: 'audio/mp4', magic: [0x00, 0x00, 0x00], offset: 0 },
];

// Supported formats for Whisper API
const WHISPER_SUPPORTED_FORMATS = ['webm', 'ogg', 'wav', 'mp3', 'flac', 'm4a', 'aac'];

// Maximum audio file size (25MB - Whisper API limit)
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

// Maximum chunk size for streaming (5MB per chunk)
const MAX_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Detect audio format from buffer by checking magic bytes
 */
export function detectAudioFormat(buffer: Buffer): string | null {
  if (buffer.length < 4) {
    return null;
  }

  for (const sig of AUDIO_SIGNATURES) {
    const offset = sig.offset || 0;
    if (buffer.length < offset + sig.magic.length) {
      continue;
    }

    let match = true;
    for (let i = 0; i < sig.magic.length; i++) {
      if (buffer[offset + i] !== sig.magic[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      // Special handling for M4A - check for ftyp
      if (sig.name === 'm4a') {
        if (buffer.length >= 8) {
          const ftypCheck = buffer.slice(4, 8).toString('ascii');
          if (ftypCheck === 'ftyp') {
            return 'm4a';
          }
        }
        continue;
      }
      return sig.name;
    }
  }

  return null;
}

/**
 * Get MIME type for audio format
 */
export function getMimeType(format: string): string {
  const sig = AUDIO_SIGNATURES.find(s => s.name === format);
  return sig?.mimeType || 'application/octet-stream';
}

/**
 * Validate audio data
 */
export function validateAudioData(
  buffer: Buffer,
  options: {
    allowedFormats?: string[];
    maxSizeBytes?: number;
    isChunk?: boolean;
  } = {}
): AudioValidationResult {
  const {
    allowedFormats = WHISPER_SUPPORTED_FORMATS,
    maxSizeBytes = options.isChunk ? MAX_CHUNK_SIZE_BYTES : MAX_AUDIO_SIZE_BYTES,
    isChunk = false,
  } = options;

  // Check buffer exists and has content
  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      error: 'Empty audio data',
    };
  }

  // Check size limit
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `Audio data exceeds maximum size (${Math.round(maxSizeBytes / 1024 / 1024)}MB)`,
    };
  }

  // For chunks, we may not have a complete header, so do minimal validation
  if (isChunk && buffer.length < 4) {
    // Small chunks are allowed for streaming
    return {
      valid: true,
      format: 'unknown',
      details: {
        mimeType: 'application/octet-stream',
      },
    };
  }

  // Detect format
  const format = detectAudioFormat(buffer);

  if (!format) {
    // For chunks in an active stream, we may receive partial data
    if (isChunk) {
      return {
        valid: true,
        format: 'unknown',
        details: {
          mimeType: 'application/octet-stream',
        },
      };
    }

    return {
      valid: false,
      error: 'Unrecognized audio format. Supported formats: ' + WHISPER_SUPPORTED_FORMATS.join(', '),
    };
  }

  // Check if format is allowed
  if (!allowedFormats.includes(format)) {
    return {
      valid: false,
      format,
      error: `Audio format "${format}" is not supported. Allowed formats: ${allowedFormats.join(', ')}`,
    };
  }

  return {
    valid: true,
    format,
    details: {
      mimeType: getMimeType(format),
    },
  };
}

/**
 * Parse WAV header for additional details
 */
export function parseWavHeader(buffer: Buffer): { sampleRate?: number; channels?: number } | null {
  if (buffer.length < 44) {
    return null;
  }

  // Check RIFF header
  if (buffer.slice(0, 4).toString('ascii') !== 'RIFF') {
    return null;
  }

  // Check WAVE format
  if (buffer.slice(8, 12).toString('ascii') !== 'WAVE') {
    return null;
  }

  // Find fmt chunk
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.slice(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      if (buffer.length >= offset + 24) {
        const channels = buffer.readUInt16LE(offset + 10);
        const sampleRate = buffer.readUInt32LE(offset + 12);
        return { channels, sampleRate };
      }
      break;
    }

    offset += 8 + chunkSize;
  }

  return null;
}

/**
 * Validate audio for Whisper API compatibility
 */
export function validateForWhisper(buffer: Buffer): AudioValidationResult {
  const baseValidation = validateAudioData(buffer, {
    allowedFormats: WHISPER_SUPPORTED_FORMATS,
    maxSizeBytes: MAX_AUDIO_SIZE_BYTES,
  });

  if (!baseValidation.valid) {
    return baseValidation;
  }

  // Additional checks for WAV files
  if (baseValidation.format === 'wav') {
    const wavDetails = parseWavHeader(buffer);
    if (wavDetails) {
      baseValidation.details = {
        ...baseValidation.details!,
        ...wavDetails,
      };
    }
  }

  return baseValidation;
}

/**
 * Validate streaming audio chunk
 */
export function validateAudioChunk(buffer: Buffer): AudioValidationResult {
  return validateAudioData(buffer, {
    isChunk: true,
    maxSizeBytes: MAX_CHUNK_SIZE_BYTES,
  });
}
