/**
 * Session model (for voice recording sessions)
 */

import { query, queryOne, queryMany } from '../db/queries';
import type { VoiceSession, GeoPoint } from '@shared/types';

export interface SessionRow {
  id: string;
  user_id: string;
  device_id: string;
  location_latitude: number | null;
  location_longitude: number | null;
  location_accuracy: number | null;
  location_altitude: number | null;
  metadata: Record<string, any>;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  created_at: Date;
  updated_at: Date;
}

export interface SessionCreateInput {
  userId: string;
  deviceId: string;
  location?: GeoPoint;
  metadata?: Record<string, any>;
}

export class Session {
  id: string;
  userId: string;
  deviceId: string;
  location?: GeoPoint;
  metadata: Record<string, any>;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;

  constructor(row: SessionRow) {
    this.id = row.id;
    this.userId = row.user_id;
    this.deviceId = row.device_id;
    this.location =
      row.location_latitude && row.location_longitude
        ? {
            latitude: parseFloat(row.location_latitude.toString()),
            longitude: parseFloat(row.location_longitude.toString()),
            accuracy: row.location_accuracy
              ? parseFloat(row.location_accuracy.toString())
              : undefined,
            altitude: row.location_altitude
              ? parseFloat(row.location_altitude.toString())
              : undefined,
          }
        : undefined;
    this.metadata = row.metadata || {};
    this.status = row.status;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  /**
   * Find session by ID
   */
  static async findById(id: string): Promise<Session | null> {
    const row = await queryOne<SessionRow>(
      'SELECT * FROM hub.sessions WHERE id = $1',
      [id]
    );
    return row ? new Session(row) : null;
  }

  /**
   * Find sessions by user ID
   */
  static async findByUserId(
    userId: string,
    options?: {
      status?: Session['status'];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ sessions: Session[]; total: number }> {
    let queryText = 'SELECT * FROM hub.sessions WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (options?.status) {
      queryText += ` AND status = $${paramIndex++}`;
      params.push(options.status);
    }

    queryText += ' ORDER BY created_at DESC';

    // Get total count
    const countQuery = queryText.replace('SELECT *', 'SELECT COUNT(*) as count')
      .replace(/ ORDER BY created_at DESC.*/, ''); // Remove ordering/pagination for count
    const countParams = options?.status ? [userId, options.status] : [userId];
    const countResult = await query<{ count: string }>(countQuery, countParams);
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

    const rows = await queryMany<SessionRow>(queryText, params);
    return {
      sessions: rows.map((row) => new Session(row)),
      total,
    };
  }

  /**
   * Create a new session
   */
  static async create(input: SessionCreateInput): Promise<Session> {
    const row = await queryOne<SessionRow>(
      `INSERT INTO hub.sessions (
        user_id, device_id, location_latitude, location_longitude,
        location_accuracy, location_altitude, metadata, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      RETURNING *`,
      [
        input.userId,
        input.deviceId,
        input.location?.latitude || null,
        input.location?.longitude || null,
        input.location?.accuracy || null,
        input.location?.altitude || null,
        input.metadata || {},
        'recording',
      ]
    );

    if (!row) {
      throw new Error('Failed to create session');
    }

    return new Session(row);
  }

  /**
   * Update session
   */
  async update(
    updates: Partial<{
      status: Session['status'];
      location: GeoPoint;
      metadata: Record<string, any>;
    }>
  ): Promise<Session> {
    const updatesList: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      updatesList.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.location !== undefined) {
      updatesList.push(`location_latitude = $${paramIndex++}`);
      values.push(updates.location.latitude);
      updatesList.push(`location_longitude = $${paramIndex++}`);
      values.push(updates.location.longitude);
      if (updates.location.accuracy !== undefined) {
        updatesList.push(`location_accuracy = $${paramIndex++}`);
        values.push(updates.location.accuracy);
      }
      if (updates.location.altitude !== undefined) {
        updatesList.push(`location_altitude = $${paramIndex++}`);
        values.push(updates.location.altitude);
      }
    }

    if (updates.metadata !== undefined) {
      updatesList.push(`metadata = $${paramIndex++}`);
      values.push(updates.metadata);
    }

    if (updatesList.length === 0) {
      return this;
    }

    values.push(this.id);
    const row = await queryOne<SessionRow>(
      `UPDATE hub.sessions
       SET ${updatesList.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!row) {
      throw new Error('Failed to update session');
    }

    return new Session(row);
  }

  /**
   * Delete session
   */
  async delete(): Promise<void> {
    await query('DELETE FROM hub.sessions WHERE id = $1', [this.id]);
  }

  /**
   * Convert to shared VoiceSession type
   */
  toVoiceSession(): VoiceSession {
    return {
      sessionId: this.id,
      deviceId: this.deviceId,
      location: this.location,
      metadata: this.metadata,
      createdAt: this.createdAt,
      status: this.status,
    };
  }
}
