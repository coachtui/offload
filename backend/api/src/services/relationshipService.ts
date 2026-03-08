/**
 * Relationship Detection Service
 * Finds connections and relationships between atomic objects
 */

import { AtomicObjectModel } from '../models/AtomicObject';
import { findSimilar } from './vectorService';
import { pool } from '../db/connection';

/**
 * Relationship type
 */
export type RelationshipType = 'similar' | 'temporal' | 'contradicts' | 'references';

/**
 * Detected relationship
 */
export interface DetectedRelationship {
  fromObjectId: string;
  toObjectId: string;
  type: RelationshipType;
  confidence: number;
  reason?: string;
}

/**
 * Find relationships for an atomic object
 */
export async function detectRelationships(
  objectId: string,
  userId: string
): Promise<DetectedRelationship[]> {
  const relationships: DetectedRelationship[] = [];

  // Get the source object
  const sourceObject = await AtomicObjectModel.findById(objectId);
  if (!sourceObject || sourceObject.userId !== userId) {
    return relationships;
  }

  // 1. Find similar objects using vector search
  const similarObjects = await findSimilar(objectId, userId, 10);

  for (const similar of similarObjects) {
    // High similarity score = strong relationship
    if (similar.score > 0.75) {
      relationships.push({
        fromObjectId: objectId,
        toObjectId: similar.objectId,
        type: 'similar',
        confidence: similar.score,
        reason: 'High semantic similarity',
      });
    }
  }

  // 2. Detect temporal relationships (within same time window)
  const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
  const sourceTime = sourceObject.createdAt.getTime();

  const { objects: recentObjects } = await AtomicObjectModel.findByUserId(userId, {
    limit: 50,
  });

  for (const obj of recentObjects) {
    if (obj.id === objectId) continue;

    const timeDiff = Math.abs(obj.createdAt.getTime() - sourceTime);

    if (timeDiff < timeWindow) {
      // Check if they share categories or tags
      const sharedCategories = sourceObject.category.filter((cat) =>
        obj.category.includes(cat)
      );
      const sharedTags = sourceObject.metadata.tags.filter((tag) =>
        obj.metadata.tags.includes(tag)
      );

      if (sharedCategories.length > 0 || sharedTags.length > 0) {
        const confidence = 0.6 + (sharedCategories.length * 0.1 + sharedTags.length * 0.05);

        relationships.push({
          fromObjectId: objectId,
          toObjectId: obj.id,
          type: 'temporal',
          confidence: Math.min(confidence, 0.95),
          reason: `Recorded within 24 hours with shared context`,
        });
      }
    }
  }

  // 3. Detect contradictions (opposite sentiment on similar content)
  for (const similar of similarObjects) {
    if (similar.score > 0.7) {
      const targetObject = await AtomicObjectModel.findById(similar.objectId);

      if (targetObject) {
        // Check for opposing sentiments
        if (
          sourceObject.metadata.sentiment &&
          targetObject.metadata.sentiment &&
          ((sourceObject.metadata.sentiment === 'positive' &&
            targetObject.metadata.sentiment === 'negative') ||
            (sourceObject.metadata.sentiment === 'negative' &&
              targetObject.metadata.sentiment === 'positive'))
        ) {
          relationships.push({
            fromObjectId: objectId,
            toObjectId: similar.objectId,
            type: 'contradicts',
            confidence: similar.score * 0.8,
            reason: 'Similar content with opposing sentiment',
          });
        }

        // Check for urgency contradictions
        if (
          sourceObject.metadata.urgency &&
          targetObject.metadata.urgency &&
          sourceObject.metadata.urgency !== targetObject.metadata.urgency
        ) {
          relationships.push({
            fromObjectId: objectId,
            toObjectId: similar.objectId,
            type: 'contradicts',
            confidence: similar.score * 0.6,
            reason: 'Similar content with different urgency levels',
          });
        }
      }
    }
  }

  // 4. Detect entity-based relationships (shared people, places, etc.)
  const sourceEntities = sourceObject.metadata.entities.map((e) => e.value.toLowerCase());

  if (sourceEntities.length > 0) {
    for (const obj of recentObjects) {
      if (obj.id === objectId) continue;

      const targetEntities = obj.metadata.entities.map((e) => e.value.toLowerCase());
      const sharedEntities = sourceEntities.filter((e) => targetEntities.includes(e));

      if (sharedEntities.length > 0) {
        const confidence = 0.5 + sharedEntities.length * 0.15;

        relationships.push({
          fromObjectId: objectId,
          toObjectId: obj.id,
          type: 'references',
          confidence: Math.min(confidence, 0.95),
          reason: `Shared entities: ${sharedEntities.join(', ')}`,
        });
      }
    }
  }

  // Remove duplicates and sort by confidence
  const uniqueRelationships = deduplicateRelationships(relationships);
  return uniqueRelationships.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Update relationships for an atomic object
 */
export async function updateObjectRelationships(objectId: string, userId: string): Promise<void> {
  const relationships = await detectRelationships(objectId, userId);

  // Group by type
  const relatedObjects = relationships
    .filter((r) => r.type === 'similar' || r.type === 'temporal' || r.type === 'references')
    .map((r) => r.toObjectId);

  const contradictions = relationships
    .filter((r) => r.type === 'contradicts')
    .map((r) => r.toObjectId);

  const references = relationships
    .filter((r) => r.type === 'references')
    .map((r) => r.toObjectId);

  // Update the object with detected relationships (legacy arrays for backward compat)
  const object = await AtomicObjectModel.findById(objectId);
  if (object && object.userId === userId) {
    await object.update({
      relationships: {
        relatedObjects: Array.from(new Set(relatedObjects)),
        contradictions: Array.from(new Set(contradictions)),
        references: Array.from(new Set(references)),
      },
    });

    // Write to hub.relationships table (idempotent via ON CONFLICT)
    const edgeTypeMap: Record<string, string> = {
      similar: 'related_to',
      temporal: 'temporal',
      contradicts: 'contradicts',
      references: 'references',
    };

    for (const rel of relationships) {
      try {
        await pool.query(
          `INSERT INTO hub.relationships
             (user_id, source_id, target_id, edge_type, confidence, metadata, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'system')
           ON CONFLICT (source_id, target_id, edge_type)
             DO UPDATE SET confidence = EXCLUDED.confidence,
                           metadata   = EXCLUDED.metadata`,
          [
            userId,
            objectId,
            rel.toObjectId,
            edgeTypeMap[rel.type] ?? rel.type,
            rel.confidence,
            JSON.stringify({ reason: rel.reason ?? '' }),
          ]
        );
      } catch (err) {
        console.warn('[relationshipService] Failed to write edge to hub.relationships:', err);
      }
    }

    console.log(
      `Updated relationships for object ${objectId}: ${relatedObjects.length} related, ${contradictions.length} contradictions`
    );
  }
}

/**
 * Batch update relationships for user's recent objects
 */
export async function batchUpdateRelationships(
  userId: string,
  limit: number = 20
): Promise<number> {
  const { objects } = await AtomicObjectModel.findByUserId(userId, { limit });

  let updated = 0;
  for (const object of objects) {
    try {
      await updateObjectRelationships(object.id, userId);
      updated++;
    } catch (error) {
      console.error(`Failed to update relationships for object ${object.id}:`, error);
    }
  }

  return updated;
}

/**
 * Remove duplicate relationships (keep highest confidence)
 */
function deduplicateRelationships(relationships: DetectedRelationship[]): DetectedRelationship[] {
  const seen = new Map<string, DetectedRelationship>();

  for (const rel of relationships) {
    const key = `${rel.fromObjectId}-${rel.toObjectId}-${rel.type}`;
    const existing = seen.get(key);

    if (!existing || rel.confidence > existing.confidence) {
      seen.set(key, rel);
    }
  }

  return Array.from(seen.values());
}
