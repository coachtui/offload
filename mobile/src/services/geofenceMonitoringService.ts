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
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Task name for background geofence monitoring
const GEOFENCE_TASK_NAME = 'GEOFENCE_MONITORING_TASK';

// Persisted region metadata file — readable by background task JS context
const REGIONS_FILE_NAME = 'geofence_regions.json';

function persistRegions(regions: GeofenceRegion[]): void {
  try {
    new File(Paths.document, REGIONS_FILE_NAME).write(JSON.stringify(regions));
  } catch (e) {
    console.warn('[GeofenceMonitoring] Failed to persist regions:', e);
  }
}

async function loadPersistedRegions(): Promise<GeofenceRegion[]> {
  try {
    const file = new File(Paths.document, REGIONS_FILE_NAME);
    if (!file.exists) return [];
    const json = await file.text();
    return JSON.parse(json) as GeofenceRegion[];
  } catch (e) {
    console.warn('[GeofenceMonitoring] Failed to load persisted regions:', e);
    return [];
  }
}

export interface GeofenceRegion {
  identifier: string;
  name: string; // Human-readable geofence name
  latitude: number;
  longitude: number;
  radius: number; // meters
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
  quietHoursStart?: string; // HH:MM — if both set, notifications suppressed in that window
  quietHoursEnd?: string;   // HH:MM
  placeId?: string;         // Set for inferred places — routes to PlaceSummaryScreen
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
        shouldShowBanner: true,
        shouldShowList: true,
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

    // Check if we should notify for this event type based on geofence preferences
    const shouldNotify = (event.type === 'enter' && event.region.notifyOnEnter) ||
                         (event.type === 'exit' && event.region.notifyOnExit);

