/**
 * AtomicObject model — v2 with rich schema
 */

import { query, queryOne, queryMany } from '../db/queries';
import type {
  AtomicObject,
  Category,
  GeoPoint,
  Entity,
  ObjectType,
  ObjectDomain,
  EmbeddingStatus,
  TemporalHints,
  LocationHints,
  Actionability,
  AtomicObjectCreateRequest,
} from '@shared/types';

export interface AtomicObjectRow {
  id: string;
  user_id: string;
  // v1 fields
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
  // v2 rich fields
  raw_text: string | null;
  cleaned_text: string | null;
  title: string | null;
  object_type: ObjectType | null;
  domain: ObjectDomain;
  temporal_has_date: boolean;
  temporal_date_text: string | null;
  temporal_urgency: 'low' | 'medium' | 'high' | null;
  location_places: string[];
  location_geofence_candidate: boolean;
  is_actionable: boolean;
  next_action: string | null;
  linked_object_ids: string[];
  sequence_index: number;
  embedding_status: EmbeddingStatus;
  created_at: Date;
  updated_at: Date;
}

export class AtomicObjectModel {
  id: string;
  userId: string;
  // v1 fields
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
  // v2 rich fields
  rawText: string | null;
  cleanedText: string | null;
  title: string | null;
  objectType: ObjectType | null;
  domain: ObjectDomain;
  temporalHints: TemporalHints;
  locationHints: LocationHints;
  actionability: Actionability;
  linkedObjectIds: string[];
  sequenceIndex: number;
  embeddingStatus: EmbeddingStatus;
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
    // v2 fields
    this.rawText = row.raw_text ?? null;
    this.cleanedText = row.cleaned_text ?? null;
    this.title = row.title ?? null;
    this.objectType = row.object_type ?? null;
    this.domain = row.domain ?? 'unknown';
    this.temporalHints = {
      hasDate: row.temporal_has_date ?? false,
      dateText: row.temporal_date_text ?? null,
      urgency: row.temporal_urgency ?? null,
    };
    this.locationHints = {
      places: row.location_places ?? [],
      geofenceCandidate: row.location_geofence_candidate ?? false,
    };
    this.actionability = {
      isActionable: row.is_actionable ?? false,
      nextAction: row.next_action ?? null,
    };
    this.linkedObjectIds = row.linked_object_ids ?? [];
    this.sequenceIndex = row.sequence_index ?? 0;
    this.embeddingStatus = row.embedding_status ?? 'pending';
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
   * Find multiple atomic objects by IDs (batch fetch)
   */
  static async findByIds(ids: string[]): Promise<AtomicObjectModel[]> {
    if (ids.length === 0) return [];
    const rows = await queryMany<AtomicObjectRow>(
      'SELECT * FROM hub.atomic_objects WHERE id = ANY($1)',
      [ids]
    );
    // Return in same order as ids array
    const map = new Map(rows.map((r) => [r.id, new AtomicObjectModel(r)]));
    return ids.map((id) => map.get(id)).filter(Boolean) as AtomicObjectModel[];
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
      domain?: string[];
      objectType?: string[];
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

    if (options?.domain && options.domain.length > 0) {
      queryText += ` AND domain = ANY($${paramIndex++})`;
      params.push(options.domain);
    }

    if (options?.objectType && options.objectType.length > 0) {
      queryText += ` AND object_type = ANY($${paramIndex++})`;
      params.push(options.objectType);
    }

    if (options?.dateFrom) {
      queryText += ` AND created_at >= $${paramIndex++}`;
      params.push(options.dateFrom);
    }

    if (options?.dateTo) {
      queryText += ` AND created_at <= $${paramIndex++}`;
      params.push(options.dateTo);
    }

    const countQuery = queryText.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await query<{ count: string }>(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    queryText += ' ORDER BY created_at DESC';

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
   * Create a new atomic object (v2)
   */
  static async create(
    userId: string,
    input: AtomicObjectCreateRequest
  ): Promise<AtomicObjectModel> {
    // Convert entity string[] to Entity[] for metadata_entities
    const entityObjects: Entity[] = (input.metadata?.entities ?? []).length > 0
      ? (input.metadata!.entities as Entity[])
      : [];

    const row = await queryOne<AtomicObjectRow>(
      `INSERT INTO hub.atomic_objects (
        user_id, content, category, confidence,
        source_type, source_recording_id, source_timestamp,
        source_location_latitude, source_location_longitude,
        source_location_accuracy, source_location_altitude,
        metadata_entities, metadata_sentiment, metadata_urgency, metadata_tags,
        relationships_related_objects, relationships_contradictions, relationships_references,
        raw_text, cleaned_text, title, object_type, domain,
        temporal_has_date, temporal_date_text, temporal_urgency,
        location_places, location_geofence_candidate,
        is_actionable, next_action,
        linked_object_ids, sequence_index, embedding_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
      )
      RETURNING *`,
      [
        userId,                                                           // $1
        input.content,                                                    // $2
        input.category || [],                                             // $3
        input.metadata?.entities ? 0.5 : 0.5,                            // $4 confidence default
        input.source.type,                                                // $5
        input.source.recordingId || null,                                 // $6
        input.source.location?.timestamp
          ? new Date(input.source.location.timestamp)
          : new Date(),                                                   // $7
        input.source.location?.latitude || null,                          // $8
        input.source.location?.longitude || null,                         // $9
        input.source.location?.accuracy || null,                          // $10
        input.source.location?.altitude || null,                          // $11
        JSON.stringify(entityObjects),                                    // $12 metadata_entities
        input.metadata?.sentiment || null,                                // $13
        input.metadata?.urgency || input.temporalHints?.urgency || null,  // $14
        input.metadata?.tags || [],                                       // $15
        [],                                                               // $16 relationships_related_objects
        [],                                                               // $17 relationships_contradictions
        [],                                                               // $18 relationships_references
        input.rawText || null,                                            // $19
        input.cleanedText || null,                                        // $20
        input.title || null,                                              // $21
        input.objectType || null,                                         // $22
        input.domain || 'unknown',                                        // $23
        input.temporalHints?.hasDate || false,                            // $24
        input.temporalHints?.dateText || null,                            // $25
        input.temporalHints?.urgency || null,                             // $26
        input.locationHints?.places || [],                                // $27
        input.locationHints?.geofenceCandidate || false,                  // $28
        input.actionability?.isActionable || false,                       // $29
        input.actionability?.nextAction || null,                          // $30
        [],                                                               // $31 linked_object_ids
        input.sequenceIndex ?? 0,                                         // $32
        'pending',                                                        // $33 embedding_status
      ]
    );

    if (!row) {
      throw new Error('Failed to create atomic object');
    }

    return new AtomicObjectModel(row);
  }

  /**
   * Update embedding status
   */
  static async updateEmbeddingStatus(
    id: string,
    status: EmbeddingStatus
  ): Promise<void> {
    await query(
      'UPDATE hub.atomic_objects SET embedding_status = $1 WHERE id = $2',
      [status, id]
    );
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
      embeddingStatus: EmbeddingStatus;
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

    if (updates.embeddingStatus !== undefined) {
      updatesList.push(`embedding_status = $${paramIndex++}`);
      values.push(updates.embeddingStatus);
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
   * Find objects with embedding_status = 'failed', ordered oldest first
   */
  static async findFailedEmbeddings(limit: number = 50): Promise<AtomicObjectModel[]> {
    const rows = await queryMany<AtomicObjectRow>(
      `SELECT * FROM hub.atomic_objects
       WHERE embedding_status = 'failed'
       ORDER BY updated_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows.map((row) => new AtomicObjectModel(row));
  }

  /**
   * Find stale actionable objects: is_actionable=true, older than 7 days, no linked resolution
   */
  static async findStaleActionables(userId: string): Promise<AtomicObjectModel[]> {
    const rows = await queryMany<AtomicObjectRow>(
      `SELECT * FROM hub.atomic_objects
       WHERE user_id = $1
         AND is_actionable = true
         AND created_at < NOW() - INTERVAL '7 days'
         AND cardinality(linked_object_ids) = 0
       ORDER BY created_at ASC`,
      [userId]
    );
    return rows.map((row) => new AtomicObjectModel(row));
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
      source: {
        type: this.source.type,
        recordingId: this.source.recordingId,
        timestamp: this.source.timestamp.getTime(),
        location: this.source.location,
      },
      metadata: {
        entities: this.metadata.entities,
        sentiment: this.metadata.sentiment as any,
        urgency: this.metadata.urgency as any,
        tags: this.metadata.tags,
      },
      relationships: this.relationships,
      // v2 fields
      rawText: this.rawText,
      cleanedText: this.cleanedText,
      title: this.title,
      objectType: this.objectType,
      domain: this.domain,
      temporalHints: this.temporalHints,
      locationHints: this.locationHints,
      actionability: this.actionability,
      linkedObjectIds: this.linkedObjectIds,
      sequenceIndex: this.sequenceIndex,
      embeddingStatus: this.embeddingStatus,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
