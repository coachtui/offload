/**
 * ML Service client - interfaces with Python ML service for transcript parsing
 */

import axios from 'axios';
import type { Category, Entity } from '@shared/types';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Parsed atomic object from ML service
 */
export interface ParsedAtomicObject {
  content: string;
  category: Category[];
  confidence: number;
  entities: Entity[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  urgency?: 'low' | 'medium' | 'high';
  tags: string[];
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
 * Parse transcript into atomic objects using ML service
 */
export async function parseTranscript(
  request: ParseTranscriptRequest
): Promise<ParseTranscriptResponse> {
  try {
    const response = await axios.post<{
      atomic_objects: ParsedAtomicObject[];
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
        timeout: 60000, // 60 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      atomicObjects: response.data.atomic_objects,
      summary: response.data.summary,
      processingTime: response.data.processing_time,
      modelUsed: response.data.model_used,
    };
  } catch (error: any) {
    console.error('Error calling ML service:', error.response?.data || error.message);

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
    const response = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: 5000,
    });
    return response.data.status === 'ok';
  } catch (error) {
    console.error('ML service health check failed:', error);
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
    console.error('Failed to get ML service info:', error);
    throw new Error('ML service not available');
  }
}
