import { useState, useCallback, useRef, useEffect } from 'react';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { apiService, AuthError, RagSearchResult, ConflictItem } from '../services/api';
import { notifySaveResult } from '../services/saveNotification';
import { useAuth } from '../context/AuthContext';
import type { GeoPoint } from '../types';

interface TranscriptionState {
  status: 'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error';
  partialTranscript: string;
  finalTranscript: string;
  duration: number;
  error: string | null;
  savedObjectIds: string[];
  relatedNotes: RagSearchResult[];
  contradictions: ConflictItem[];
  // True when the saved note had location-triggered reminders — signals the UI to
  // re-fetch geofences after a brief delay so new server-side geofences are registered with the OS.
  hasGeofenceCandidates: boolean;
  // True while the gpt-4o-transcribe pass is in flight (the displayed Deepgram
  // text is about to be replaced with a higher-accuracy version).
  isEnhancing: boolean;
  // Which transcription produced the current finalTranscript. 'gpt-4o' once the
  // higher-accuracy result has been swapped in; 'deepgram' otherwise.
  transcriptionMethod: 'deepgram' | 'gpt-4o' | null;
}

interface UseDeepgramTranscriptionReturn extends TranscriptionState {
  startRecording: (location?: GeoPoint) => Promise<void>;
  stopRecording: (opts?: { onGeofencesNeeded?: () => void }) => Promise<void>;
  reset: () => void;
}

