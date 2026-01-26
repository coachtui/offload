/**
 * Vector service - handles vector storage and semantic search in Weaviate
 */

import { getWeaviateClient } from '../db/weaviate';
import type { AtomicObject } from '@shared/types';
import axios from 'axios';

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
      {
        input: text,
        model: model,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data[0].embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error.response?.data || error.message);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Store atomic object in Weaviate
 */
export async function storeInVector(object: AtomicObject): Promise<void> {
  const client = getWeaviateClient();

  // Generate embedding for the content
  const embedding = await generateEmbedding(object.content);

  // Extract entity values for easier searching
  const entityValues = object.metadata.entities.map((e) => e.value);

  // Prepare data object
  const dataObject = {
    objectId: object.id,
    userId: object.userId,
    content: object.content,
    category: object.category,
    sourceType: object.source.type,
    entities: entityValues,
    sentiment: object.metadata.sentiment,
    urgency: object.metadata.urgency,
    tags: object.metadata.tags,
    createdAt: new Date(object.createdAt).getTime(),
  };

  try {
    await client.data
      .creator()
      .withClassName('AtomicObject')
      .withProperties(dataObject)
      .withVector(embedding)
      .do();

    console.log(`✅ Stored object ${object.id} in Weaviate`);
  } catch (error) {
    console.error('Error storing in Weaviate:', error);
    throw new Error('Failed to store object in vector database');
  }
}

/**
 * Update atomic object in Weaviate
 */
export async function updateInVector(object: AtomicObject): Promise<void> {
  const client = getWeaviateClient();

  // First, find the Weaviate UUID by objectId
  try {
    const result = await client.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('_additional { id }')
      .withWhere({
        path: ['objectId'],
        operator: 'Equal',
        valueText: object.id,
      })
      .do();

    const weaviateId = result.data.Get.AtomicObject?.[0]?._additional?.id;

    if (!weaviateId) {
      console.warn(`Object ${object.id} not found in Weaviate, creating new entry`);
      await storeInVector(object);
      return;
    }

    // Generate new embedding
    const embedding = await generateEmbedding(object.content);

    // Extract entity values
    const entityValues = object.metadata.entities.map((e) => e.value);

    // Update the object
    await client.data
      .updater()
      .withId(weaviateId)
      .withClassName('AtomicObject')
      .withProperties({
        objectId: object.id,
        userId: object.userId,
        content: object.content,
        category: object.category,
        sourceType: object.source.type,
        entities: entityValues,
        sentiment: object.metadata.sentiment,
        urgency: object.metadata.urgency,
        tags: object.metadata.tags,
        createdAt: new Date(object.createdAt).getTime(),
      })
      .withVector(embedding)
      .do();

    console.log(`✅ Updated object ${object.id} in Weaviate`);
  } catch (error) {
    console.error('Error updating in Weaviate:', error);
    throw new Error('Failed to update object in vector database');
  }
}

/**
 * Delete atomic object from Weaviate
 */
export async function deleteFromVector(objectId: string): Promise<void> {
  const client = getWeaviateClient();

  try {
    // Find the Weaviate UUID by objectId
    const result = await client.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('_additional { id }')
      .withWhere({
        path: ['objectId'],
        operator: 'Equal',
        valueText: objectId,
      })
      .do();

    const weaviateId = result.data.Get.AtomicObject?.[0]?._additional?.id;

    if (!weaviateId) {
      console.warn(`Object ${objectId} not found in Weaviate`);
      return;
    }

    await client.data.deleter().withId(weaviateId).do();

    console.log(`✅ Deleted object ${objectId} from Weaviate`);
  } catch (error) {
    console.error('Error deleting from Weaviate:', error);
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
  category?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  urgency?: 'low' | 'medium' | 'high';
}

/**
 * Search result from Weaviate
 */
export interface SemanticSearchResult {
  objectId: string;
  content: string;
  distance: number; // Cosine distance (0 = identical, 2 = opposite)
  score: number; // Similarity score (0-1, where 1 is most similar)
}

/**
 * Perform semantic search on atomic objects
 */
export async function semanticSearch(
  options: SemanticSearchOptions
): Promise<SemanticSearchResult[]> {
  const client = getWeaviateClient();
  const limit = options.limit || 10;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(options.query);

  // Build where filter
  const whereFilters: any[] = [
    {
      path: ['userId'],
      operator: 'Equal',
      valueText: options.userId,
    },
  ];

  // Add category filter if provided
  if (options.category && options.category.length > 0) {
    whereFilters.push({
      path: ['category'],
      operator: 'ContainsAny',
      valueTextArray: options.category,
    });
  }

  // Add urgency filter if provided
  if (options.urgency) {
    whereFilters.push({
      path: ['urgency'],
      operator: 'Equal',
      valueText: options.urgency,
    });
  }

  // Add date range filter if provided
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

  // Combine filters with AND operator
  const whereFilter =
    whereFilters.length > 1
      ? {
          operator: 'And',
          operands: whereFilters,
        }
      : whereFilters[0];

  try {
    const result = await client.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('objectId content _additional { distance }')
      .withNearVector({
        vector: queryEmbedding,
      })
      .withLimit(limit)
      .withWhere(whereFilter)
      .do();

    const objects = result.data.Get.AtomicObject || [];

    return objects.map((obj: any) => ({
      objectId: obj.objectId,
      content: obj.content,
      distance: obj._additional.distance,
      score: 1 - obj._additional.distance / 2, // Convert distance to similarity score
    }));
  } catch (error) {
    console.error('Error performing semantic search:', error);
    throw new Error('Failed to perform semantic search');
  }
}

/**
 * Find similar atomic objects
 */
export async function findSimilar(
  objectId: string,
  userId: string,
  limit: number = 5
): Promise<SemanticSearchResult[]> {
  const client = getWeaviateClient();

  try {
    // First get the object's content to generate embedding
    const objectResult = await client.graphql
      .get()
      .withClassName('AtomicObject')
      .withFields('content')
      .withWhere({
        path: ['objectId'],
        operator: 'Equal',
        valueText: objectId,
      })
      .do();

    const content = objectResult.data.Get.AtomicObject?.[0]?.content;

    if (!content) {
      throw new Error('Object not found in Weaviate');
    }

    // Use semantic search to find similar objects
    return await semanticSearch({
      userId,
      query: content,
      limit: limit + 1, // +1 to account for the object itself
    }).then((results) =>
      // Filter out the original object
      results.filter((r) => r.objectId !== objectId).slice(0, limit)
    );
  } catch (error) {
    console.error('Error finding similar objects:', error);
    throw new Error('Failed to find similar objects');
  }
}
