import { useState, useCallback, useRef, useEffect } from 'react';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import { Audio } from 'expo-av';
import { apiService, AuthError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { GeoPoint } from '../types';

interface TranscriptionState {
  status: 'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error';
  partialTranscript: string;
  finalTranscript: string;
  duration: number;
  error: string | null;
  savedObjectIds: string[];
}

interface UseDeepgramTranscriptionReturn extends TranscriptionState {
  startRecording: (location?: GeoPoint) => Promise<void>;
  stopRecording: () => Promise<void>;
  reset: () => void;
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
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioSubscriptionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const locationRef = useRef<GeoPoint | undefined>(undefined);
  const finalTranscriptRef = useRef<string>('');
  const partialTranscriptRef = useRef<string>('');
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

      // ── 1. Auth check ──────────────────────────────────────────────────
      const storedToken = await apiService.getStoredToken();
      console.log('[Recording] auth token present:', !!storedToken,
        storedToken ? `length=${storedToken.length}` : '(null)');
      if (!storedToken) {
        throw new AuthError('Not authenticated — please log in again');
      }

      // ── 2. Microphone permission ────────────────────────────────────────
      const { status } = await Audio.requestPermissionsAsync();
      console.log('[Recording] microphone permission:', status);
      if (status !== 'granted') {
        throw new Error('Microphone permission not granted');
      }

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      console.log('[Recording] audio mode set');

      // ── 3. Deepgram token fetch ────────────────────────────────────────
      console.log('[Recording] fetching Deepgram token from backend...');
      let token: string;
      try {
        const result = await apiService.getDeepgramToken();
        token = result.token;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[Recording] Deepgram token fetch failed:', detail);
        throw new Error(`Voice service unavailable — ${detail}`);
      }
      if (!token) {
        console.error('[Recording] Deepgram token is empty');
        throw new Error('Voice service unavailable. Please try again later.');
      }
      console.log('[Recording] Deepgram token received, length:', token.length);

      // ── 4. Deepgram WebSocket connection ───────────────────────────────
      const deepgramUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&punctuate=true&interim_results=true`;
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
          if (event.type === 'microphone' && wsRef.current?.readyState === WebSocket.OPEN) {
            const data = typeof event.data === 'string' ? event.data : '';
            if (data) {
              const arrayBuffer = base64ToArrayBuffer(data);
              wsRef.current.send(arrayBuffer);
            }
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

      setState(prev => ({
        ...prev,
        status: 'recording',
        partialTranscript: '',
        finalTranscript: '',
        duration: 0,
      }));

      console.log('[Recording] recording started successfully');
    } catch (error) {
      console.error('[Recording] startRecording failed:', error instanceof Error ? error.message : error);
      handleAuthError(error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start recording',
      }));
    }
  }, [handleAuthError]);

  const stopRecording = useCallback(async () => {
    console.log('[Recording] stopRecording called');

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

    setState(prev => ({
      ...prev,
      status: 'processing',
      duration: finalDuration,
      finalTranscript: transcript,
      partialTranscript: '',
    }));

    // ── 6. Save transcript to backend ─────────────────────────────────
    if (transcript.trim()) {
      try {
        console.log('[Recording] saving transcript to backend...');
        const result = await apiService.saveTranscript({
          transcript,
          duration: finalDuration,
          location: locationRef.current,
        });

        console.log('[Recording] transcript saved — sessionId:', result.sessionId,
          '— objectCount:', result.objectCount);

        setState(prev => ({
          ...prev,
          status: 'done',
          savedObjectIds: result.objectIds,
        }));
      } catch (error) {
        console.error('[Recording] saveTranscript failed:', error instanceof Error ? error.message : error);
        handleAuthError(error);
        setState(prev => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to save transcript',
        }));
      }
    } else {
      console.log('[Recording] empty transcript — skipping save');
      setState(prev => ({
        ...prev,
        status: 'done',
        savedObjectIds: [],
      }));
    }
  }, [handleAuthError]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      partialTranscript: '',
      finalTranscript: '',
      duration: 0,
      error: null,
      savedObjectIds: [],
    });
    finalTranscriptRef.current = '';
    partialTranscriptRef.current = '';
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    reset,
  };
}
