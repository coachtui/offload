/**
 * Shared TypeScript type definitions for The Hub
 */
export interface GeoPoint {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    timestamp?: number;
}
export type Category = 'business' | 'personal' | 'fitness' | 'health' | 'family' | 'finance' | 'education' | 'other';
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
export interface Geofence {
    id: string;
    userId: string;
    name: string;
    center: GeoPoint;
    radius: number;
    type: 'home' | 'work' | 'gym' | 'custom';
    associatedObjects: string[];
    notificationSettings: {
        enabled: boolean;
        onEnter: boolean;
        onExit: boolean;
        quietHours?: {
            start: string;
            end: string;
        };
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
        quietHours?: {
            start: string;
            end: string;
        };
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
export type WebSocketEventType = 'location_update' | 'geofence_entered' | 'geofence_exited' | 'transcription_update' | 'object_created' | 'insight_ready' | 'error';
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
//# sourceMappingURL=index.d.ts.map