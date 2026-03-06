import { WSClientMessage, WSServerMessage, TranscriptionPayload } from '../types';

type MessageHandler = (message: WSServerMessage) => void;
type TranscriptionHandler = (transcription: TranscriptionPayload) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Error) => void;

const WS_BASE_URL = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:3000';

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;

  private messageHandlers: Set<MessageHandler> = new Set();
  private transcriptionHandlers: Set<TranscriptionHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  connect(token: string, timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const url = `${WS_BASE_URL}/ws/voice?token=${token}`;
      this.ws = new WebSocket(url);

      let timeoutId: NodeJS.Timeout | null = null;
      let isResolved = false;

      // Set connection timeout
      timeoutId = setTimeout(() => {
        if (!isResolved && this.ws) {
          isResolved = true;
          console.error('❌ WebSocket connection timeout');
          this.ws.close();
          const error = new Error(`Connection timeout after ${timeout}ms. Check if backend server is running at ${WS_BASE_URL}`);
          this.errorHandlers.forEach(handler => handler(error));
          reject(error);
        }
      }, timeout);

      this.ws.onopen = () => {
        if (timeoutId) clearTimeout(timeoutId);
        isResolved = true;
        console.log('✅ WebSocket connected to:', url);
        this.reconnectAttempts = 0;
        this.startPingInterval();
        this.connectHandlers.forEach(handler => handler());
        resolve();
      };

      this.ws.onclose = (event: CloseEvent) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.log('❌ WebSocket closed:', event.code, event.reason);
        this.stopPingInterval();
        this.disconnectHandlers.forEach(handler => handler());

        // Only attempt reconnect if this wasn't a deliberate close
        if (!isResolved && event.code !== 1000) {
          isResolved = true;
          reject(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`));
        } else {
          this.attemptReconnect(token);
        }
      };

      this.ws.onerror = (event: Event) => {
        if (timeoutId) clearTimeout(timeoutId);
        console.error('❌ WebSocket error event:', event);
        console.error('❌ Failed to connect to:', url);
        console.error('❌ Check if backend server is running');

        if (!isResolved) {
          isResolved = true;
          const error = new Error(`Cannot connect to ${WS_BASE_URL}. Is the backend server running?`);
          this.errorHandlers.forEach(handler => handler(error));
          reject(error);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          console.log('WebSocket received:', event.data);
          const message: WSServerMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error, event.data);
        }
      };
    });
  }

  disconnect(): void {
    this.stopPingInterval();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect(token: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.connect(token).catch(() => {
        // Reconnection failed, will retry in onclose handler
      });
    }, delay);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(message: WSServerMessage): void {
    this.messageHandlers.forEach(handler => handler(message));

    // Server sends transcription as { type: 'transcription', chunk: {...} }
    const msg = message as any;
    if (message.type === 'transcription' && msg.chunk) {
      const transcription: TranscriptionPayload = {
        sessionId: msg.chunk.sessionId,
        text: msg.chunk.transcript,
        partial: msg.chunk.partial,
        chunkIndex: msg.chunk.chunkIndex,
      };
      this.transcriptionHandlers.forEach(handler => handler(transcription));
    }
  }

  send(message: WSClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendAudioChunk(chunk: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  startSession(deviceId: string, metadata?: Record<string, any>): void {
    this.send({
      type: 'start_session',
      deviceId,
      metadata,
    });
  }

  stopSession(): void {
    this.send({ type: 'stop_session' });
  }

  // Event handlers
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onTranscription(handler: TranscriptionHandler): () => void {
    this.transcriptionHandlers.add(handler);
    return () => this.transcriptionHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