    if (!shouldNotify) {
      console.log(`[GeofenceMonitoring] Skipping notification for ${event.type} event (not enabled for this geofence)`);
      return;
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
      persistRegions(Array.from(this.activeRegions.values()));

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
    persistRegions(Array.from(this.activeRegions.values()));
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
      // quietHours fields are metadata only (not passed to OS API, used locally)
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
   * Show local notification for geofence event.
   *
   * Inferred places (region.placeId set): calls /places/:id/notify for cooldown check
   * + bundled objects, then routes to PlaceSummaryScreen.
   *
   * Manual geofences: existing behaviour — fetches geofence objects, routes to Objects screen.
   */
  private async showGeofenceNotification(event: GeofenceEvent): Promise<void> {
    console.log('[GeofenceMonitoring] showGeofenceNotification called for:', event.type, event.region.name);

    try {
      if (this.isInQuietHours(event.region)) {
        console.log('[GeofenceMonitoring] Skipping notification (quiet hours)');
        return;
      }

      if (event.region.placeId) {
        await this.showPlaceNotification(event);
      } else {
        await this.showManualGeofenceNotification(event);
      }
    } catch (error) {
      console.error('[GeofenceMonitoring] Error showing notification:', error);
    }
  }

  /**
   * Notification for an inferred place — uses /places/:id/notify (cooldown-aware).
   */
  private async showPlaceNotification(event: GeofenceEvent): Promise<void> {
    const placeId = event.region.placeId!;

    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) {
        console.warn('[GeofenceMonitoring] No access token — skipping place notification');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/places/${placeId}/notify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.warn(`[GeofenceMonitoring] Place notify API failed (${response.status})`);
        return;
      }

      const data = await response.json();

      if (data.cooldown) {
        console.log(`[GeofenceMonitoring] Place ${placeId} in cooldown — suppressing notification`);
        return;
      }

      const objects: any[] = data.objects || [];
      const placeName: string = data.placeName || event.region.name;
      const count = objects.length;

      const title = `📍 You're at ${placeName}`;
      let body: string;
      if (count === 0) {
        body = 'Tap to view your notes';
      } else if (count === 1) {
        const raw: string = objects[0].title || objects[0].content || '';
        body = raw.length > 60 ? raw.slice(0, 58) + '…' : raw;
      } else {
        body = `${count} notes waiting`;
      }

      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            placeId,
            placeName,
            geofenceId: event.region.identifier,
            eventType: event.type,
            screen: 'PlaceSummary',
          },
          sound: true,
        },
        trigger: null,
      });

      console.log(`[GeofenceMonitoring] Place notification scheduled: ${title} (id: ${notifId})`);
    } catch (error) {
      console.warn('[GeofenceMonitoring] Error in showPlaceNotification:', error);
    }
  }

  /**
   * Notification for a manual geofence — original behaviour.
   */
  private async showManualGeofenceNotification(event: GeofenceEvent): Promise<void> {
    const { count, titles } = await this.getLinkedObjectsSummary(event.region.identifier);
    console.log(`[GeofenceMonitoring] Manual geofence linked objects: count=${count}`);

    const title = event.type === 'enter'
      ? `📍 Arrived at ${event.region.name}`
      : `👋 Left ${event.region.name}`;

    let body: string;
    if (count === 0) {
      body = 'Tap to view your notes';
    } else if (count <= 3) {
      body = titles.join(', ');
    } else {
      body = `${titles.slice(0, 2).join(', ')} +${count - 2} more`;
    }

    console.log('[GeofenceMonitoring] Scheduling manual geofence notification:', title, '|', body);
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          geofenceId: event.region.identifier,
          geofenceName: event.region.name,
          eventType: event.type,
          screen: 'Objects',
        },
        sound: true,
      },
      trigger: null,
    });

    console.log(`[GeofenceMonitoring] Notification scheduled: ${title} (id: ${notifId})`);
  }

  /**
   * Fetch the linked objects for a geofence and return count + top-3 truncated titles.
   *
   * KNOWN ISSUE: Uses JWT from SecureStore which may be expired when background task fires.
   * Fails gracefully (returns count=0, titles=[]).
   * TODO: Implement token refresh or local caching strategy.
   */
  private async getLinkedObjectsSummary(
    geofenceId: string
  ): Promise<{ count: number; titles: string[] }> {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) {
        console.warn('[GeofenceMonitoring] No access token — skipping linked objects fetch');
        return { count: 0, titles: [] };
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/geofences/${geofenceId}/objects`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        console.warn(`[GeofenceMonitoring] API call failed (status ${response.status}) — token may be expired`);
        return { count: 0, titles: [] };
      }

      const data = await response.json();
      const objects: any[] = data.objects || [];
      const count = objects.length;

      // Extract top-3 titles, truncated to 35 chars each so the notification stays readable
      const titles = objects
        .slice(0, 3)
        .map((o: any) => {
          const raw: string = o.title || o.content || '';
          return raw.length > 35 ? raw.slice(0, 33) + '…' : raw;
        })
        .filter(Boolean);

      console.log(`[GeofenceMonitoring] getLinkedObjectsSummary: geofence ${geofenceId} → count=${count}`);
      return { count, titles };
    } catch (error) {
      console.warn('[GeofenceMonitoring] Error fetching linked objects summary:', error);
      return { count: 0, titles: [] };
    }
  }

  /**
   * Check if current time falls within the geofence's configured quiet hours.
   * Returns false (no suppression) if quietHoursStart/End are not set.
   */
  private isInQuietHours(region: GeofenceRegion): boolean {
    if (!region.quietHoursStart || !region.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = region.quietHoursStart.split(':').map(Number);
    const [endH, endM] = region.quietHoursEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight window (e.g. 22:00–08:00)
    const inQuietHours = startMinutes > endMinutes
      ? currentMinutes >= startMinutes || currentMinutes < endMinutes
      : currentMinutes >= startMinutes && currentMinutes < endMinutes;

    console.log(`[GeofenceMonitoring] Quiet hours check: ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}, window=${region.quietHoursStart}-${region.quietHoursEnd}, quiet=${inQuietHours}`);
    return inQuietHours;
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

// (types already exported inline above with `export interface` / `export type`)

// MUST be defined at module level (top-level scope) — Expo requirement.
// Calling defineTask inside a class method or lazy initializer causes silent failures.
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: any) => {
  console.log('[GeofenceMonitoring] ========== BACKGROUND TASK FIRED ==========');
  console.log('[GeofenceMonitoring] Timestamp:', new Date().toISOString());

  if (error) {
    console.error('[GeofenceMonitoring] Background task error:', JSON.stringify(error));
    return;
  }

  if (!data) {
    console.warn('[GeofenceMonitoring] Background task fired with no data');
    return;
  }

  const { eventType, region } = data;
  console.log(`[GeofenceMonitoring] Event type: ${eventType === Location.GeofencingEventType.Enter ? 'ENTER' : 'EXIT'}`);
  console.log(`[GeofenceMonitoring] Region: ${region?.identifier} (lat: ${region?.latitude}, lng: ${region?.longitude}, radius: ${region?.radius}m)`);

  // Load region metadata from persisted file (in-memory map is empty in background context)
  const persistedRegions = await loadPersistedRegions();
  const fullRegion = persistedRegions.find(r => r.identifier === region.identifier);

  if (!fullRegion) {
    console.warn('[GeofenceMonitoring] Region not found in persisted regions:', region.identifier);
    console.warn('[GeofenceMonitoring] Falling back to bare region data (no notify prefs)');
    // Fall back: use bare OS region data — treat as notify-on-both so user gets the alert
  }

  const resolvedRegion: GeofenceRegion = fullRegion ?? {
    identifier: region.identifier,
    name: region.identifier,
    latitude: region.latitude,
    longitude: region.longitude,
    radius: region.radius,
    notifyOnEnter: true,
    notifyOnExit: true,
  };

  const event: GeofenceEvent = {
    type: eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit',
    region: resolvedRegion,
    timestamp: new Date(),
  };

  // Show local notification (service instance handles this)
  console.log('[GeofenceMonitoring] Calling handleGeofenceEvent...');
  await geofenceMonitoringService.handleGeofenceEvent(event);
  console.log('[GeofenceMonitoring] Background task completed');
});
