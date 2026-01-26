/**
 * AtomicObject model
 */

import { query, queryOne, queryMany } from '../db/queries';
import type {
  AtomicObject,
  Category,
  GeoPoint,
  Entity,
  AtomicObjectCreateRequest,
} from '@shared/types';

export interface AtomicObjectRow {
  id: string;
  user_id: string;
  content: string;
  category: string[];
  confidence: number;
  source_type: 'voice' | 'text' | 'import';
  source_recording_id: string | null;
  source_timestamp: Date;
  source_location_latitude: number | null;
  source_location_longitude: number | null;
  source_location_accuracy: number | null;
  source_location_altitude: number | null;
  metadata_entities: Entity[];
  metadata_sentiment: 'positive' | 'neutral' | 'negative' | null;
  metadata_urgency: 'low' | 'medium' | 'high' | null;
  metadata_tags: string[];
  relationships_related_objects: string[];
  relationships_contradictions: string[];
  relationships_references: string[];
  created_at: Date;
  updated_at: Date;
}

export class AtomicObjectModel {
  id: string;
  userId: string;
  content: string;
  category: Category[];
  confidence: number;
  source: {
    type: 'voice' | 'text' | 'import';
    recordingId?: string;
    timestamp: Date;
    location?: GeoPoint;
  };
  metadata: {
    entities: Entity[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    urgency?: 'low' | 'medium' | 'high';
    tags: string[];
  };
  relationships: {
    relatedObjects: string[];
    contradictions: string[];
    references: string[];
  };
  createdAt: Date;
  updatedAt: Date;

  constructor(row: AtomicObjectRow) {
    this.id = row.id;
    this.userId = row.user_id;
    this.content = row.content;
    this.category = row.category as Category[];
    this.confidence = parseFloat(row.confidence.toString());
    this.source = {
      type: row.source_type,
      recordingId: row.source_recording_id || undefined,
      timestamp: row.source_timestamp,
      location:
        row.source_location_latitude && row.source_location_longitude
          ? {
              latitude: parseFloat(row.source_location_latitude.toString()),
              longitude: parseFloat(row.source_location_longitude.toString()),
              accuracy: row.source_location_accuracy
                ? parseFloat(row.source_location_accuracy.toString())
                : undefined,
              altitude: row.source_location_altitude
                ? parseFloat(row.source_location_altitude.toString())
                : undefined,
            }
          : undefined,
    };
    this.metadata = {
      entities: row.metadata_entities || [],
      sentiment: row.metadata_sentiment || undefined,
      urgency: row.metadata_urgency || undefined,
      tags: row.metadata_tags || [],
    };
    this.relationships = {
      relatedObjects: row.relationships_related_objects || [],
      contradictions: row.relationships_contradictions || [],
      references: row.relationships_references || [],
    };
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  /**
   * Find atomic object by ID
   */
  static async findById(id: string): Promise<AtomicObjectModel | null> {
    const row = await queryOne<AtomicObjectRow>(
      'SELECT * FROM hub.atomic_objects WHERE id = $1',
      [id]
    );
    return row ? new AtomicObjectModel(row) : null;
  }

  /**
   * Find atomic objects by user ID
   */
  static async findByUserId(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      category?: Category[];
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<{ objects: AtomicObjectModel[]; total: number }> {
    let queryText = 'SELECT * FROM hub.atomic_objects WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (options?.category && options.category.length > 0) {
      queryText += ` AND category && $${paramIndex++}`;
      params.push(options.category);
    }

    if (options?.dateFrom) {
      queryText += ` AND created_at >= $${paramIndex++}`;
      params.push(options.dateFrom);
    }

    if (options?.dateTo) {
      queryText += ` AND created_at <= $${paramIndex++}`;
      params.push(options.dateTo);
    }

    queryText += ' ORDER BY created_at DESC';

    // Get total count
    const countResult = await query<{ count: string }>(
      queryText.replace('SELECT *', 'SELECT COUNT(*) as count')
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Apply pagination
    if (options?.limit) {
      queryText += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      queryText += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const rows = await queryMany<AtomicObjectRow>(queryText, params);
    return {
      objects: rows.map((row) => new AtomicObjectModel(row)),
      total,
    };
  }

  /**
   * Create a new atomic object
   */
  static async create(
    userId: string,
    input: AtomicObjectCreateRequest
  ): Promise<AtomicObjectModel> {
    const row = await queryOne<AtomicObjectRow>(
      `INSERT INTO hub.atomic_objects (
        user_id, content, category, confidence,
        source_type, source_recording_id, source_timestamp,
        source_location_latitude, source_location_longitude,
        source_location_accuracy, source_location_altitude,
        metadata_entities, metadata_sentiment, metadata_urgency, metadata_tags,
        relationships_related_objects, relationships_contradictions, relationships_references
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      RETURNING *`,
      [
        userId,
        input.content,
        input.category || [],
        0.5, // Default confidence
        input.source.type,
        input.source.recordingId || null,
        input.source.location?.timestamp
          ? new Date(input.source.location.timestamp)
          : new Date(),
        input.source.location?.latitude || null,
        input.source.location?.longitude || null,
        input.source.location?.accuracy || null,
        input.source.location?.altitude || null,
        input.metadata?.entities || [],
        input.metadata?.sentiment || null,
        input.metadata?.urgency || null,
        input.metadata?.tags || [],
        [],
        [],
        [],
      ]
    );

    if (!row) {
      throw new Error('Failed to create atomic object');
    }

    return new AtomicObjectModel(row);
  }

  /**
   * Update atomic object
   */
  async update(
    updates: Partial<{
      content: string;
      category: Category[];
      confidence: number;
      metadata: Partial<AtomicObjectModel['metadata']>;
      relationships: Partial<AtomicObjectModel['relationships']>;
    }>
  ): Promise<AtomicObjectModel> {
    const updatesList: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.content !== undefined) {
      updatesList.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }

    if (updates.category !== undefined) {
      updatesList.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }

    if (updates.confidence !== undefined) {
      updatesList.push(`confidence = $${paramIndex++}`);
      values.push(updates.confidence);
    }

    if (updates.metadata) {
      if (updates.metadata.entities !== undefined) {
        updatesList.push(`metadata_entities = $${paramIndex++}`);
        values.push(updates.metadata.entities);
      }
      if (updates.metadata.sentiment !== undefined) {
        updatesList.push(`metadata_sentiment = $${paramIndex++}`);
        values.push(updates.metadata.sentiment);
      }
      if (updates.metadata.urgency !== undefined) {
        updatesList.push(`metadata_urgency = $${paramIndex++}`);
        values.push(updates.metadata.urgency);
      }
      if (updates.metadata.tags !== undefined) {
        updatesList.push(`metadata_tags = $${paramIndex++}`);
        values.push(updates.metadata.tags);
      }
    }

    if (updates.relationships) {
      if (updates.relationships.relatedObjects !== undefined) {
        updatesList.push(`relationships_related_objects = $${paramIndex++}`);
        values.push(updates.relationships.relatedObjects);
      }
      if (updates.relationships.contradictions !== undefined) {
        updatesList.push(`relationships_contradictions = $${paramIndex++}`);
        values.push(updates.relationships.contradictions);
      }
      if (updates.relationships.references !== undefined) {
        updatesList.push(`relationships_references = $${paramIndex++}`);
        values.push(updates.relationships.references);
      }
    }

    if (updatesList.length === 0) {
      return this;
    }

    values.push(this.id);
    const row = await queryOne<AtomicObjectRow>(
      `UPDATE hub.atomic_objects
       SET ${updatesList.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!row) {
      throw new Error('Failed to update atomic object');
    }

    return new AtomicObjectModel(row);
  }

  /**
   * Delete atomic object
   */
  async delete(): Promise<void> {
    await query('DELETE FROM hub.atomic_objects WHERE id = $1', [this.id]);
  }

  /**
   * Convert to shared AtomicObject type
   */
  toAtomicObject(): AtomicObject {
    return {
      id: this.id,
      userId: this.userId,
      content: this.content,
      category: this.category,
      confidence: this.confidence,
      source: this.source,
      metadata: this.metadata,
      relationships: this.relationships,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
