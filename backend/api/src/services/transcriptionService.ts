/**
 * Transcription Service using OpenAI Whisper API
 */

// Polyfill for File object (required for OpenAI SDK in Node < 20)
if (typeof globalThis.File === 'undefined') {
  const { File } = require('node:buffer');
  globalThis.File = File;
}

import OpenAI, { toFile } from 'openai';
import * as fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

// gpt-4o-transcribe is OpenAI's accuracy-focused STT model. It uses the same
// /audio/transcriptions endpoint as Whisper but ONLY supports response_format
// 'json' or 'text' — 'verbose_json'/segments are NOT supported and return an
// API error. We use it for the final saved transcript (Deepgram remains the
// real-time preview). See https://platform.openai.com/docs/guides/speech-to-text
const GPT4O_TRANSCRIBE_MODEL = process.env.GPT4O_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';

// OpenAI rejects audio files larger than 25MB. Guard below that with headroom.
const MAX_TRANSCRIBE_BYTES = 24 * 1024 * 1024;

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

/**
 * Transcribe audio buffer using Whisper API
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  options: {
    language?: string;
    prompt?: string;
    responseFormat?: 'json' | 'text' | 'verbose_json';
  } = {}
): Promise<TranscriptionResult> {
  // Build the upload directly from the buffer — no temp file or lazy ReadStream.
  const file = await toFile(audioBuffer, 'audio.webm');

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: options.language,
    prompt: options.prompt,
    response_format: options.responseFormat || 'verbose_json',
  });

  // Parse response based on format
  if (typeof transcription === 'string') {
    return { text: transcription };
  }

  const result: TranscriptionResult = {
    text: transcription.text,
    language: (transcription as any).language,
    duration: (transcription as any).duration,
  };

  // Extract segments if available (verbose_json format)
  if ((transcription as any).segments) {
    result.segments = (transcription as any).segments.map((seg: any) => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
    }));
  }

  return result;
}

/**
 * Transcribe audio from file path
 */
export async function transcribeAudioFile(
  filePath: string,
  options: {
    language?: string;
    prompt?: string;
  } = {}
): Promise<TranscriptionResult> {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: WHISPER_MODEL,
    language: options.language,
    prompt: options.prompt,
    response_format: 'verbose_json',
  });

  const result: TranscriptionResult = {
    text: transcription.text,
    language: (transcription as any).language,
    duration: (transcription as any).duration,
  };

  if ((transcription as any).segments) {
    result.segments = (transcription as any).segments.map((seg: any) => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
    }));
  }

  return result;
}

/**
 * Wrap raw little-endian PCM in a minimal 44-byte WAV (RIFF) header.
 *
 * The mobile client streams headerless `pcm_16bit` audio. OpenAI's transcription
 * endpoint only accepts container formats (wav, mp3, m4a, webm, …) and rejects
 * raw PCM, so we must add a header before upload. Defaults match the mobile
 * microphone config: 16kHz, mono, 16-bit.
 */
export function pcmToWav(
  pcm: Buffer,
  options: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {}
): Buffer {
  const sampleRate = options.sampleRate ?? 16000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;

  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4); // file size minus first 8 bytes
  header.write('WAVE', 8);
  // "fmt " sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = 1 (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  // "data" sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Transcribe raw PCM audio using gpt-4o-transcribe for the final saved transcript.
 *
 * Wraps the PCM in a WAV container, uploads to OpenAI, and returns clean text —
 * no keyterms, no priming prompt. Throws on oversized input or API failure so the
 * caller can fall back to the Deepgram transcript.
 */
