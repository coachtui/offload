/**
 * Vector service — handles vector storage and semantic search in Weaviate
 * v2: richer embedding text, full v2 object properties, embedding status tracking
 */

import { getWeaviateClient } from '../db/weaviate';
import { AtomicObjectModel } from '../models/AtomicObject';
import type { AtomicObject, EmbeddingStatus } from '@shared/types';
import axios from 'axios';

/**
 * Build the text used for embedding. Combines the most retrieval-relevant
 * fields: cleanedText (or content), title, objectType, domain, tags.
 */
function buildEmbeddingText(object: AtomicObject): string {
  const parts: string[] = [];

  if (object.title) parts.push(object.title);
  if (object.cleanedText) {
    parts.push(object.cleanedText);
  } else {
    parts.push(object.content);
  }
  if (object.objectType) parts.push(object.objectType);
  if (object.domain && object.domain !== 'unknown') parts.push(object.domain);
  if (object.metadata?.tags?.length) parts.push(object.metadata.tags.join(' '));

  return parts.filter(Boolean).join(' ');
}

/**
 * Generate embeddings using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { input: text, model },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.data[0].embedding;
  } catch (error: any) {
    console.error('[vectorService] Error generating embedding:', error.response?.data || error.message);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Store atomic object in Weaviate
 */
export async function storeInVector(object: AtomicObject): Promise<void> {
  const c = getWeaviateClient();

  const embeddingText = buildEmbeddingText(object);
  const embedding = await generateEmbedding(embeddingText);

  const entityValues = (Array.isArray(object.metadata?.entities) ? object.metadata.entities : [])
    .map((e) => e.value);

  const dataObject: Record<string, any> = {
    objectId: object.id,
    userId: object.userId,
    content: object.cleanedText || object.content,
    title: object.title ?? null,
    category: object.category ?? [],
    objectType: object.objectType ?? null,
    domain: object.domain ?? 'unknown',
    sourceType: object.source?.type ?? 'voice',
    sourceTranscriptId: object.source?.recordingId ?? null,
    entities: entityValues,
    sentiment: object.metadata?.sentiment ?? null,
    urgency: object.metadata?.urgency ?? null,
    isActionable: object.actionability?.isActionable ?? false,
    tags: object.metadata?.tags ?? [],
    sequenceIndex: object.sequenceIndex ?? 0,
    createdAt: new Date(object.createdAt).getTime(),
  };

  // Remove null values to avoid Weaviate issues
  for (const key of Object.keys(dataObject)) {
    if (dataObject[key] === null || dataObject[key] === undefined) {
      delete dataObject[key];
    }
  }

  try {
    await c.data
      .creator()
      .withClassName('AtomicObject')
      .withProperties(dataObject)
      .withVector(embedding)
      .do();
    console.log(`[vectorService] ✅ Stored object ${object.id} in Weaviate`);
  } catch (error) {
    console.error('[vectorService] Error storing in Weaviate:', error);
    throw new Error('Failed to store object in vector database');
  }
}

/**
 * Update atomic object in Weaviate
 */
export async function updateInVector(object: AtomicObject): Promise<void> {
  const c = getWeaviateClient();

  try {
    const result = await c.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('_additional { id }')
      .withWhere({ path: ['objectId'], operator: 'Equal', valueText: object.id })
      .do();

    const weaviateId = result.data.Get.AtomicObject?.[0]?._additional?.id;

    if (!weaviateId) {
      console.warn(`[vectorService] Object ${object.id} not found in Weaviate, creating new entry`);
      await storeInVector(object);
      return;
    }

    const embeddingText = buildEmbeddingText(object);
    const embedding = await generateEmbedding(embeddingText);
    const entityValues = (Array.isArray(object.metadata?.entities) ? object.metadata.entities : [])
      .map((e) => e.value);

    await c.data
      .updater()
      .withId(weaviateId)
      .withClassName('AtomicObject')
      .withProperties({
        objectId: object.id,
        userId: object.userId,
        content: object.cleanedText || object.content,
        title: object.title,
        category: object.category,
        objectType: object.objectType,
        domain: object.domain,
        sourceType: object.source?.type,
        sourceTranscriptId: object.source?.recordingId,
        entities: entityValues,
        sentiment: object.metadata?.sentiment,
        urgency: object.metadata?.urgency,
        isActionable: object.actionability?.isActionable ?? false,
        tags: object.metadata?.tags ?? [],
        sequenceIndex: object.sequenceIndex ?? 0,
        createdAt: new Date(object.createdAt).getTime(),
      })
      .withVector(embedding)
      .do();

    console.log(`[vectorService] ✅ Updated object ${object.id} in Weaviate`);
  } catch (error) {
    console.error('[vectorService] Error updating in Weaviate:', error);
    throw new Error('Failed to update object in vector database');
  }
}

