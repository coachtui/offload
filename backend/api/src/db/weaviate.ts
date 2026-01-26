/**
 * Weaviate client connection and configuration
 */

import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';
import * as dotenv from 'dotenv';

dotenv.config();

let client: WeaviateClient | null = null;

/**
 * Get or create Weaviate client instance
 */
export function getWeaviateClient(): WeaviateClient {
  if (client) {
    return client;
  }

  const weaviateUrl = process.env.WEAVIATE_URL || 'http://localhost:8080';
  const apiKey = process.env.WEAVIATE_API_KEY;

  const clientConfig: any = {
    scheme: weaviateUrl.startsWith('https') ? 'https' : 'http',
    host: weaviateUrl.replace(/^https?:\/\//, ''),
  };

  // Add API key if provided
  if (apiKey) {
    clientConfig.apiKey = new ApiKey(apiKey);
  }

  client = weaviate.client(clientConfig);

  return client;
}

/**
 * Test Weaviate connection
 */
export async function testWeaviateConnection(): Promise<boolean> {
  try {
    const client = getWeaviateClient();
    const meta = await client.misc.metaGetter().do();
    console.log('✅ Weaviate connection successful. Version:', meta.version);
    return true;
  } catch (error) {
    console.error('❌ Weaviate connection failed:', error);
    return false;
  }
}

/**
 * Initialize Weaviate schema
 */
export async function initializeWeaviateSchema(): Promise<void> {
  const client = getWeaviateClient();

  // Check if AtomicObject class already exists
  try {
    const schemaResult = await client.schema.getter().do();
    const existingClass = schemaResult.classes?.find(
      (c: any) => c.class === 'AtomicObject'
    );

    if (existingClass) {
      console.log('ℹ️  AtomicObject class already exists in Weaviate');
      return;
    }
  } catch (error) {
    console.error('Error checking schema:', error);
  }

  // Define the AtomicObject class schema
  const atomicObjectClass = {
    class: 'AtomicObject',
    description: 'An atomic piece of information captured by the user',
    vectorizer: 'none', // We'll use OpenAI embeddings externally
    properties: [
      {
        name: 'objectId',
        dataType: ['text'],
        description: 'UUID of the atomic object in PostgreSQL',
        indexFilterable: true,
        indexSearchable: false,
      },
      {
        name: 'userId',
        dataType: ['text'],
        description: 'User ID who owns this object',
        indexFilterable: true,
        indexSearchable: false,
      },
      {
        name: 'content',
        dataType: ['text'],
        description: 'The main content/text of the atomic object',
        indexFilterable: false,
        indexSearchable: true,
      },
      {
        name: 'category',
        dataType: ['text[]'],
        description: 'Categories assigned to this object',
        indexFilterable: true,
        indexSearchable: false,
      },
      {
        name: 'sourceType',
        dataType: ['text'],
        description: 'Source type: voice, text, or import',
        indexFilterable: true,
        indexSearchable: false,
      },
      {
        name: 'entities',
        dataType: ['text[]'],
        description: 'Extracted entity values',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'sentiment',
        dataType: ['text'],
        description: 'Sentiment: positive, neutral, or negative',
        indexFilterable: true,
        indexSearchable: false,
      },
      {
        name: 'urgency',
        dataType: ['text'],
        description: 'Urgency level: low, medium, or high',
        indexFilterable: true,
        indexSearchable: false,
      },
      {
        name: 'tags',
        dataType: ['text[]'],
        description: 'User-defined tags',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'createdAt',
        dataType: ['number'],
        description: 'Unix timestamp of creation',
        indexFilterable: true,
        indexSearchable: false,
      },
    ],
  };

  try {
    await client.schema.classCreator().withClass(atomicObjectClass).do();
    console.log('✅ AtomicObject schema created in Weaviate');
  } catch (error) {
    console.error('❌ Failed to create Weaviate schema:', error);
    throw error;
  }
}

/**
 * Delete all data from Weaviate (for testing/dev only)
 */
export async function clearWeaviateData(): Promise<void> {
  const client = getWeaviateClient();

  try {
    await client.schema.classDeleter().withClassName('AtomicObject').do();
    console.log('✅ Weaviate data cleared');
  } catch (error) {
    console.log('ℹ️  No data to clear or class does not exist');
  }
}