const KEEP_AWAKE_TAG = 'offload-recording';

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useDeepgramTranscription(): UseDeepgramTranscriptionReturn {
  const { handleAuthError } = useAuth();

  const [state, setState] = useState<TranscriptionState>({
    status: 'idle',
    partialTranscript: '',
    finalTranscript: '',
    duration: 0,
    error: null,
    savedObjectIds: [],
    relatedNotes: [],
    contradictions: [],
    hasGeofenceCandidates: false,
    isEnhancing: false,
    transcriptionMethod: null,
  });

  // Incremented on each new recording session so stale background calls don't update state
  const sessionIdRef = useRef<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioSubscriptionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const locationRef = useRef<GeoPoint | undefined>(undefined);
  const finalTranscriptRef = useRef<string>('');
  const partialTranscriptRef = useRef<string>('');
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Accumulated base64 raw-PCM chunks for the final gpt-4o-transcribe pass.
  // Deepgram gets these in real time for the live preview; we also keep them
  // here so the saved transcript can use higher-accuracy transcription.
  const audioChunksRef = useRef<string[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioSubscriptionRef.current) {
        audioSubscriptionRef.current.remove();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const startRecording = useCallback(async (location?: GeoPoint) => {
    console.log('[Recording] startRecording called');
    try {
      setState(prev => ({ ...prev, status: 'connecting', error: null }));
      locationRef.current = location;
      finalTranscriptRef.current = '';
      partialTranscriptRef.current = '';
      audioChunksRef.current = [];

      // ── 1. Auth check ──────────────────────────────────────────────────
      const storedToken = await apiService.getStoredToken();
      console.log('[Recording] auth token present:', !!storedToken,
        storedToken ? `length=${storedToken.length}` : '(null)');
      if (!storedToken) {
        throw new AuthError('Not authenticated — please log in again');
      }

      // ── 2. Microphone permission ────────────────────────────────────────
      const { granted } = await ExpoPlayAudioStream.requestPermissionsAsync();
      console.log('[Recording] microphone permission granted:', granted);
      if (!granted) {
        throw new Error('Microphone permission not granted');
      }

      // ── 3. Deepgram token fetch ────────────────────────────────────────
      console.log('[Recording] fetching Deepgram token from backend...');
      let token: string;
      let keywords: string[] = [];
      try {
        const result = await apiService.getDeepgramToken();
        token = result.token;
        keywords = result.keywords ?? [];
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[Recording] Deepgram token fetch failed:', detail);
        throw new Error(`Voice service unavailable — ${detail}`);
      }
      if (!token) {
        console.error('[Recording] Deepgram token is empty');
        throw new Error('Voice service unavailable. Please try again later.');
      }
      console.log('[Recording] Deepgram token received, length:', token.length, '— keywords:', keywords.length);

      // ── 4. Deepgram WebSocket connection ───────────────────────────────
      // Nova-2 uses the `keywords` param; `keyterm` is Nova-3-only and Nova-2
      // rejects the WS handshake (error 8007) if keyterm params are present.
      const keywordParams = keywords.length > 0
        ? '&' + keywords.map(k => `keywords=${encodeURIComponent(k)}`).join('&')
        : '';
      const deepgramUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&punctuate=true&smart_format=true&interim_results=true&endpointing=500&filler_words=false${keywordParams}`;
      console.log('[Recording] connecting to Deepgram...');
      const ws = new WebSocket(deepgramUrl, ['token', token]);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Deepgram connection timeout after 10s'));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[Recording] Deepgram WebSocket open');
          resolve();
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          console.error('[Recording] Deepgram WebSocket error on open:', event);
          reject(new Error('Failed to connect to Deepgram'));
        };
      });

      // Handle Deepgram messages
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const transcript = data.channel.alternatives[0].transcript;
            const isFinal = data.is_final;

            if (transcript) {
              if (isFinal) {
                finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + transcript;
                partialTranscriptRef.current = '';
                console.log('[Recording] Deepgram final segment, total length:', finalTranscriptRef.current.length);
                setState(prev => ({
                  ...prev,
                  finalTranscript: finalTranscriptRef.current,
                  partialTranscript: '',
                }));
              } else {
                partialTranscriptRef.current = transcript;
                setState(prev => ({
                  ...prev,
                  partialTranscript: transcript,
                }));
              }
            }
          }
        } catch (error) {
          console.error('[Recording] Error parsing Deepgram message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('[Recording] Deepgram WebSocket closed:', event.code, event.reason);
      };

      ws.onerror = (event) => {
        console.error('[Recording] Deepgram WebSocket error (post-connect):', event);
        setState(prev => ({ ...prev, error: 'Deepgram connection error' }));
      };

      // ── 5. Microphone stream start ────────────────────────────────────
      console.log('[Recording] starting microphone stream...');
      const { subscription } = await ExpoPlayAudioStream.startMicrophone({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 250,
        enableProcessing: false,
        onAudioStream: async (event) => {
          const data = typeof event.data === 'string' ? event.data : '';
          if (!data) return;
          // Keep the raw PCM for the final gpt-4o-transcribe pass, regardless of
          // Deepgram socket state, so we never lose audio from the saved transcript.
          audioChunksRef.current.push(data);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const arrayBuffer = base64ToArrayBuffer(data);
            wsRef.current.send(arrayBuffer);
          }
        },
      });

      audioSubscriptionRef.current = subscription;
      startTimeRef.current = Date.now();
      console.log('[Recording] microphone streaming started');

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }, 1000);

      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

      setState(prev => ({
        ...prev,
        status: 'recording',
        partialTranscript: '',
        finalTranscript: '',
        duration: 0,
      }));

      console.log('[Recording] recording started successfully');
    } catch (error) {
      try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
      console.error('[Recording] startRecording failed:', error instanceof Error ? error.message : error);
      handleAuthError(error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start recording',
      }));
    }
  }, [handleAuthError]);

  const stopRecording = useCallback(async (opts?: { onGeofencesNeeded?: () => void }) => {
    console.log('[Recording] stopRecording called');
    try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop microphone
    if (audioSubscriptionRef.current) {
      audioSubscriptionRef.current.remove();
      audioSubscriptionRef.current = null;
    }

    try {
      await ExpoPlayAudioStream.stopMicrophone();
      console.log('[Recording] microphone stopped');
    } catch (error) {
      console.warn('[Recording] stopMicrophone error (may be normal):', error);
    }

    // Close Deepgram connection — send CloseStream first so Deepgram flushes
    // any buffered audio as a final transcript before we disconnect.
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        console.log('[Recording] sent CloseStream to Deepgram, waiting for flush...');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      // Null out handlers before intentional close so onerror doesn't fire and show a spurious error
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
      console.log('[Recording] Deepgram WebSocket closed');
    }

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    // Combine confirmed final segments with any remaining partial (for short recordings
    // where Deepgram may not have sent a final result before CloseStream).
    const partial = partialTranscriptRef.current;
    const transcript = finalTranscriptRef.current
      ? finalTranscriptRef.current + (partial ? ' ' + partial : '')
      : partial;
    console.log('[Recording] final transcript length:', transcript.length, '— duration:', finalDuration, 's');

    // Snapshot audio chunks before launching background work so the IIFE has a
    // stable reference even if audioChunksRef is cleared by reset().
    const audioChunks = audioChunksRef.current.slice();
    const willEnhance = audioChunks.length > 0;

    setState(prev => ({
      ...prev,
      status: 'processing',
      duration: finalDuration,
      finalTranscript: transcript,
      partialTranscript: '',
      isEnhancing: willEnhance,
      transcriptionMethod: 'deepgram',
    }));

    // ── Background: enhance → save → hint → notify ───────────────────────
    // stopRecording returns to the caller here. The save pipeline continues
    // asynchronously so the caller (RecordScreen) can navigate to Home immediately.
    void (async () => {
      // ── 6a. Higher-accuracy transcript via gpt-4o-transcribe ──────────
      // Deepgram's result is shown as the preview above. Now send the captured
      // raw audio for a more accurate transcript and swap it in when it returns.
      // Any failure (network, empty audio, API error) keeps the Deepgram text.
      let transcriptToSave = transcript;
      let transcriptionMethod: 'gpt-4o' | 'deepgram' = 'deepgram';
      if (willEnhance) {
        try {
          console.log('[Recording] requesting gpt-4o transcription —',
            audioChunks.length, 'chunks');
          const { transcript: gpt4oTranscript } = await apiService.transcribeAudio(
            audioChunks,
            { sampleRate: 16000, channels: 1 }
          );
          if (gpt4oTranscript && gpt4oTranscript.trim()) {
            transcriptToSave = gpt4oTranscript.trim();
            transcriptionMethod = 'gpt-4o';
            console.log('[Recording] gpt-4o transcript length:', transcriptToSave.length,
              '— swapping in for saved note');
            setState(prev => ({
              ...prev,
              finalTranscript: transcriptToSave,
              transcriptionMethod: 'gpt-4o',
            }));
          } else {
            console.log('[Recording] gpt-4o returned empty — keeping Deepgram transcript');
          }
        } catch (error) {
          console.warn('[Recording] gpt-4o transcription failed — keeping Deepgram transcript:',
            error instanceof Error ? error.message : error);
        } finally {
          setState(prev => ({ ...prev, isEnhancing: false }));
        }
      }

      // ── 6b. Save transcript to backend ─────────────────────────────────
      if (!transcriptToSave.trim()) {
        console.log('[Recording] empty transcript — skipping save');
        setState(prev => ({ ...prev, status: 'done', savedObjectIds: [] }));
        return;
      }

      try {
        console.log('[Recording] saving transcript to backend...');
        const result = await apiService.saveTranscript({
          transcript: transcriptToSave,
          duration: finalDuration,
          location: locationRef.current,
          metadata: { transcriptionMethod },
        });

        console.log('[Recording] transcript saved — sessionId:', result.sessionId,
          '— objectCount:', result.objectCount);

        const sessionId = ++sessionIdRef.current;

        // Trigger geofence re-sync if the saved note has location-triggered reminders.
        // Called here (after save, in the background) so it fires regardless of whether
        // RecordScreen is still mounted.
        if (result.hasGeofenceCandidates) {
          opts?.onGeofencesNeeded?.();
        }

        setState(prev => ({
          ...prev,
          status: 'done',
          savedObjectIds: result.objectIds,
          relatedNotes: [],
          contradictions: [],
          hasGeofenceCandidates: result.hasGeofenceCandidates ?? false,
        }));

        // ── Hint computation: contradiction check + related notes ──────
        // Run both in parallel for speed; apply contradiction hint first
        // (it takes priority over the related-notes hint).
        let hint: string | undefined;

        if (transcriptToSave.trim().length > 50) {
          const [contrSettled, ragSettled] = await Promise.allSettled([
            apiService.ragCheckContradictions(transcriptToSave, result.objectIds),
            apiService.ragSearch(transcriptToSave, { topK: 5, minScore: 0.6 }),
          ]);

          if (contrSettled.status === 'fulfilled' && contrSettled.value.hasConflict) {
            if (sessionIdRef.current === sessionId) {
              setState(prev => ({ ...prev, contradictions: contrSettled.value.conflicts }));
            }
            hint = '⚠️ may conflict with an earlier note';
          }

          if (!hint && ragSettled.status === 'fulfilled') {
            const related = (ragSettled.value.results ?? [])
              .filter((r) => !result.objectIds.includes(r.objectId))
              .slice(0, 3);
            if (related.length > 0) {
              if (sessionIdRef.current === sessionId) {
                setState(prev => ({ ...prev, relatedNotes: related }));
              }
              hint = `relates to ${related.length} earlier note${related.length === 1 ? '' : 's'}`;
            }
          }
        }

        await notifySaveResult({ ok: true, hint });

      } catch (error) {
        console.error('[Recording] saveTranscript failed:', error instanceof Error ? error.message : error);
        handleAuthError(error);
        setState(prev => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to save transcript',
        }));
        await notifySaveResult({ ok: false });
      }
    })();
  }, [handleAuthError]);

  const reset = useCallback(() => {
    sessionIdRef.current++; // invalidate any in-flight background calls
    setState({
      status: 'idle',
      partialTranscript: '',
      finalTranscript: '',
      duration: 0,
      error: null,
      savedObjectIds: [],
      relatedNotes: [],
      contradictions: [],
      hasGeofenceCandidates: false,
      isEnhancing: false,
      transcriptionMethod: null,
    });
    finalTranscriptRef.current = '';
    partialTranscriptRef.current = '';
    audioChunksRef.current = [];
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    reset,
  };
}
