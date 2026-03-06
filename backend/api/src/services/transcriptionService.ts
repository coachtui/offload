/**
 * Transcription Service using OpenAI Whisper API
 */

// Polyfill for File object (required for OpenAI SDK in Node < 20)
if (typeof globalThis.File === 'undefined') {
  const { File } = require('node:buffer');
  globalThis.File = File;
}

import OpenAI from 'openai';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

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
  // Write buffer to temp file (OpenAI API requires file)
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `whisper_${Date.now()}.webm`);

  try {
    fs.writeFileSync(tempFile, audioBuffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
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
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
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
