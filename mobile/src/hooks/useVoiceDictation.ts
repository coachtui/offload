/**
 * Lean voice dictation: mic → Deepgram live stream → text. Used by the Ask
 * screen to speak a question. Deliberately contains NONE of the note-save
 * pipeline (background save, notifications, geofences, gpt-4o re-transcribe)
 * that lives in useDeepgramTranscription — that hook is the recording path;
 * this one only turns speech into a string.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { apiService } from '../services/api';

interface UseVoiceDictationReturn {
  isDictating: boolean;
  liveTranscript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<string>;
}

const KEEP_AWAKE_TAG = 'offload-dictation';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useVoiceDictation(): UseVoiceDictationReturn {
  const [isDictating, setIsDictating] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioSubscriptionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const finalRef = useRef('');
  const partialRef = useRef('');

  const composeTranscript = () =>
    finalRef.current +
    (partialRef.current ? (finalRef.current ? ' ' : '') + partialRef.current : '');

  const teardown = useCallback(async () => {
    if (audioSubscriptionRef.current) {
      audioSubscriptionRef.current.remove();
      audioSubscriptionRef.current = null;
    }
    try {
      await ExpoPlayAudioStream.stopMicrophone();
    } catch {}
    if (wsRef.current) {
      // Null out handlers before intentional close so onerror doesn't fire
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {}
  }, []);

  // Cleanup on unmount — never leave the mic or keep-awake wedged
  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    try {
      setError(null);
      finalRef.current = '';
      partialRef.current = '';
      setLiveTranscript('');

      const { granted } = await ExpoPlayAudioStream.requestPermissionsAsync();
      if (!granted) throw new Error('Microphone permission not granted');

      const { token, keywords = [] } = await apiService.getDeepgramToken();
      if (!token) throw new Error('Voice service unavailable. Please try again.');

      // Same nova-2 params as the recording flow (keyterm is Nova-3-only).
      const keywordParams =
        keywords.length > 0
          ? '&' + keywords.map((k) => `keywords=${encodeURIComponent(k)}`).join('&')
          : '';
      const url = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&punctuate=true&smart_format=true&interim_results=true&endpointing=500&filler_words=false${keywordParams}`;
      const ws = new WebSocket(url, ['token', token]);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Voice connection timeout')), 10000);
        ws.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to connect to voice service'));
        };
      });

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const transcript = data.channel.alternatives[0].transcript;
            if (!transcript) return;
            if (data.is_final) {
              finalRef.current += (finalRef.current ? ' ' : '') + transcript;
              partialRef.current = '';
            } else {
              partialRef.current = transcript;
            }
            setLiveTranscript(composeTranscript());
          }
        } catch {
          // Non-JSON frames are ignorable
        }
      };
      const failSession = (message: string) => {
        void teardown();
        activeRef.current = false;
        setIsDictating(false);
        setError(message);
      };
      ws.onerror = () => failSession('Voice connection error');
      ws.onclose = () => failSession('Voice connection lost');

      const { subscription } = await ExpoPlayAudioStream.startMicrophone({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 250,
        enableProcessing: false,
        onAudioStream: async (event: any) => {
          const data = typeof event.data === 'string' ? event.data : '';
          if (data && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(base64ToArrayBuffer(data));
          }
        },
      });
      audioSubscriptionRef.current = subscription;
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      setIsDictating(true);
    } catch (err) {
      await teardown();
      activeRef.current = false;
      setIsDictating(false);
      setError(err instanceof Error ? err.message : 'Could not start dictation');
    }
  }, [teardown]);

  const stop = useCallback(async (): Promise<string> => {
    // Stop the mic first so no new audio arrives, then let Deepgram flush
    // buffered audio as a final transcript before closing (proven pattern
    // from the recording flow).
    if (audioSubscriptionRef.current) {
      audioSubscriptionRef.current.remove();
      audioSubscriptionRef.current = null;
    }
    try {
      await ExpoPlayAudioStream.stopMicrophone();
    } catch {}
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (wsRef.current) {
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {}
    activeRef.current = false;
    setIsDictating(false);
    return composeTranscript().trim();
  }, []);

  return { isDictating, liveTranscript, error, start, stop };
}
