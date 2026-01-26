import { useState, useCallback, useEffect } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
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

export function useVoice(): UseVoiceReturn {
  const [state, setState] = useState<VoiceState>({
    isRecording: false,
    isConnected: false,
    isConnecting: false,
    currentSessionId: null,
    transcripts: [],
    error: null,
  });

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

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
    };
  }, []);

  const connectWebSocket = useCallback(async () => {
    const token = await SecureStore.getItemAsync('accessToken');
    console.log('📡 Retrieved token:', token ? `${token.substring(0, 20)}...` : 'null');
    if (!token) {
      throw new Error('Not authenticated - please log in again');
    }

    console.log('📡 Attempting WebSocket connection...');
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      await wsService.connect(token);
      console.log('✅ WebSocket connected successfully');
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      throw error;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 Starting recording...');

      // Request permissions
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        throw new Error('Audio recording permission not granted');
      }
      console.log('✅ Audio permission granted');

      // Configure audio session for recording (required on iOS)
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      console.log('✅ Audio mode configured');

      // Connect to WebSocket if not connected
      if (!wsService.isConnected) {
        console.log('📡 WebSocket not connected, connecting...');
        await connectWebSocket();
      } else {
        console.log('✅ WebSocket already connected');
      }

      // Start recording
      console.log('🎤 Starting audio recorder...');
      await audioRecorder.record();
      console.log('✅ Audio recorder started');

      // Start WebSocket session
      console.log('📤 Sending start_session message...');
      wsService.startSession('mobile-device', {
        platform: 'mobile',
      });

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
  }, [connectWebSocket, audioRecorder]);

  const stopRecording = useCallback(async () => {
    // Stop recording - wrapped defensively for Expo Go compatibility
    console.log('Stopping recording...');

    try {
      await audioRecorder.stop();
    } catch (stopError) {
      console.warn('audioRecorder.stop() error (may be normal):', stopError);
    }

    const uri = audioRecorder.uri;
    console.log('Recording stopped, URI:', uri);

    // Try to send the audio file to the server (optional - may fail in Expo Go)
    if (uri) {
      try {
        console.log('Reading audio file from URI:', uri);
        const fullUri = uri.startsWith('file://') ? uri : `${Paths.cache.uri}/${uri}`;
        console.log('Full URI:', fullUri);
        const audioFile = new File(fullUri);
        const arrayBuffer = await audioFile.arrayBuffer();
        console.log('Sending audio chunk, size:', arrayBuffer.byteLength);
        wsService.sendAudioChunk(arrayBuffer);
      } catch (audioError) {
        console.warn('Could not read audio file (normal in Expo Go):', audioError);
      }
    }

    console.log('Sending stop_session...');
    wsService.stopSession();

    setState(prev => ({
      ...prev,
      isRecording: false,
      error: null,
    }));
  }, [audioRecorder]);

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
