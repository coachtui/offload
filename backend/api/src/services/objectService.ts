/**
 * Object service - business logic for atomic objects
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
  deleteFromVector,
  semanticSearch,
  findSimilar,
  type SemanticSearchResult,
} from './vectorService';

// Validation schemas
export const createObjectSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  category: z.array(z.enum(['business', 'personal', 'fitness', 'health', 'family', 'finance', 'education', 'other'])).optional(),
  source: z.object({
    type: z.enum(['voice', 'text', 'import']),
    recordingId: z.string().uuid().optional(),
    location: z.object({
      latitude: z.number(),
      longitude: z.number(),
      accuracy: z.number().optional(),
      altitude: z.number().optional(),
      timestamp: z.number().optional(),
    }).optional(),
  }),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    urgency: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
});

export interface ListObjectsOptions {
  category?: Category[];
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Create a new atomic object
 */
export async function createObject(
  userId: string,
  input: AtomicObjectCreateRequest
): Promise<AtomicObject> {
  // Validate input
  createObjectSchema.parse(input);

  const object = await AtomicObjectModel.create(userId, input);
  const atomicObject = object.toAtomicObject();

  // Store in Weaviate for semantic search (async, don't block)
  try {
    await storeInVector(atomicObject);
  } catch (error) {
    console.error('Failed to store in vector database:', error);
    // Continue even if vector storage fails
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
  if (!object) {
    throw new Error('Object not found');
  }

  if (object.userId !== userId) {
    throw new Error('Unauthorized');
  }

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

  // If search query is provided, use semantic search via Weaviate
  if (options.search && options.search.trim().length > 0) {
    try {
      const searchResults = await semanticSearch({
        userId,
        query: options.search,
        limit,
        category: options.category,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      // Fetch full objects from PostgreSQL using the IDs
      const objectIds = searchResults.map((r) => r.objectId);
      const objects = await Promise.all(
        objectIds.map((id) => AtomicObjectModel.findById(id))
      );

      const validObjects = objects.filter((obj) => obj !== null) as AtomicObjectModel[];

      return {
        objects: validObjects.map((obj) => obj.toAtomicObject()),
        total: validObjects.length,
        limit,
        offset: 0, // Semantic search doesn't support offset
      };
    } catch (error) {
      console.error('Semantic search failed, falling back to database:', error);
      // Fall through to database search below
    }
  }

  // Default: use database filtering
  const result = await AtomicObjectModel.findByUserId(userId, {
    category: options.category,
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
  if (!object) {
    throw new Error('Object not found');
  }

  if (object.userId !== userId) {
    throw new Error('Unauthorized');
  }

  const updated = await object.update(updates);
  const atomicObject = updated.toAtomicObject();

  // Update in Weaviate (async, don't block)
  try {
    await updateInVector(atomicObject);
  } catch (error) {
    console.error('Failed to update in vector database:', error);
    // Continue even if vector update fails
  }

  return atomicObject;
}

/**
 * Delete object
 */
export async function deleteObject(
  userId: string,
  objectId: string
): Promise<void> {
  const object = await AtomicObjectModel.findById(objectId);
  if (!object) {
    throw new Error('Object not found');
  }

  if (object.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await object.delete();

  // Delete from Weaviate (async, don't block)
  try {
    await deleteFromVector(objectId);
  } catch (error) {
    console.error('Failed to delete from vector database:', error);
    // Continue even if vector deletion fails
  }
}

/**
 * Find similar objects
 */
export async function findSimilarObjects(
  userId: string,
  objectId: string,
  limit: number = 5
): Promise<AtomicObject[]> {
  // Verify the object exists and user has access
  const object = await AtomicObjectModel.findById(objectId);
  if (!object) {
    throw new Error('Object not found');
  }

  if (object.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // Use vector search to find similar objects
  try {
    const similarResults = await findSimilar(objectId, userId, limit);

    // Fetch full objects from PostgreSQL
    const objectIds = similarResults.map((r) => r.objectId);
    const objects = await Promise.all(
      objectIds.map((id) => AtomicObjectModel.findById(id))
    );

    const validObjects = objects.filter((obj) => obj !== null) as AtomicObjectModel[];

    return validObjects.map((obj) => obj.toAtomicObject());
  } catch (error) {
    console.error('Failed to find similar objects:', error);
    throw new Error('Failed to find similar objects');
  }
}