export async function transcribeWithGpt4o(
  pcm: Buffer,
  options: { sampleRate?: number; channels?: number } = {}
): Promise<TranscriptionResult> {
  if (pcm.length === 0) {
    throw new Error('Empty audio buffer');
  }

  const wav = pcmToWav(pcm, options);
  if (wav.length > MAX_TRANSCRIBE_BYTES) {
    throw new Error(
      `Audio too large for transcription: ${wav.length} bytes (max ${MAX_TRANSCRIBE_BYTES})`
    );
  }

  // Build the upload directly from the buffer — no temp file or lazy ReadStream.
  const file = await toFile(wav, 'audio.wav', { type: 'audio/wav' });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: GPT4O_TRANSCRIBE_MODEL,
    // gpt-4o-transcribe only supports 'json' | 'text'. 'verbose_json' errors.
    response_format: 'json',
  });

  const text = typeof transcription === 'string' ? transcription : transcription.text;
  return { text: text ?? '' };
}

/**
 * Transcription stream handler for real-time processing
 * Accumulates audio chunks and transcribes when threshold is met
 */
export class StreamingTranscriber {
  private buffer: Buffer[] = [];
  private bufferSize = 0;
  private readonly chunkThreshold: number;
  private readonly onTranscript: (result: TranscriptionResult, isFinal: boolean) => void;
  private readonly contextPrompt?: string;
  private previousTranscripts: string[] = [];
  private isProcessing = false;

  constructor(options: {
    chunkThresholdBytes?: number;
    onTranscript: (result: TranscriptionResult, isFinal: boolean) => void;
    contextPrompt?: string;
  }) {
    // Default: ~5 seconds of audio at 16kHz mono (about 160KB)
    this.chunkThreshold = options.chunkThresholdBytes || 160000;
    this.onTranscript = options.onTranscript;
    this.contextPrompt = options.contextPrompt;
  }

  /**
   * Add audio chunk to buffer
   */
  async addChunk(chunk: Buffer): Promise<void> {
    this.buffer.push(chunk);
    this.bufferSize += chunk.length;

    // Check if we should transcribe
    if (this.bufferSize >= this.chunkThreshold && !this.isProcessing) {
      await this.processBuffer(false);
    }
  }

  /**
   * Process accumulated buffer
   */
  private async processBuffer(isFinal: boolean): Promise<void> {
    if (this.bufferSize === 0) return;

    this.isProcessing = true;

    try {
      const audioData = Buffer.concat(this.buffer);

      // Build context from previous transcripts
      const contextPrompt = this.previousTranscripts.length > 0
        ? `${this.contextPrompt || ''} Previous context: ${this.previousTranscripts.slice(-3).join(' ')}`
        : this.contextPrompt;

      const result = await transcribeAudio(audioData, {
        prompt: contextPrompt,
        responseFormat: 'verbose_json',
      });

      // Store for context
      if (result.text.trim()) {
        this.previousTranscripts.push(result.text);
      }

      // Clear buffer after successful transcription
      this.buffer = [];
      this.bufferSize = 0;

      this.onTranscript(result, isFinal);
    } catch (error) {
      console.error('Transcription error:', error);
      // Don't clear buffer on error, try again with next chunk
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Finalize transcription (process remaining buffer)
   */
  async finalize(): Promise<void> {
    if (this.bufferSize > 0) {
      await this.processBuffer(true);
    }
  }

  /**
   * Get full transcript from all segments
   */
  getFullTranscript(): string {
    return this.previousTranscripts.join(' ');
  }

  /**
   * Reset the transcriber state
   */
  reset(): void {
    this.buffer = [];
    this.bufferSize = 0;
    this.previousTranscripts = [];
    this.isProcessing = false;
  }
}

/**
 * Test Whisper API connection
 */
export async function testWhisperConnection(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not configured - transcription disabled');
    return false;
  }

  try {
    // Simple API check - list models
    const models = await openai.models.list();
    const hasWhisper = models.data.some((m) => m.id.includes('whisper'));
    if (hasWhisper) {
      console.log('✅ Whisper API connected');
    }
    return hasWhisper;
  } catch (error) {
    console.error('❌ Whisper API connection failed:', error);
    return false;
  }
}
