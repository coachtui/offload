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
  stopRecording: (opts?: { onGeofencesNeeded?: (placeNames: string[]) => void }) => Promise<void>;
  reset: () => void;
  // Late-arriving location (fetched in parallel with startRecording) can be
  // handed to the hook after the fact; it's only read at save time, so this
  // just needs to land in locationRef before stopRecording runs.
  setRecordingLocation: (loc: GeoPoint) => void;
}

const KEEP_AWAKE_TAG = 'offload-recording';

// Deepgram token cache — the "token" is a static server key, so a short TTL is
// hygiene, not a security boundary. Prefetched on RecordScreen mount so the
// record tap never pays this round-trip.
const TOKEN_TTL_MS = 5 * 60 * 1000;
let cachedToken: { token: string; keywords: string[]; fetchedAt: number } | null = null;

async function fetchDeepgramToken(): Promise<{ token: string; keywords: string[] }> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  const result = await apiService.getDeepgramToken();
  if (result.token) {
    cachedToken = { token: result.token, keywords: result.keywords ?? [], fetchedAt: Date.now() };
    return cachedToken;
  }
  return { token: result.token, keywords: result.keywords ?? [] };
}

export function prefetchDeepgramToken(): void {
  fetchDeepgramToken().catch(() => {}); // best-effort; startRecording refetches on miss
}

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

  // Re-entrancy guards: a second tap while start/stop is still running is ignored,
  // so the single-slot refs (audioSubscriptionRef, durationIntervalRef, wsRef) can't
  // be clobbered by a duplicate in-flight sequence.
  const startInFlightRef = useRef<boolean>(false);
  const stopInFlightRef = useRef<boolean>(false);

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
      // Invalidate the session FIRST so a connectDeepgram completing after
      // unmount hits the session-mismatch branch and closes its own socket,
      // instead of assigning wsRef on an unmounted hook.
      sessionIdRef.current += 1;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioSubscriptionRef.current) {
        audioSubscriptionRef.current.remove();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
    };
  }, []);

  const startRecording = useCallback(async (location?: GeoPoint) => {
    // Re-entrancy guard BEFORE the session increment: a duplicate tap must not
    // bump the session counter (that would invalidate the first call's in-flight
    // Deepgram connect) and must not run a second mic/timer/keep-awake sequence.
    if (startInFlightRef.current) {
      console.log('[Recording] startRecording already in flight — ignoring duplicate call');
      return;
    }
    if (audioSubscriptionRef.current) {
      console.log('[Recording] startRecording called while a session is already active — ignoring');
      return;
    }
    startInFlightRef.current = true;
    console.log('[Recording] startRecording called');
    const session = ++sessionIdRef.current;
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

      // ── 3. Microphone stream start ──────────────────────────────────────
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

      // ── 4. Deepgram connect — network I/O happens after the mic is live,
      // in parallel. Live captions are best-effort: any failure here just
      // means no live preview, the raw audio is still captured above for
      // the final gpt-4o-transcribe pass at stop.
      const connectDeepgram = async (): Promise<void> => {
        // ── Deepgram token fetch ───────────────────────────────────────
        console.log('[Recording] fetching Deepgram token from backend...');
        let token: string;
        let keywords: string[] = [];
        try {
          const result = await fetchDeepgramToken();
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

        // ── Deepgram WebSocket connection ───────────────────────────────
        // Nova-2 uses the `keywords` param; `keyterm` is Nova-3-only and Nova-2
        // rejects the WS handshake (error 8007) if keyterm params are present.
        const keywordParams = keywords.length > 0
          ? '&' + keywords.map(k => `keywords=${encodeURIComponent(k)}`).join('&')
          : '';
        // Stop (or unmount) already happened during the token fetch — skip the
        // handshake entirely rather than opening a socket we'll just discard.
        if (sessionIdRef.current !== session) {
          console.log('[Recording] session changed before Deepgram WebSocket open — skipping connect');
          return;
        }
        const deepgramUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&punctuate=true&smart_format=true&interim_results=true&endpointing=500&filler_words=false${keywordParams}`;
        console.log('[Recording] connecting to Deepgram...');
        const ws = new WebSocket(deepgramUrl, ['token', token]);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Deepgram connection timeout after 10s'));
          }, 10000);

          ws.onopen = () => {
            clearTimeout(timeout);
            console.log('[Recording] Deepgram WebSocket open');
            resolve();
          };

          ws.onerror = (event) => {
            clearTimeout(timeout);
            ws.close();
            console.error('[Recording] Deepgram WebSocket error on open:', event);
            reject(new Error('Failed to connect to Deepgram'));
          };
        });

        // A stop (or a newer startRecording) happened while we were connecting —
        // discard this socket so it doesn't leak into a stale session.
        if (sessionIdRef.current !== session) {
          console.log('[Recording] session changed during Deepgram connect — discarding socket');
          ws.close();
          return;
        }

        wsRef.current = ws;

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

        // Flush chunks captured while connecting, in order. Synchronous loop —
        // live sends can't interleave until this handler returns.
        for (const chunk of audioChunksRef.current) {
          ws.send(base64ToArrayBuffer(chunk));
        }
        console.log(`[Recording] Deepgram open — flushed ${audioChunksRef.current.length} buffered chunks`);
      };

      // Live-caption socket connects in parallel — capture is already running.
      connectDeepgram().catch((err) => {
        console.warn('[Recording] Deepgram connect failed — continuing without live captions:', err);
      });
    } catch (error) {
      try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
      console.error('[Recording] startRecording failed:', error instanceof Error ? error.message : error);
      handleAuthError(error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start recording',
      }));
    } finally {
      // Covers both the success-path end and the outer catch: every exit of
      // startRecording clears the re-entrancy guard.
      startInFlightRef.current = false;
    }
  }, [handleAuthError]);

  const stopRecording = useCallback(async (opts?: { onGeofencesNeeded?: (placeNames: string[]) => void }) => {
    // Re-entrancy guard: a double-tap-stop's second call returns immediately so the
    // CloseStream flush, state transition, and save pipeline run exactly once.
    if (stopInFlightRef.current) {
      console.log('[Recording] stopRecording already in flight — ignoring duplicate call');
      return;
    }
    stopInFlightRef.current = true;
    console.log('[Recording] stopRecording called');
    // Invalidate the session synchronously so an in-flight connectDeepgram that opens
    // AFTER this stop hits its session-mismatch branch, closes the socket, and never
    // assigns wsRef (otherwise an early stop — wsRef still null — would skip WS cleanup
    // and the late socket would leak into the next session's shared refs). The captured
    // value also gates the background hint updates below; it replaces the old post-save
    // `++sessionIdRef.current`, whose extra increment would have wrongly invalidated the
    // NEXT session's in-flight connect.
    const stopSession = ++sessionIdRef.current;
    try {
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
          if (willEnhance) {
            // The user spoke (audio chunks exist) but both Deepgram and the
            // gpt-4o enhance pass produced nothing — don't lose this silently.
            console.log('[Recording] empty transcript after enhance — audio existed, notifying failure');
            setState(prev => ({ ...prev, status: 'done', savedObjectIds: [] }));
            await notifySaveResult({ ok: false });
          } else {
            console.log('[Recording] empty transcript — skipping save');
            setState(prev => ({ ...prev, status: 'done', savedObjectIds: [] }));
          }
          return;
        }

        // Only the save call itself may decide what the user is told. Everything
        // below it runs against a note that is already stored server-side, so a
        // failure there must never be reported as a lost note — that was the old
        // shape here, and it told the user their note was gone when it wasn't.
        let result: Awaited<ReturnType<typeof apiService.saveTranscript>>;
        try {
          console.log('[Recording] saving transcript to backend...');
          result = await apiService.saveTranscript({
            transcript: transcriptToSave,
            duration: finalDuration,
            location: locationRef.current,
            metadata: { transcriptionMethod },
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown error';
          console.error('[Recording] saveTranscript failed:', reason);
          handleAuthError(error);
          setState(prev => ({ ...prev, status: 'error', error: reason }));
          await notifySaveResult({ ok: false, reason });
          return;
        }

        console.log('[Recording] transcript stored — sessionId:', result.sessionId,
          '— status:', result.status ?? 'completed');

        setState(prev => ({
          ...prev,
          status: 'done',
          savedObjectIds: result.objectIds,
          relatedNotes: [],
          contradictions: [],
          hasGeofenceCandidates: result.hasGeofenceCandidates ?? false,
        }));

        // The server returns as soon as the transcript is durably stored and
        // sorts it in the background, so this confirmation is both immediate and
        // true at any recording length. The follow-up ("Sorted into 6 notes")
        // arrives as a push when the parse finishes; that push also carries the
        // geofence hand-off, which used to happen here off the save response.
        await notifySaveResult({ ok: true, title: transcriptToSave.slice(0, 60).trim() });

        // Only reachable against a server still running the old synchronous
        // contract — a deploy lag, or a rollback. Keep honouring it so the
        // arrival prompt is not silently dead in that window.
        if (result.status !== 'processing' && result.hasGeofenceCandidates) {
          try {
            opts?.onGeofencesNeeded?.(result.placeNames ?? []);
          } catch (err) {
            console.warn('[Recording] geofence hand-off failed (note is saved):', err);
          }
        }
      })();
    } finally {
      // Always clear the re-entrancy guard, even if any await above threw
      // (e.g. a WS send/close on a torn-down socket).
      stopInFlightRef.current = false;
    }
  }, [handleAuthError]);

  const setRecordingLocation = useCallback((loc: GeoPoint) => {
    locationRef.current = loc;
  }, []);

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
    setRecordingLocation,
  };
}
