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

export type ObjectType =
  | 'task'
  | 'reminder'
  | 'idea'
  | 'observation'
  | 'question'
  | 'decision'
  | 'journal'
  | 'reference';

export type ObjectDomain =
  | 'work'
  | 'personal'
  | 'health'
  | 'family'
  | 'finance'
  | 'project'
  | 'misc'
  | 'unknown';

export type EmbeddingStatus = 'pending' | 'complete' | 'failed';

export interface Entity {
  type: 'person' | 'place' | 'organization' | 'task' | 'date' | 'other';
  value: string;
  confidence: number;
  startIndex?: number;
  endIndex?: number;
}

export interface TemporalHints {
  hasDate: boolean;
  dateText: string | null;
  urgency: 'low' | 'medium' | 'high' | null;
}

export interface LocationHints {
  places: string[];
  geofenceCandidate: boolean;
}

export interface Actionability {
  isActionable: boolean;
  nextAction: string | null;
}

export interface AtomicObject {
  id: string; // UUID
  userId: string;

  // v1 fields — kept for backward compatibility
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

  // v2 rich fields
  rawText?: string | null;
  cleanedText?: string | null;
  title?: string | null;
  objectType?: ObjectType | null;
  domain?: ObjectDomain;
  temporalHints?: TemporalHints;
  locationHints?: LocationHints;
  actionability?: Actionability;
  linkedObjectIds?: string[];
  sequenceIndex?: number;
  embeddingStatus?: EmbeddingStatus;
  state?: 'open' | 'active' | 'resolved' | 'archived';
  stateUpdatedAt?: Date | null;
  evolvedFromId?: string | null;
  categoryId?: string | null;
  categoryLocked?: boolean;

  createdAt: Date;
  updatedAt: Date;
  vectorEmbedding?: number[];
}

export interface Geofence {
  id: string;
  userId: string;
  name: string;
  center: GeoPoint;
  radius: number; // meters
  type: 'home' | 'work' | 'gym' | 'custom';
  associatedObjects: string[];
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
    relationship: string;
    strength: number;
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
    entities?: Entity[];
    tags?: string[];
    urgency?: 'low' | 'medium' | 'high';
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  // v2 rich fields
  rawText?: string | null;
  cleanedText?: string | null;
  title?: string | null;
  objectType?: ObjectType | null;
  domain?: ObjectDomain;
  temporalHints?: TemporalHints;
  locationHints?: LocationHints;
  actionability?: Actionability;
  sequenceIndex?: number;
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
  domains: string[];
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
    audioRetention: number;
    locationHistory: number;
    autoDeleteAfter: number;
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
