/**
 * Geofence service - business logic for geofences
 */

import { GeofenceModel } from '../models/Geofence';
import type { Geofence, GeofenceCreateRequest, GeoPoint } from '@shared/types';
import { z } from 'zod';

// Validation schemas
export const createGeofenceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  center: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().optional(),
    altitude: z.number().optional(),
  }),
  radius: z.number().positive('Radius must be positive'),
  type: z.enum(['home', 'work', 'gym', 'custom']),
  associatedObjects: z.array(z.string().uuid()).optional(),
  notificationSettings: z.object({
    enabled: z.boolean().optional(),
    onEnter: z.boolean().optional(),
    onExit: z.boolean().optional(),
    quietHours: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
  }).optional(),
});

/**
 * Create a new geofence
 */
export async function createGeofence(
  userId: string,
  input: GeofenceCreateRequest
): Promise<Geofence> {
  // Validate input
  createGeofenceSchema.parse(input);

  const geofence = await GeofenceModel.create(userId, input);
  return geofence.toGeofence();
}

/**
 * Get geofence by ID
 */
export async function getGeofenceById(
  userId: string,
  geofenceId: string
): Promise<Geofence> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) {
    throw new Error('Geofence not found');
  }

  if (geofence.userId !== userId) {
    throw new Error('Unauthorized');
  }

  return geofence.toGeofence();
}

/**
 * List geofences for a user
 */
export async function listGeofences(userId: string): Promise<Geofence[]> {
  const geofences = await GeofenceModel.findByUserId(userId);
  return geofences.map((gf) => gf.toGeofence());
}

/**
 * Check location against geofences
 */
export async function checkLocation(
  userId: string,
  location: GeoPoint
): Promise<{
  activeGeofences: Geofence[];
  relevantObjects: any[]; // TODO: Return relevant atomic objects
}> {
  const activeGeofences = await GeofenceModel.findByLocation(userId, location);
  
  // TODO: Get relevant atomic objects for active geofences
  // This would query atomic objects associated with the geofences

  return {
    activeGeofences: activeGeofences.map((gf) => gf.toGeofence()),
    relevantObjects: [], // Placeholder
  };
}

/**
 * Update geofence
 */
export async function updateGeofence(
  userId: string,
  geofenceId: string,
  updates: Partial<{
    name: string;
    center: GeoPoint;
    radius: number;
    type: 'home' | 'work' | 'gym' | 'custom';
    associatedObjects: string[];
    notificationSettings: Partial<GeofenceModel['notificationSettings']>;
  }>
): Promise<Geofence> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) {
    throw new Error('Geofence not found');
  }

  if (geofence.userId !== userId) {
    throw new Error('Unauthorized');
  }

  const updated = await geofence.update(updates);
  return updated.toGeofence();
}

/**
 * Delete geofence
 */
export async function deleteGeofence(
  userId: string,
  geofenceId: string
): Promise<void> {
  const geofence = await GeofenceModel.findById(geofenceId);
  if (!geofence) {
    throw new Error('Geofence not found');
  }

  if (geofence.userId !== userId) {
    throw new Error('Unauthorized');
  }

  await geofence.delete();
}
