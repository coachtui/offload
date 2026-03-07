/**
 * Object service — business logic for atomic objects
 * v2: rich schema, embedding status tracking
 */

import { AtomicObjectModel } from '../models/AtomicObject';
import type {
  AtomicObjectCreateRequest,
  AtomicObject,
  Category,
} from '@shared/types';
import { z } from 'zod';
import {
  storeInVector,
  updateInVector,
  semanticSearch,
  findSimilar,
  type SemanticSearchResult,
} from './vectorService';

// Validation schema for createObject input
export const createObjectSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  category: z
    .array(z.enum(['business', 'personal', 'fitness', 'health', 'family', 'finance', 'education', 'other']))
    .optional(),
  source: z.object({
    type: z.enum(['voice', 'text', 'import']),
    recordingId: z.string().uuid().optional(),
    location: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().optional(),
        altitude: z.number().optional(),
        timestamp: z.number().optional(),
      })
      .optional(),
  }),
  metadata: z
    .object({
      entities: z.array(z.any()).optional(),
      tags: z.array(z.string()).optional(),
      urgency: z.enum(['low', 'medium', 'high']).optional(),
      sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    })
    .optional(),
  // v2 rich fields (all optional for backward compat)
  rawText: z.string().nullable().optional(),
  cleanedText: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  objectType: z
    .enum(['task', 'reminder', 'idea', 'observation', 'question', 'decision', 'journal', 'reference'])
    .nullable()
    .optional(),
  domain: z
    .enum(['work', 'personal', 'health', 'family', 'finance', 'project', 'misc', 'unknown'])
    .optional(),
  temporalHints: z
    .object({
      hasDate: z.boolean(),
      dateText: z.string().nullable(),
      urgency: z.enum(['low', 'medium', 'high']).nullable(),
    })
    .optional(),
  locationHints: z
    .object({
      places: z.array(z.string()),
      geofenceCandidate: z.boolean(),
    })
    .optional(),
  actionability: z
    .object({
      isActionable: z.boolean(),
      nextAction: z.string().nullable(),
    })
    .optional(),
  sequenceIndex: z.number().int().optional(),
});

export interface ListObjectsOptions {
  category?: Category[];
  domain?: string[];
  objectType?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Create a new atomic object — persists to PostgreSQL then Weaviate
 */
export async function createObject(
  userId: string,
  input: AtomicObjectCreateRequest
): Promise<AtomicObject> {
  createObjectSchema.parse(input);

  const object = await AtomicObjectModel.create(userId, input);
  const atomicObject = object.toAtomicObject();

  // Store in Weaviate; update embedding_status in PG on success/failure
  try {
    await storeInVector(atomicObject);
    await AtomicObjectModel.updateEmbeddingStatus(atomicObject.id, 'complete');
    atomicObject.embeddingStatus = 'complete';
  } catch (error) {
    console.error('[objectService] Failed to store in vector database:', error);
    try {
      await AtomicObjectModel.updateEmbeddingStatus(atomicObject.id, 'failed');
    } catch {
      // Best-effort status update
    }
    atomicObject.embeddingStatus = 'failed';
  }

  return atomicObject;
}

/**
 * Get object by ID
 */
export async function getObjectById(
  userId: string,
  objectId: string
): Promise<AtomicObject> {
  const object = await AtomicObjectModel.findById(objectId);
  if (!object) throw new Error('Object not found');
  if (object.userId !== userId) throw new Error('Unauthorized');
  return object.toAtomicObject();
}

/**
 * List objects for a user
 */
export async function listObjects(
  userId: string,
  options: ListObjectsOptions = {}
): Promise<{
  objects: AtomicObject[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = options.limit || 25;
  const offset = options.offset || 0;

  // Semantic search path
  if (options.search && options.search.trim().length > 0) {
    try {
      const searchResults = await semanticSearch({
        userId,
        query: options.search,
        limit,
        category: options.category,
        domain: options.domain,
        objectType: options.objectType,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      const objectIds = searchResults.map((r) => r.objectId);
      const objects = await AtomicObjectModel.findByIds(objectIds);

      return {
        objects: objects.map((obj) => obj.toAtomicObject()),
        total: objects.length,
        limit,
        offset: 0,
      };
    } catch (error) {
      console.error('[objectService] Semantic search failed, falling back to DB:', error);
    }
  }

  // Default: DB filter
  const result = await AtomicObjectModel.findByUserId(userId, {
    category: options.category,
    domain: options.domain,
    objectType: options.objectType,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    limit,
    offset,
  });

  return {
    objects: result.objects.map((obj) => obj.toAtomicObject()),
    total: result.total,
    limit,
    offset,
  };
}

/**
 * Update object
 */
export async function updateObject(
  userId: string,
  objectId: string,
  updates: Partial<{
    content: string;
    category: Category[];
    confidence: number;
    metadata: Partial<AtomicObjectModel['metadata']>;
    relationships: Partial<AtomicObjectModel['relationships']>;
  }>
): Promise<AtomicObject> {
  const object = await AtomicObjectModel.findById(objectId);
  if (!object) throw new Error('Object not found');
  if (object.userId !== userId) throw new Error('Unauthorized');

  const updated = await object.update(updates);
  const atomicObject = updated.toAtomicObject();

  try {
    await updateInVector(atomicObject);
  } catch (error) {
    console.error('[objectService] Failed to update in vector database:', error);
  }

  return atomicObject;
}

/**
 * Delete object
 */
export async function deleteObject(userId: string, objectId: string): Promise<void> {
  const object = await AtomicObjectModel.findById(objectId);
  if (!object) throw new Error('Object not found');
  if (object.userId !== userId) throw new Error('Unauthorized');

  await object.softDelete();
}

/**
 * List stale actionable objects (is_actionable=true, >7 days old, no linked resolution)
 */
export async function listStaleActionables(userId: string): Promise<AtomicObject[]> {
  const objects = await AtomicObjectModel.findStaleActionables(userId);
  return objects.map((obj) => obj.toAtomicObject());
}

/**
 * Find similar objects
 */
export async function findSimilarObjects(
  userId: string,
  objectId: string,
  limit: number = 5
): Promise<AtomicObject[]> {
  const object = await AtomicObjectModel.findById(objectId);
  if (!object) throw new Error('Object not found');
  if (object.userId !== userId) throw new Error('Unauthorized');

  try {
    const similarResults = await findSimilar(objectId, userId, limit);
    const objectIds = similarResults.map((r) => r.objectId);
    const objects = await AtomicObjectModel.findByIds(objectIds);
    return objects.map((obj) => obj.toAtomicObject());
  } catch (error) {
    console.error('[objectService] Failed to find similar objects:', error);
    throw new Error('Failed to find similar objects');
  }
}
