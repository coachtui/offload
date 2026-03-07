/**
 * ML Service client — interfaces with Python ML service for transcript parsing
 * v2: rich atomic object schema
 */

import axios from 'axios';
import type { ObjectType, ObjectDomain } from '@shared/types';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_SERVICE_API_KEY = process.env.ML_SERVICE_API_KEY;

/**
 * Rich parsed atomic object returned by ML service v2
 */
export interface ParsedAtomicObject {
  rawText: string;
  cleanedText: string;
  title: string | null;
  type: ObjectType;
  domain: ObjectDomain;
  tags: string[];
  entities: string[]; // Named entity strings
  confidence: number;
  temporalHints: {
    hasDate: boolean;
    dateText: string | null;
    urgency: 'low' | 'medium' | 'high' | null;
  };
  locationHints: {
    places: string[];
    geofenceCandidate: boolean;
  };
  actionability: {
    isActionable: boolean;
    nextAction: string | null;
  };
  sequenceIndex: number;
}

/**
 * Request to parse transcript
 */
export interface ParseTranscriptRequest {
  transcript: string;
  userId: string;
  sessionId: string;
  timestamp?: Date;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
  };
  context?: {
    recentCategories?: string[];
    recentEntities?: string[];
    userPreferences?: any;
  };
}

/**
 * Response from transcript parsing
 */
export interface ParseTranscriptResponse {
  atomicObjects: ParsedAtomicObject[];
  summary?: string;
  processingTime: number;
  modelUsed: string;
}

/**
 * Map a raw ML response object (snake_case) to ParsedAtomicObject (camelCase)
 */
function mapParsedObject(obj: any, fallbackIndex: number): ParsedAtomicObject {
  return {
    rawText: obj.raw_text ?? obj.content ?? '',
    cleanedText: obj.cleaned_text ?? obj.content ?? '',
    title: obj.title ?? null,
    type: (obj.type as ObjectType) ?? 'observation',
    domain: (obj.domain as ObjectDomain) ?? 'unknown',
    tags: obj.tags ?? [],
    entities: obj.entities ?? [],
    confidence: obj.confidence ?? 0.5,
    temporalHints: {
      hasDate: obj.temporal_hints?.has_date ?? false,
      dateText: obj.temporal_hints?.date_text ?? null,
      urgency: obj.temporal_hints?.urgency ?? null,
    },
    locationHints: {
      places: obj.location_hints?.places ?? [],
      geofenceCandidate: obj.location_hints?.geofence_candidate ?? false,
    },
    actionability: {
      isActionable: obj.actionability?.is_actionable ?? false,
      nextAction: obj.actionability?.next_action ?? null,
    },
    sequenceIndex: obj.sequence_index ?? fallbackIndex,
  };
}

/**
 * Parse transcript into atomic objects using ML service
 */
export async function parseTranscript(
  request: ParseTranscriptRequest
): Promise<ParseTranscriptResponse> {
  try {
    const response = await axios.post<{
      atomic_objects: any[];
      summary?: string;
      processing_time: number;
      model_used: string;
    }>(
      `${ML_SERVICE_URL}/api/v1/parse-transcript`,
      {
        transcript: request.transcript,
        user_id: request.userId,
        session_id: request.sessionId,
        timestamp: request.timestamp?.toISOString(),
        location: request.location,
        context: request.context,
      },
      {
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          ...(ML_SERVICE_API_KEY ? { 'X-Service-Key': ML_SERVICE_API_KEY } : {}),
        },
      }
    );

    return {
      atomicObjects: response.data.atomic_objects.map((obj, i) =>
        mapParsedObject(obj, i)
      ),
      summary: response.data.summary,
      processingTime: response.data.processing_time,
      modelUsed: response.data.model_used,
    };
  } catch (error: any) {
    console.error('[mlService] Error calling ML service:', error.response?.data || error.message);

    if (error.code === 'ECONNREFUSED') {
      throw new Error('ML service is not available. Please ensure it is running.');
    }

    if (error.response?.status === 400) {
      throw new Error(`Invalid request: ${error.response.data.detail || 'Bad request'}`);
    }

    if (error.response?.status === 500) {
      throw new Error(
        `ML service error: ${error.response.data.detail || 'Internal server error'}`
      );
    }

    throw new Error('Failed to parse transcript with ML service');
  }
}

/**
 * Check if ML service is healthy
 */
export async function checkMLServiceHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 5000 });
    return response.data.status === 'ok';
  } catch (error) {
    console.error('[mlService] Health check failed:', error);
    return false;
  }
}

/**
 * Get ML service info
 */
export async function getMLServiceInfo(): Promise<any> {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/`);
    return response.data;
  } catch (error) {
    console.error('[mlService] Failed to get info:', error);
    throw new Error('ML service not available');
  }
}
