/**
 * Shared TypeScript type definitions for Brain Dump Mobile
 * Copied from @shared/types
 */

// Core Entities

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  timestamp?: number;
}

export type Category =
  | 'business'
  | 'personal'
  | 'fitness'
  | 'health'
  | 'family'
  | 'finance'
  | 'education'
  | 'other';

export interface Entity {
  type: 'person' | 'place' | 'organization' | 'task' | 'date' | 'other';
  value: string;
  confidence: number;
  startIndex?: number;
  endIndex?: number;
}

export interface AtomicObject {
  id: string;
  userId: string;
  content: string;
  category: Category[];
  confidence: number;
  source: {
    type: 'voice' | 'text' | 'import';
    recordingId?: string;
    timestamp: number;
    location?: GeoPoint;
  };
  metadata: {
    entities: Entity[];
    sentiment: 'positive' | 'neutral' | 'negative';
    urgency: 'low' | 'medium' | 'high';
    tags: string[];
  };
  relationships: {
    relatedObjects: string[];
    contradictions: string[];
    references: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  vectorEmbedding?: number[];
}

export interface VoiceSession {
  sessionId: string;
  deviceId: string;
  location?: GeoPoint;
  metadata?: Record<string, any>;
  createdAt: Date;
  status: 'recording' | 'processing' | 'completed' | 'failed';
}

export interface TranscriptionChunk {
  sessionId: string;
  chunkIndex: number;
  transcript: string;
  partial: boolean;
  timestamp: number;
}

// Auth Types

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

// Matches backend AuthResponse from userService.ts
export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

// WebSocket Message Types

export type WSClientMessageType =
  | 'start_session'
  | 'audio_chunk'
  | 'stop_session'
  | 'ping';

export type WSServerMessageType =
  | 'session_started'
  | 'transcription'
  | 'session_stopped'
  | 'error'
  | 'pong';

export interface WSClientMessage {
  type: WSClientMessageType;
  payload?: any;
}

export interface WSServerMessage {
  type: WSServerMessageType;
  payload?: any;
  timestamp?: number;
}

export interface TranscriptionPayload {
  sessionId: string;
  text: string;
  partial: boolean;
  chunkIndex?: number;
}

// API Response Types

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