/**
 * Delete atomic object from Weaviate
 */
export async function deleteFromVector(objectId: string): Promise<void> {
  const c = getWeaviateClient();

  try {
    const result = await c.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('_additional { id }')
      .withWhere({ path: ['objectId'], operator: 'Equal', valueText: objectId })
      .do();

    const weaviateId = result.data.Get.AtomicObject?.[0]?._additional?.id;

    if (!weaviateId) {
      console.warn(`[vectorService] Object ${objectId} not found in Weaviate`);
      return;
    }

    await c.data.deleter().withId(weaviateId).do();
    console.log(`[vectorService] ✅ Deleted object ${objectId} from Weaviate`);
  } catch (error) {
    console.error('[vectorService] Error deleting from Weaviate:', error);
    throw new Error('Failed to delete object from vector database');
  }
}

/**
 * Search options for semantic search
 */
export interface SemanticSearchOptions {
  userId: string;
  query: string;
  limit?: number;
  // filters
  objectType?: string[];
  domain?: string[];
  category?: string[];
  // NOTE: categoryId is a PostgreSQL-only FK; Weaviate has no field for it. Filtering by category on the search path is done by post-filtering results in objectService.listObjects.
  categoryId?: string;
  urgency?: 'low' | 'medium' | 'high';
  isActionable?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Search result from Weaviate
 */
export interface SemanticSearchResult {
  objectId: string;
  content: string;
  distance: number;
  score: number; // 0-1, higher is more similar
}

/**
 * Perform semantic search on atomic objects
 */
export async function semanticSearch(
  options: SemanticSearchOptions
): Promise<SemanticSearchResult[]> {
  const c = getWeaviateClient();
  const limit = options.limit || 10;

  const queryEmbedding = await generateEmbedding(options.query);

  const whereFilters: any[] = [
    { path: ['userId'], operator: 'Equal', valueText: options.userId },
  ];

  if (options.objectType && options.objectType.length > 0) {
    whereFilters.push({
      path: ['objectType'],
      operator: 'ContainsAny',
      valueTextArray: options.objectType,
    });
  }

  if (options.domain && options.domain.length > 0) {
    whereFilters.push({
      path: ['domain'],
      operator: 'ContainsAny',
      valueTextArray: options.domain,
    });
  }

  if (options.category && options.category.length > 0) {
    whereFilters.push({
      path: ['category'],
      operator: 'ContainsAny',
      valueTextArray: options.category,
    });
  }

  if (options.urgency) {
    whereFilters.push({ path: ['urgency'], operator: 'Equal', valueText: options.urgency });
  }

  if (options.isActionable !== undefined) {
    whereFilters.push({
      path: ['isActionable'],
      operator: 'Equal',
      valueBoolean: options.isActionable,
    });
  }

  if (options.dateFrom) {
    whereFilters.push({
      path: ['createdAt'],
      operator: 'GreaterThanEqual',
      valueNumber: new Date(options.dateFrom).getTime(),
    });
  }

  if (options.dateTo) {
    whereFilters.push({
      path: ['createdAt'],
      operator: 'LessThanEqual',
      valueNumber: new Date(options.dateTo).getTime(),
    });
  }

  const whereFilter =
    whereFilters.length > 1
      ? { operator: 'And', operands: whereFilters }
      : whereFilters[0];

  try {
    const result = await c.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('objectId content _additional { distance }')
      .withNearVector({ vector: queryEmbedding })
      .withLimit(limit)
      .withWhere(whereFilter)
      .do();

    const objects = result.data.Get.AtomicObject || [];

    return objects.map((obj: any) => ({
      objectId: obj.objectId,
      content: obj.content,
      distance: obj._additional.distance,
      score: Math.max(0, 1 - obj._additional.distance / 2),
    }));
  } catch (error) {
    console.error('[vectorService] Error performing semantic search:', error);
    throw new Error('Failed to perform semantic search');
  }
}

/**
 * Find similar atomic objects to a given objectId
 */
export async function findSimilar(
  objectId: string,
  userId: string,
  limit: number = 5
): Promise<SemanticSearchResult[]> {
  const c = getWeaviateClient();

  try {
    const objectResult = await c.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('content')
      .withWhere({ path: ['objectId'], operator: 'Equal', valueText: objectId })
      .do();

    const content = objectResult.data.Get.AtomicObject?.[0]?.content;
    if (!content) {
      throw new Error('Object not found in Weaviate');
    }

    return await semanticSearch({ userId, query: content, limit: limit + 1 }).then((results) =>
      results.filter((r) => r.objectId !== objectId).slice(0, limit)
    );
  } catch (error) {
    console.error('[vectorService] Error finding similar objects:', error);
    throw new Error('Failed to find similar objects');
  }
}
