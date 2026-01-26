/**
 * Shared TypeScript type definitions for The Hub
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
  id: string; // UUID
  userId: string;
  content: string;
  category: Category[]; // Multi-label classification
  confidence: number; // Classification confidence (0-1)
  source: {
    type: 'voice' | 'text' | 'import';
    recordingId?: string;
    timestamp: number;
    location?: GeoPoint;
  };
  metadata: {
    entities: Entity[]; // Extracted entities
    sentiment: 'positive' | 'neutral' | 'negative';
    urgency: 'low' | 'medium' | 'high';
    tags: string[];
  };
  relationships: {
    relatedObjects: string[]; // IDs of related atomic objects
    contradictions: string[]; // IDs of objects that contradict this
    references: string[]; // IDs of objects this references
  };
  createdAt: Date;
  updatedAt: Date;
  vectorEmbedding?: number[]; // Stored in vector DB
}

export interface Geofence {
  id: string;
  userId: string;
  name: string;
  center: GeoPoint;
  radius: number; // meters
  type: 'home' | 'work' | 'gym' | 'custom';
  associatedObjects: string[]; // Atomic object IDs
  notificationSettings: {
    enabled: boolean;
    onEnter: boolean;
    onExit: boolean;
    quietHours?: { start: string; end: string }; // "22:00" - "07:00"
  };
  createdAt: Date;
  updatedAt?: Date;
}

export interface KnowledgeNode {
  id: string;
  type: 'entity' | 'concept' | 'pattern';
  label: string;
  properties: Record<string, any>;
  connections: {
    nodeId: string;
    relationship: string; // 'mentions', 'contradicts', 'references', 'similar_to'
    strength: number; // 0-1
  }[];
  lastSeen: Date;
  frequency: number;
}

// API Request/Response Types

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

export interface AtomicObjectCreateRequest {
  content: string;
  category?: Category[];
  source: {
    type: 'voice' | 'text' | 'import';
    recordingId?: string;
    location?: GeoPoint;
  };
  metadata?: {
    tags?: string[];
    urgency?: 'low' | 'medium' | 'high';
  };
}

export interface AtomicObjectResponse {
  object: AtomicObject;
  related?: AtomicObject[];
}

export interface GeofenceCreateRequest {
  name: string;
  center: GeoPoint;
  radius: number;
  type: 'home' | 'work' | 'gym' | 'custom';
  associatedObjects?: string[];
  notificationSettings?: {
    enabled?: boolean;
    onEnter?: boolean;
    onExit?: boolean;
    quietHours?: { start: string; end: string };
  };
}

export interface RAGQueryRequest {
  query: string;
  context?: {
    location?: GeoPoint;
    time?: Date;
    category?: Category[];
  };
  limit?: number;
}

export interface RAGQueryResponse {
  answer: string;
  sources: AtomicObject[];
  confidence: number;
}

export interface ValidationResponse {
  contradictions: AtomicObject[];
  suggestions: string[];
}

export interface Insight {
  id: string;
  type: 'pattern' | 'contradiction' | 'optimization' | 'reminder';
  title: string;
  description: string;
  relatedObjects: string[];
  confidence: number;
  createdAt: Date;
}

export interface Pattern {
  id: string;
  domains: string[]; // e.g., ['business', 'fitness']
  description: string;
  frequency: number;
  relatedObjects: string[];
  createdAt: Date;
}

// Privacy Settings

export interface PrivacySettings {
  encryption: {
    level: 'standard' | 'enhanced' | 'maximum';
    encryptLocation: boolean;
    encryptMetadata: boolean;
  };
  dataRetention: {
    audioRetention: number; // days, 0 = delete immediately
    locationHistory: number; // days
    autoDeleteAfter: number; // days
  };
  sharing: {
    allowCloudSync: boolean;
    allowAnalytics: boolean;
    allowCrashReporting: boolean;
  };
  aiProcessing: {
    useLocalModels: boolean;
    allowCloudAI: boolean;
    anonymizeForTraining: boolean;
  };
}

// WebSocket Events

export type WebSocketEventType =
  | 'location_update'
  | 'geofence_entered'
  | 'geofence_exited'
  | 'transcription_update'
  | 'object_created'
  | 'insight_ready'
  | 'error';

export interface WebSocketEvent {
  type: WebSocketEventType;
  payload: any;
  timestamp: number;
}

export interface LocationUpdateEvent {
  type: 'location_update';
  payload: {
    location: GeoPoint;
    activeGeofences: Geofence[];
  };
}

export interface GeofenceEnteredEvent {
  type: 'geofence_entered';
  payload: {
    geofence: Geofence;
    relevantObjects: AtomicObject[];
  };
}

export interface TranscriptionUpdateEvent {
  type: 'transcription_update';
  payload: {
    sessionId: string;
    transcript: string;
    partial: boolean;
  };
}
