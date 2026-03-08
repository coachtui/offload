/**
 * Geofence Management Hook
 * Handles CRUD operations for geofences with privacy-first approach
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../services/api';
import { geofenceMonitoringService, GeofenceRegion } from '../services/geofenceMonitoringService';
import { locationService } from '../services/locationService';

export interface Geofence {
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: 'home' | 'work' | 'gym' | 'store' | 'custom';
  location: {
    latitude: number;
    longitude: number;
  };
  radius: number; // meters
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
  enabled: boolean;
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string; // HH:MM format
  placeId?: string;         // Set for inferred places
  createdBy?: 'manual' | 'inferred';
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeofenceInput {
  name: string;
  description?: string;
  type: 'home' | 'work' | 'gym' | 'store' | 'custom';
  location: {
    latitude: number;
    longitude: number;
  };
  radius: number;
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface UseGeofencesResult {
  geofences: Geofence[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;

  // CRUD operations
  fetchGeofences: () => Promise<void>;
  createGeofence: (input: CreateGeofenceInput) => Promise<Geofence | null>;
  updateGeofence: (id: string, updates: Partial<CreateGeofenceInput>) => Promise<Geofence | null>;
  deleteGeofence: (id: string) => Promise<boolean>;

  // Monitoring operations
  enableGeofence: (id: string) => Promise<boolean>;
  disableGeofence: (id: string) => Promise<boolean>;

  // Utility
  getGeofenceById: (id: string) => Geofence | undefined;
  getNearbyGeofences: (latitude: number, longitude: number, radiusKm?: number) => Geofence[];
}

export function useGeofences(): UseGeofencesResult {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const geofencesRef = useRef<Geofence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Fetch all geofences from server
   */
  const fetchGeofences = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    setError(null);

    try {
      console.log('[useGeofences] Fetching geofences...');
      const response = await apiService.getGeofences();

      setGeofences(response.geofences);
      console.log(`[useGeofences] Loaded ${response.geofences.length} geofences`);

      // Sync with OS-level monitoring
      await syncMonitoring(response.geofences);
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Failed to fetch geofences';
      setError(message);
      console.error('[useGeofences] Error fetching:', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /**
   * Create a new geofence
   */
  const createGeofence = useCallback(async (input: CreateGeofenceInput): Promise<Geofence | null> => {
    setLoading(true);
    setError(null);

    try {
      // Validate location permissions
      const canCreate = await locationService.canCreateGeofence();
      if (!canCreate.allowed) {
        throw new Error(canCreate.reason);
      }

      console.log('[useGeofences] Creating geofence:', input.name);

      const response = await apiService.createGeofence({
        ...input,
        notifyOnEnter: input.notifyOnEnter ?? true,
        notifyOnExit: input.notifyOnExit ?? false,
      });

      const newGeofence = response.geofence;
      setGeofences(prev => [...prev, newGeofence]);

      // Start OS-level monitoring if enabled
      if (newGeofence.enabled) {
        await startMonitoring(newGeofence);
      }

      console.log('[useGeofences] Geofence created:', newGeofence.id);
      return newGeofence;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Failed to create geofence';
      setError(message);
      console.error('[useGeofences] Error creating (full):', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update an existing geofence
   */
  const updateGeofence = useCallback(
    async (id: string, updates: Partial<CreateGeofenceInput>): Promise<Geofence | null> => {
      setLoading(true);
      setError(null);

      try {
        console.log('[useGeofences] Updating geofence:', id, 'with updates:', JSON.stringify(updates));

        const response = await apiService.updateGeofence(id, updates);

        const updatedGeofence = response.geofence;
        console.log('[useGeofences] Received updated geofence from API:', JSON.stringify({
          id: updatedGeofence.id,
          enabled: updatedGeofence.enabled,
          notifyOnEnter: updatedGeofence.notifyOnEnter,
          notifyOnExit: updatedGeofence.notifyOnExit,
        }));

        const updatedList = geofencesRef.current.map(g => (g.id === id ? updatedGeofence : g));
        setGeofences(updatedList);

        // Re-sync monitoring with the full updated list so other geofences aren't dropped
        await syncMonitoring(updatedList);

        console.log('[useGeofences] Geofence updated successfully:', id);
        return updatedGeofence;
      } catch (err: any) {
        const message = err.response?.data?.message || err.message || 'Failed to update geofence';
        setError(message);
        console.error('[useGeofences] Error updating:', message, err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Delete a geofence
   */
  const deleteGeofence = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useGeofences] Deleting geofence:', id);

      // Stop monitoring first
      await geofenceMonitoringService.stopMonitoringRegion(id);

      await apiService.deleteGeofence(id);

      setGeofences(prev => prev.filter(g => g.id !== id));
      console.log('[useGeofences] Geofence deleted:', id);
      return true;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Failed to delete geofence';
      setError(message);
      console.error('[useGeofences] Error deleting:', message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Enable geofence monitoring
   */
  const enableGeofence = useCallback(async (id: string): Promise<boolean> => {
    const geofence = geofences.find(g => g.id === id);
    if (!geofence) {
      console.error('[useGeofences] enableGeofence: geofence not found:', id);
      return false;
    }

    // Check if background permissions granted
    const canMonitor = await locationService.canMonitorGeofences();
    if (!canMonitor.allowed) {
      console.warn('[useGeofences] enableGeofence: permissions not granted:', canMonitor.reason);
      setError(canMonitor.reason || 'Cannot enable monitoring');
      return false;
    }

    console.log('[useGeofences] enableGeofence: calling updateGeofence with enabled=true for:', id);
    // Send all notification settings to avoid partial update issues
    const updated = await updateGeofence(id, {
      notifyOnEnter: geofence.notifyOnEnter,
      notifyOnExit: geofence.notifyOnExit,
      enabled: true,
    } as any);

    if (updated) {
      console.log('[useGeofences] enableGeofence: update successful, enabled=', updated.enabled);
      // Note: syncMonitoring is already called in updateGeofence, no need to call startMonitoring again
      return true;
    }
    console.error('[useGeofences] enableGeofence: update failed');
    return false;
  }, [geofences, updateGeofence]);

  /**
   * Disable geofence monitoring
   */
  const disableGeofence = useCallback(async (id: string): Promise<boolean> => {
    console.log('[useGeofences] disableGeofence: calling updateGeofence with enabled=false for:', id);
    const geofence = geofences.find(g => g.id === id);
    if (!geofence) {
      console.error('[useGeofences] disableGeofence: geofence not found:', id);
      return false;
    }

    // Send all notification settings to avoid partial update issues
    const updated = await updateGeofence(id, {
      notifyOnEnter: geofence.notifyOnEnter,
      notifyOnExit: geofence.notifyOnExit,
      enabled: false,
    } as any);

    if (updated) {
      console.log('[useGeofences] disableGeofence: update successful, enabled=', updated.enabled);
      // syncMonitoring in updateGeofence will handle stopping monitoring
      return true;
    }
    console.error('[useGeofences] disableGeofence: update failed');
    return false;
  }, [geofences, updateGeofence]);

  /**
   * Start OS-level monitoring for a geofence
   */
  const startMonitoring = async (geofence: Geofence): Promise<void> => {
    const region: GeofenceRegion = {
      identifier: geofence.id,
      name: geofence.name,
      latitude: geofence.location.latitude,
      longitude: geofence.location.longitude,
      radius: geofence.radius,
      notifyOnEnter: geofence.notifyOnEnter,
      notifyOnExit: geofence.notifyOnExit,
      quietHoursStart: geofence.quietHoursStart,
      quietHoursEnd: geofence.quietHoursEnd,
    };

    const success = await geofenceMonitoringService.startMonitoringRegion(region);
    if (!success) {
      console.warn('[useGeofences] Failed to start monitoring:', geofence.id);
    }
  };

  /**
   * Sync geofences with OS-level monitoring.
   *
   * Builds the full desired set of enabled regions and passes them to
   * syncRegions() in ONE startGeofencingAsync call. This avoids the bug
   * where calling startGeofencingAsync one-by-one replaces the previous set,
   * leaving only the last geofence registered with the OS.
   */
  const syncMonitoring = async (geofencesToSync: Geofence[]): Promise<void> => {
    console.log(`[useGeofences] syncMonitoring called with ${geofencesToSync.length} geofence(s)`);
    console.log('[useGeofences] Geofence enabled states:', geofencesToSync.map(g => ({ id: g.id, name: g.name, enabled: g.enabled })));

    // Skip OS registration if background location permission hasn't been granted yet
    const canMonitor = await locationService.canMonitorGeofences();
    if (!canMonitor.allowed) {
      console.log('[useGeofences] syncMonitoring: skipping OS sync — background permission not granted');
      return;
    }

    const enabledRegions: GeofenceRegion[] = geofencesToSync
      .filter(g => g.enabled)
      .map(g => ({
        identifier: g.id,
        name: g.name,
        latitude: g.location.latitude,
        longitude: g.location.longitude,
        radius: g.radius,
        notifyOnEnter: g.notifyOnEnter,
        notifyOnExit: g.notifyOnExit,
        quietHoursStart: g.quietHoursStart,
        quietHoursEnd: g.quietHoursEnd,
        placeId: g.placeId,
      }));

    console.log(`[useGeofences] Syncing ${enabledRegions.length} enabled region(s) with OS:`, enabledRegions.map(r => r.identifier));
    await geofenceMonitoringService.syncRegions(enabledRegions);
    console.log('[useGeofences] Monitoring synced successfully');
  };

  /**
   * Get geofence by ID
   */
  const getGeofenceById = useCallback(
    (id: string): Geofence | undefined => {
      return geofences.find(g => g.id === id);
    },
    [geofences]
  );

  /**
   * Get nearby geofences within radius
   */
  const getNearbyGeofences = useCallback(
    (latitude: number, longitude: number, radiusKm: number = 5): Geofence[] => {
      return geofences.filter(geofence => {
        const distance = calculateDistance(
          latitude,
          longitude,
          geofence.location.latitude,
          geofence.location.longitude
        );
        return distance <= radiusKm;
      });
    },
    [geofences]
  );

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (deg: number): number => {
    return deg * (Math.PI / 180);
  };

  // Mirror geofences state to ref so stale useCallback closures can read the current list
  useEffect(() => {
    geofencesRef.current = geofences;
  }, [geofences]);

  // Load geofences on mount
  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  return {
    geofences,
    loading,
    error,
    refreshing,
    fetchGeofences,
    createGeofence,
    updateGeofence,
    deleteGeofence,
    enableGeofence,
    disableGeofence,
    getGeofenceById,
    getNearbyGeofences,
  };
}
