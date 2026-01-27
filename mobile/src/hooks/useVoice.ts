import { useState, useCallback, useEffect, useRef } from 'react';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import * as SecureStore from 'expo-secure-store';
import { Audio } from 'expo-av';
import { wsService } from '../services/websocket';
import { TranscriptionPayload } from '../types';

interface VoiceState {
  isRecording: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  currentSessionId: string | null;
  transcripts: TranscriptionPayload[];
  error: string | null;
}

interface UseVoiceReturn extends VoiceState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  clearTranscripts: () => void;
}

// Helper function to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useVoice(): UseVoiceReturn {
  const [state, setState] = useState<VoiceState>({
    isRecording: false,
    isConnected: false,
    isConnecting: false,
    currentSessionId: null,
    transcripts: [],
    error: null,
  });

  const audioSubscriptionRef = useRef<any>(null);

  useEffect(() => {
    const unsubConnect = wsService.onConnect(() => {
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
    });

    const unsubDisconnect = wsService.onDisconnect(() => {
      setState(prev => ({ ...prev, isConnected: false }));
    });

    const unsubTranscription = wsService.onTranscription((transcription) => {
      setState(prev => {
        // If partial, update the last transcript if it exists and was also partial
        if (transcription.partial && prev.transcripts.length > 0) {
          const lastTranscript = prev.transcripts[prev.transcripts.length - 1];
          if (lastTranscript.partial) {
            return {
              ...prev,
              transcripts: [
                ...prev.transcripts.slice(0, -1),
                transcription,
              ],
            };
          }
        }
        return {
          ...prev,
          transcripts: [...prev.transcripts, transcription],
        };
      });
    });

    const unsubMessage = wsService.onMessage((message: any) => {
      if (message.type === 'session_started' && message.sessionId) {
        setState(prev => ({
          ...prev,
          currentSessionId: message.sessionId,
        }));
      } else if (message.type === 'session_stopped') {
        setState(prev => ({
          ...prev,
          isRecording: false,
          currentSessionId: null,
        }));
      } else if (message.type === 'error') {
        console.error('WebSocket error message:', JSON.stringify(message));
        setState(prev => ({
          ...prev,
          error: message.message || message.code || 'Unknown error from server',
        }));
      }
    });

    const unsubError = wsService.onError((error) => {
      console.error('🔴 WebSocket error in useVoice:', error.message);
      setState(prev => ({
        ...prev,
        error: `WebSocket Error: ${error.message}`,
        isConnecting: false,
        isConnected: false
      }));
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubTranscription();
      unsubMessage();
      unsubError();

      // Clean up audio subscription on unmount
      if (audioSubscriptionRef.current) {
        audioSubscriptionRef.current.remove();
      }
    };
  }, []);

  const connectWebSocket = useCallback(async () => {
    const token = await SecureStore.getItemAsync('accessToken');
    console.log('📡 Retrieved token:', token ? `${token.substring(0, 20)}...` : 'null');
    if (!token) {
      const error = 'Not authenticated - please log in again';
      setState(prev => ({ ...prev, error, isConnecting: false }));
      throw new Error(error);
    }

    console.log('📡 Attempting WebSocket connection...');
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      await wsService.connect(token);
      console.log('✅ WebSocket connected successfully');
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to connect to server';
      setState(prev => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        error: message
      }));
      throw error;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 Starting recording...');

      // Request audio permissions
      console.log('🎤 Requesting audio permissions...');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Microphone permission not granted');
      }
      console.log('✅ Audio permissions granted');

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Connect to WebSocket if not connected
      if (!wsService.isConnected) {
        console.log('📡 WebSocket not connected, connecting...');
        await connectWebSocket();
      } else {
        console.log('✅ WebSocket already connected');
      }

      // Start WebSocket session
      console.log('📤 Sending start_session message...');
      wsService.startSession('mobile-device', {
        platform: 'mobile',
      });

      // Start microphone with streaming
      console.log('🎤 Starting audio stream...');
      const { recordingResult, subscription } = await ExpoPlayAudioStream.startMicrophone({
        sampleRate: 16000, // 16kHz is common for speech recognition
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 250, // Send chunks every 250ms
        enableProcessing: false,
        onAudioStream: async (event) => {
          // Only process microphone events (not recording events)
          if (event.type === 'microphone') {
            try {
              // Convert base64 to ArrayBuffer and send to WebSocket
              const data = typeof event.data === 'string' ? event.data : '';
              if (data) {
                const arrayBuffer = base64ToArrayBuffer(data);
                console.log(`📤 Sending audio chunk - Base64 length: ${data.length}, Buffer size: ${arrayBuffer.byteLength} bytes, eventDataSize: ${event.eventDataSize}`);
                wsService.sendAudioChunk(arrayBuffer);
              } else {
                console.warn('⚠️  Empty audio data received');
              }
            } catch (error) {
              console.error('❌ Failed to send audio chunk:', error);
            }
          }
        }
      });

      // Store the subscription so we can clean it up later
      audioSubscriptionRef.current = subscription;
      console.log('✅ Audio streaming started');

      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
        transcripts: [],
      }));
      console.log('✅ Recording started successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start recording';
      console.error('❌ Failed to start recording:', message);
      setState(prev => ({ ...prev, error: message, isRecording: false }));
      throw error;
    }
  }, [connectWebSocket]);

  const stopRecording = useCallback(async () => {
    console.log('🛑 Stopping recording...');

    try {
      // Clean up the subscription
      if (audioSubscriptionRef.current) {
        audioSubscriptionRef.current.remove();
        audioSubscriptionRef.current = null;
      }

      // Stop the microphone
      await ExpoPlayAudioStream.stopMicrophone();
      console.log('✅ Microphone stopped');
    } catch (stopError) {
      console.warn('stopMicrophone error:', stopError);
    }

    // Stop the WebSocket session
    console.log('📤 Sending stop_session...');
    wsService.stopSession();

    setState(prev => ({
      ...prev,
      isRecording: false,
      error: null,
    }));
  }, []);

  const clearTranscripts = useCallback(() => {
    setState(prev => ({ ...prev, transcripts: [] }));
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    clearTranscripts,
  };
}
