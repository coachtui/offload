/**
 * Geofence model
 */

import { query, queryOne, queryMany } from '../db/queries';
import type { Geofence, GeoPoint, GeofenceCreateRequest } from '@shared/types';

export interface GeofenceRow {
  id: string;
  user_id: string;
  name: string;
  center_latitude: number;
  center_longitude: number;
  center_accuracy: number | null;
  center_altitude: number | null;
  radius: number;
  type: 'home' | 'work' | 'gym' | 'custom';
  associated_objects: string[];
  notification_enabled: boolean;
  notification_on_enter: boolean;
  notification_on_exit: boolean;
  notification_quiet_hours_start: string | null;
  notification_quiet_hours_end: string | null;
  created_at: Date;
  updated_at: Date;
}

export class GeofenceModel {
  id: string;
  userId: string;
  name: string;
  center: GeoPoint;
  radius: number;
  type: 'home' | 'work' | 'gym' | 'custom';
  associatedObjects: string[];
  notificationSettings: {
    enabled: boolean;
    onEnter: boolean;
    onExit: boolean;
    quietHours?: { start: string; end: string };
  };
  createdAt: Date;
  updatedAt: Date;

  constructor(row: GeofenceRow) {
    this.id = row.id;
    this.userId = row.user_id;
    this.name = row.name;
    this.center = {
      latitude: parseFloat(row.center_latitude.toString()),
      longitude: parseFloat(row.center_longitude.toString()),
      accuracy: row.center_accuracy
        ? parseFloat(row.center_accuracy.toString())
        : undefined,
      altitude: row.center_altitude
        ? parseFloat(row.center_altitude.toString())
        : undefined,
    };
    this.radius = row.radius;
    this.type = row.type;
    this.associatedObjects = row.associated_objects || [];
    this.notificationSettings = {
      enabled: row.notification_enabled,
      onEnter: row.notification_on_enter,
      onExit: row.notification_on_exit,
      quietHours:
        row.notification_quiet_hours_start && row.notification_quiet_hours_end
          ? {
              start: row.notification_quiet_hours_start,
              end: row.notification_quiet_hours_end,
            }
          : undefined,
    };
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  /**
   * Find geofence by ID
   */
  static async findById(id: string): Promise<GeofenceModel | null> {
    const row = await queryOne<GeofenceRow>(
      'SELECT * FROM hub.geofences WHERE id = $1',
      [id]
    );
    return row ? new GeofenceModel(row) : null;
  }

  /**
   * Find geofences by user ID
   */
  static async findByUserId(userId: string): Promise<GeofenceModel[]> {
    const rows = await queryMany<GeofenceRow>(
      'SELECT * FROM hub.geofences WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((row) => new GeofenceModel(row));
  }

  /**
   * Find geofences containing a location
   */
  static async findByLocation(
    userId: string,
    location: GeoPoint
  ): Promise<GeofenceModel[]> {
    // Use PostGIS distance calculation (Haversine formula approximation)
    // For now, we'll use a simple bounding box check and then filter by distance
    const rows = await queryMany<GeofenceRow>(
      `SELECT * FROM hub.geofences
       WHERE user_id = $1
       AND center_latitude BETWEEN $2 - (radius / 111000.0) AND $2 + (radius / 111000.0)
       AND center_longitude BETWEEN $3 - (radius / (111000.0 * COS(RADIANS($2)))) AND $3 + (radius / (111000.0 * COS(RADIANS($2))))
       ORDER BY created_at DESC`,
      [userId, location.latitude, location.longitude]
    );

    // Filter by actual distance (more accurate)
    const geofences = rows.map((row) => new GeofenceModel(row));
    return geofences.filter((geofence) => {
      const distance = this.calculateDistance(
        location,
        geofence.center
      );
      return distance <= geofence.radius;
    });
  }

  /**
   * Calculate distance between two points in meters (Haversine formula)
   */
  private static calculateDistance(point1: GeoPoint, point2: GeoPoint): number {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = (point1.latitude * Math.PI) / 180;
    const lat2Rad = (point2.latitude * Math.PI) / 180;
    const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLonRad / 2) *
        Math.sin(deltaLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Create a new geofence
   */
  static async create(
    userId: string,
    input: GeofenceCreateRequest
  ): Promise<GeofenceModel> {
    const row = await queryOne<GeofenceRow>(
      `INSERT INTO hub.geofences (
        user_id, name, center_latitude, center_longitude,
        center_accuracy, center_altitude, radius, type,
        associated_objects, notification_enabled, notification_on_enter,
        notification_on_exit, notification_quiet_hours_start, notification_quiet_hours_end
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING *`,
      [
        userId,
        input.name,
        input.center.latitude,
        input.center.longitude,
        input.center.accuracy || null,
        input.center.altitude || null,
        input.radius,
        input.type,
        input.associatedObjects || [],
        input.notificationSettings?.enabled || false,
        input.notificationSettings?.onEnter || false,
        input.notificationSettings?.onExit || false,
        input.notificationSettings?.quietHours?.start || null,
        input.notificationSettings?.quietHours?.end || null,
      ]
    );

    if (!row) {
      throw new Error('Failed to create geofence');
    }

    return new GeofenceModel(row);
  }

  /**
   * Update geofence
   */
  async update(
    updates: Partial<{
      name: string;
      center: GeoPoint;
      radius: number;
      type: 'home' | 'work' | 'gym' | 'custom';
      associatedObjects: string[];
      notificationSettings: Partial<GeofenceModel['notificationSettings']>;
    }>
  ): Promise<GeofenceModel> {
    const updatesList: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updatesList.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.center !== undefined) {
      updatesList.push(`center_latitude = $${paramIndex++}`);
      values.push(updates.center.latitude);
      updatesList.push(`center_longitude = $${paramIndex++}`);
      values.push(updates.center.longitude);
      if (updates.center.accuracy !== undefined) {
        updatesList.push(`center_accuracy = $${paramIndex++}`);
        values.push(updates.center.accuracy);
      }
      if (updates.center.altitude !== undefined) {
        updatesList.push(`center_altitude = $${paramIndex++}`);
        values.push(updates.center.altitude);
      }
    }

    if (updates.radius !== undefined) {
      updatesList.push(`radius = $${paramIndex++}`);
      values.push(updates.radius);
    }

    if (updates.type !== undefined) {
      updatesList.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.associatedObjects !== undefined) {
      updatesList.push(`associated_objects = $${paramIndex++}`);
      values.push(updates.associatedObjects);
    }

    if (updates.notificationSettings) {
      if (updates.notificationSettings.enabled !== undefined) {
        updatesList.push(`notification_enabled = $${paramIndex++}`);
        values.push(updates.notificationSettings.enabled);
      }
      if (updates.notificationSettings.onEnter !== undefined) {
        updatesList.push(`notification_on_enter = $${paramIndex++}`);
        values.push(updates.notificationSettings.onEnter);
      }
      if (updates.notificationSettings.onExit !== undefined) {
        updatesList.push(`notification_on_exit = $${paramIndex++}`);
        values.push(updates.notificationSettings.onExit);
      }
      if (updates.notificationSettings.quietHours !== undefined) {
        updatesList.push(`notification_quiet_hours_start = $${paramIndex++}`);
        values.push(updates.notificationSettings.quietHours.start);
        updatesList.push(`notification_quiet_hours_end = $${paramIndex++}`);
        values.push(updates.notificationSettings.quietHours.end);
      }
    }

    if (updatesList.length === 0) {
      return this;
    }

    values.push(this.id);
    const row = await queryOne<GeofenceRow>(
      `UPDATE hub.geofences
       SET ${updatesList.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!row) {
      throw new Error('Failed to update geofence');
    }

    return new GeofenceModel(row);
  }

  /**
   * Delete geofence
   */
  async delete(): Promise<void> {
    await query('DELETE FROM hub.geofences WHERE id = $1', [this.id]);
  }

  /**
   * Convert to shared Geofence type
   */
  toGeofence(): Geofence {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      center: this.center,
      radius: this.radius,
      type: this.type,
      associatedObjects: this.associatedObjects,
      notificationSettings: this.notificationSettings,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
