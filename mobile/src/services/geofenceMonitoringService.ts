/**
 * Privacy-First Geofence Monitoring Service
 *
 * Uses OS-level geofence monitoring (iOS CoreLocation / Android Geofencing API)
 * - Battery efficient (hardware-level monitoring)
 * - Works in background without continuous tracking
 * - Only app receives entry/exit events
 * - No location history stored
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Task name for background geofence monitoring
const GEOFENCE_TASK_NAME = 'GEOFENCE_MONITORING_TASK';

export interface GeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  region: GeofenceRegion;
  timestamp: Date;
}

export type GeofenceEventCallback = (event: GeofenceEvent) => void | Promise<void>;

class GeofenceMonitoringService {
  private static instance: GeofenceMonitoringService;
  private activeRegions: Map<string, GeofenceRegion> = new Map();
  private eventCallbacks: GeofenceEventCallback[] = [];
  private initialized = false;

  private constructor() {}

  static getInstance(): GeofenceMonitoringService {
    if (!GeofenceMonitoringService.instance) {
      GeofenceMonitoringService.instance = new GeofenceMonitoringService();
    }
    return GeofenceMonitoringService.instance;
  }

  /**
   * Initialize geofence monitoring system
   * Must be called before any monitoring starts
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[GeofenceMonitoring] Initializing service...');

    // Configure notification handler
    await this.setupNotificationHandler();

    this.initialized = true;
    console.log('[GeofenceMonitoring] Service initialized');
  }

  /**
   * Setup notification handler for geofence events
   */
  private async setupNotificationHandler(): Promise<void> {
    // Request notification permissions
    const { status } = await Notifications.requestPermissionsAsync();

    if (status !== 'granted') {
      console.log('[GeofenceMonitoring] Notification permissions not granted');
      return;
    }

    // Configure notification behavior
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    console.log('[GeofenceMonitoring] Notification handler configured');
  }

  /**
   * Handle a geofence event — called from the module-level TaskManager.defineTask
   */
  async handleGeofenceEvent(event: GeofenceEvent): Promise<void> {
    // Trigger callbacks (if app is running)
    try {
      for (const callback of this.eventCallbacks) {
        await callback(event);
      }
    } catch (err) {
      console.error('[GeofenceMonitoring] Error in event callback:', err);
    }

    // Show local notification
    await this.showGeofenceNotification(event);
  }

  /**
   * Register a geofence region for OS-level monitoring.
   *
   * IMPORTANT: startGeofencingAsync REPLACES the full set of monitored regions
   * on every call. We must always pass ALL active regions — adding to the map
   * first and then calling updateActiveRegions() ensures this.
   */
  async startMonitoringRegion(region: GeofenceRegion): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Check OS limits (iOS: 20, Android: 100)
      const maxRegions = Platform.OS === 'ios' ? 20 : 100;
      const isUpdate = this.activeRegions.has(region.identifier);
      if (!isUpdate && this.activeRegions.size >= maxRegions) {
        console.warn(`[GeofenceMonitoring] Max regions reached (${maxRegions}), cannot add: ${region.identifier}`);
        return false;
      }

      // Add/update in map BEFORE calling the OS API so updateActiveRegions
      // picks up the new region in the full-set call.
      this.activeRegions.set(region.identifier, region);

      // Register ALL active regions in one call (replaces previous set).
      await this.updateActiveRegions();

      console.log(`[GeofenceMonitoring] Now monitoring ${this.activeRegions.size} region(s): [${Array.from(this.activeRegions.keys()).join(', ')}]`);
      return true;
    } catch (error: any) {
      // Revert map entry on failure so state stays consistent.
      this.activeRegions.delete(region.identifier);
      console.error('[GeofenceMonitoring] Error starting monitoring:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      return false;
    }
  }

  /**
   * Stop monitoring a specific geofence region
   */
  async stopMonitoringRegion(identifier: string): Promise<void> {
    if (!this.activeRegions.has(identifier)) {
      console.log(`[GeofenceMonitoring] Region not being monitored: ${identifier}`);
      return;
    }

    try {
      console.log(`[GeofenceMonitoring] Stopping monitoring for: ${identifier}`);

      // Remove from active regions
      this.activeRegions.delete(identifier);

      // If no more regions, stop all monitoring
      if (this.activeRegions.size === 0) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
        console.log('[GeofenceMonitoring] All monitoring stopped');
        return;
      }

      // Re-register remaining regions (can't remove individual ones)
      await this.updateActiveRegions();
    } catch (error) {
      console.error('[GeofenceMonitoring] Error stopping monitoring:', error);
    }
  }

  /**
   * Stop monitoring all geofence regions
   */
  async stopAllMonitoring(): Promise<void> {
    try {
      console.log('[GeofenceMonitoring] Stopping all monitoring');
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      this.activeRegions.clear();
      console.log('[GeofenceMonitoring] All regions stopped');
    } catch (error) {
      console.error('[GeofenceMonitoring] Error stopping all monitoring:', error);
    }
  }

  /**
   * Sync the full desired set of regions atomically.
   * Replaces activeRegions map entirely and makes a single startGeofencingAsync call.
   * Use this for bulk syncs (e.g. on app launch or after fetching geofences from server).
   */
  async syncRegions(regions: GeofenceRegion[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Replace the full in-memory set.
    this.activeRegions.clear();
    for (const r of regions) {
      this.activeRegions.set(r.identifier, r);
    }

    if (this.activeRegions.size === 0) {
      try {
        const isActive = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
        if (isActive) {
          await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
          console.log('[GeofenceMonitoring] syncRegions: no enabled regions — stopped geofencing');
        } else {
          console.log('[GeofenceMonitoring] syncRegions: no enabled regions, geofencing already inactive');
        }
      } catch (e) {
        console.warn('[GeofenceMonitoring] syncRegions: error stopping geofencing:', e);
      }
      return;
    }

    console.log(`[GeofenceMonitoring] syncRegions: registering ${this.activeRegions.size} region(s): [${Array.from(this.activeRegions.keys()).join(', ')}]`);
    await this.updateActiveRegions();
    console.log('[GeofenceMonitoring] syncRegions: complete');
  }

  /**
   * Re-register all currently tracked regions with the OS in a single call.
   * Must be called any time activeRegions changes so the OS set stays consistent.
   */
  private async updateActiveRegions(): Promise<void> {
    if (this.activeRegions.size === 0) return;

    const regions = Array.from(this.activeRegions.values()).map(r => ({
      identifier: r.identifier,
      latitude: r.latitude,
      longitude: r.longitude,
      radius: r.radius,
      notifyOnEnter: r.notifyOnEnter,
      notifyOnExit: r.notifyOnExit,
    }));

    console.log(`[GeofenceMonitoring] updateActiveRegions: calling startGeofencingAsync with ${regions.length} region(s): [${regions.map(r => r.identifier).join(', ')}]`);
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    console.log('[GeofenceMonitoring] updateActiveRegions: OS registration complete');
  }

  /**
   * Get list of actively monitored regions
   */
  getActiveRegions(): GeofenceRegion[] {
    return Array.from(this.activeRegions.values());
  }

  /**
   * Check if a region is being monitored
   */
  isMonitoring(identifier: string): boolean {
    return this.activeRegions.has(identifier);
  }

  /**
   * Register callback for geofence events
   */
  addEventCallback(callback: GeofenceEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Remove event callback
   */
  removeEventCallback(callback: GeofenceEventCallback): void {
    this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Show local notification for geofence event
   */
  private async showGeofenceNotification(event: GeofenceEvent): Promise<void> {
    try {
      // TODO: Fetch relevant objects from local database
      const objectCount = await this.getRelevantObjectCount(event.region.identifier);

      const title = event.type === 'enter'
        ? `📍 Arrived at ${event.region.identifier}`
        : `👋 Left ${event.region.identifier}`;

      const body = objectCount > 0
        ? `You have ${objectCount} relevant note${objectCount > 1 ? 's' : ''}`
        : 'Tap to view your notes';

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            geofenceId: event.region.identifier,
            eventType: event.type,
            screen: 'Objects',
            filter: { geofenceId: event.region.identifier },
          },
          sound: true,
        },
        trigger: null, // Show immediately
      });

      console.log(`[GeofenceMonitoring] Notification sent: ${title}`);
    } catch (error) {
      console.error('[GeofenceMonitoring] Error showing notification:', error);
    }
  }

  /**
   * Get count of relevant objects for a geofence via API
   */
  private async getRelevantObjectCount(geofenceId: string): Promise<number> {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) return 0;

      const response = await fetch(
        `${API_BASE_URL}/api/v1/geofences/${geofenceId}/objects`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return 0;

      const data = await response.json();
      return (data.objects?.length as number) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Respect quiet hours - check if notifications should be shown
   */
  private isInQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();

    // Default quiet hours: 10pm - 8am
    // TODO: Make this user-configurable
    const quietStart = 22; // 10pm
    const quietEnd = 8; // 8am

    return hour >= quietStart || hour < quietEnd;
  }

  /**
   * Get monitoring statistics (for privacy dashboard)
   */
  getMonitoringStats() {
    return {
      activeRegions: this.activeRegions.size,
      maxRegions: Platform.OS === 'ios' ? 20 : 100,
      regions: Array.from(this.activeRegions.values()).map(r => ({
        identifier: r.identifier,
        radius: r.radius,
        notifyOnEnter: r.notifyOnEnter,
        notifyOnExit: r.notifyOnExit,
      })),
    };
  }
}

// Export singleton instance
export const geofenceMonitoringService = GeofenceMonitoringService.getInstance();

// Export types
export type { GeofenceRegion, GeofenceEvent, GeofenceEventCallback };

// MUST be defined at module level (top-level scope) — Expo requirement.
// Calling defineTask inside a class method or lazy initializer causes silent failures.
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: any) => {
  console.log('[GeofenceMonitoring] Background task fired');

  if (error) {
    console.error('[GeofenceMonitoring] Background task error:', JSON.stringify(error));
    return;
  }

  if (!data) {
    console.warn('[GeofenceMonitoring] Background task fired with no data');
    return;
  }

  const { eventType, region } = data;
  console.log(`[GeofenceMonitoring] Event: ${eventType === Location.GeofencingEventType.Enter ? 'ENTER' : 'EXIT'} — region: ${region?.identifier}`);

  const event: GeofenceEvent = {
    type: eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit',
    region: {
      identifier: region.identifier,
      latitude: region.latitude,
      longitude: region.longitude,
      radius: region.radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
    timestamp: new Date(),
  };

  // Show local notification (service instance handles this)
  await geofenceMonitoringService.handleGeofenceEvent(event);
});
