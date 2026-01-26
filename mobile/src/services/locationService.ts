/**
 * Privacy-First Location Service
 *
 * Principles:
 * - Only request location when explicitly needed
 * - Clear explanations for each permission request
 * - No location storage except user-created geofences
 * - Transparent about when and why location is accessed
 */

import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface LocationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  whenInUse: boolean;
  always: boolean;
}

export interface LocationUsageReason {
  action: 'create_geofence' | 'attach_to_note' | 'view_map' | 'check_nearby';
  description: string;
  requiresBackground: boolean;
}

class LocationService {
  private static instance: LocationService;
  private lastPermissionCheck: Date | null = null;

  private constructor() {}

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * Get human-readable explanation for location permission request
   */
  getPermissionExplanation(reason: LocationUsageReason['action']): string {
    const explanations = {
      create_geofence:
        "We need your location once to set up this geofence. " +
        "Your location won't be tracked - we only save the geofence coordinates you choose.",
      attach_to_note:
        "Add your current location to this note. " +
        "Location is only saved if you choose to save the note.",
      view_map:
        "Show your current location on the map. " +
        "This is used once and not stored.",
      check_nearby:
        "Check which geofences are near you. " +
        "Your location is not saved or sent to the server.",
    };
    return explanations[reason];
  }

  /**
   * Get background permission explanation
   */
  getBackgroundPermissionExplanation(): string {
    return (
      "To notify you when entering geofences while the app is closed, " +
      "we need background location access.\n\n" +
      "Your location is NOT tracked or stored. " +
      "The system only checks if you enter geofences you created.\n\n" +
      "You can disable this anytime in Settings."
    );
  }

  /**
   * Check current permission status
   */
  async checkPermissions(): Promise<LocationPermissionStatus> {
    this.lastPermissionCheck = new Date();

    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();

    return {
      granted: foreground.granted || background.granted,
      canAskAgain: foreground.canAskAgain,
      whenInUse: foreground.granted,
      always: background.granted,
    };
  }

  /**
   * Request foreground ("when in use") location permission
   * This is used for one-time location access (creating geofences, viewing map)
   */
  async requestForegroundPermission(reason: LocationUsageReason): Promise<boolean> {
    console.log(`[Privacy] Requesting foreground location for: ${reason.action}`);
    console.log(`[Privacy] Explanation: ${reason.description}`);

    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';

    if (granted) {
      console.log('[Privacy] Foreground location permission granted');
    } else {
      console.log('[Privacy] Foreground location permission denied');
    }

    return granted;
  }

  /**
   * Request background ("always") location permission
   * This is ONLY for geofence monitoring - must be requested separately
   * with clear explanation
   */
  async requestBackgroundPermission(): Promise<boolean> {
    // Must have foreground permission first
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      console.log('[Privacy] Cannot request background - foreground not granted');
      return false;
    }

    console.log('[Privacy] Requesting background location for geofence monitoring');

    const { status } = await Location.requestBackgroundPermissionsAsync();
    const granted = status === 'granted';

    if (granted) {
      console.log('[Privacy] Background location permission granted');
    } else {
      console.log('[Privacy] Background location permission denied');
    }

    return granted;
  }

  /**
   * Get current location (one-time)
   * Only used when user explicitly needs their location
   * Never stored automatically
   */
  async getCurrentLocation(): Promise<Location.LocationObject | null> {
    const permissions = await this.checkPermissions();

    if (!permissions.whenInUse) {
      console.log('[Privacy] Cannot get location - no permission');
      return null;
    }

    try {
      console.log('[Privacy] Getting current location (one-time access)');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Balance accuracy vs battery
      });

      console.log('[Privacy] Location obtained - not stored');
      return location;
    } catch (error) {
      console.error('[Privacy] Error getting location:', error);
      return null;
    }
  }

  /**
   * Check if location services are enabled on device
   */
  async isLocationEnabled(): Promise<boolean> {
    return await Location.hasServicesEnabledAsync();
  }

  /**
   * Open device location settings
   */
  async openSettings(): Promise<void> {
    if (Platform.OS === 'ios') {
      await Location.enableNetworkProviderAsync();
    }
    // For Android, user must open settings manually
  }

  /**
   * Get privacy-friendly location summary
   * (Only shows if permissions granted, doesn't access location)
   */
  async getPrivacySummary(): Promise<{
    permissionsGranted: string[];
    backgroundEnabled: boolean;
    locationServicesEnabled: boolean;
  }> {
    const permissions = await this.checkPermissions();
    const servicesEnabled = await this.isLocationEnabled();

    const granted: string[] = [];
    if (permissions.whenInUse) granted.push('Foreground (When Using App)');
    if (permissions.always) granted.push('Background (Always)');

    return {
      permissionsGranted: granted.length > 0 ? granted : ['None'],
      backgroundEnabled: permissions.always,
      locationServicesEnabled: servicesEnabled,
    };
  }

  /**
   * Validate if user can create geofences
   */
  async canCreateGeofence(): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const servicesEnabled = await this.isLocationEnabled();
    if (!servicesEnabled) {
      return {
        allowed: false,
        reason: 'Location services are disabled on your device. Please enable them in Settings.',
      };
    }

    const permissions = await this.checkPermissions();
    if (!permissions.whenInUse) {
      return {
        allowed: false,
        reason: 'Location permission required to create geofences.',
      };
    }

    return { allowed: true };
  }

  /**
   * Validate if background monitoring can work
   */
  async canMonitorGeofences(): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const permissions = await this.checkPermissions();

    if (!permissions.always) {
      return {
        allowed: false,
        reason: 'Background location permission required for geofence notifications.',
      };
    }

    const servicesEnabled = await this.isLocationEnabled();
    if (!servicesEnabled) {
      return {
        allowed: false,
        reason: 'Location services disabled.',
      };
    }

    return { allowed: true };
  }
}

// Export singleton instance
export const locationService = LocationService.getInstance();

// Export types
export type { LocationUsageReason };
