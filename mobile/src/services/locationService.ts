/**
 * Location Service
 *
 * Principles:
 * - Only request location when explicitly needed
 * - Clear explanations for each permission request
 * - Never stream location: one-shot reads in the foreground, OS region
 *   monitoring in the background. No watchPositionAsync, no
 *   startLocationUpdatesAsync, no significant-change monitoring.
 *
 * Where location actually goes — the user-facing copy below has to match this,
 * so keep the two in sync:
 *
 *   recording        → coordinates are POSTed with the transcript and persisted
 *                      on the session and its notes (backend routes/voice.ts).
 *                      This is what makes "milk at Safeway" resolve nearby.
 *   place resolution → the server sends an approximate viewbox derived from
 *                      those coordinates to OpenStreetMap Nominatim, a third
 *                      party (backend placeResolutionService.ts).
 *   arrival          → no coordinates leave the device. Offload POSTs a place
 *                      id to ask which notes are waiting, which does tell the
 *                      server you arrived, and it stores a cooldown timestamp.
 *   proximity check  → foreground only, compared on-device against geofences
 *                      fetched from the server. The reading itself is not sent.
 *
 * So: no location history, no background stream — but "location never leaves
 * the device" would be false, and this file must not say it.
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
        "Offload reads your location once to centre this place on the map. " +
        "It isn't tracked afterwards — only the place you save is kept.",
      attach_to_note:
        "Offload saves your coordinates alongside this note, so a place you " +
        "mention resolves to the one near you. The note carries them until you " +
        "delete it.",
      view_map:
        "Offload reads your location once to centre the map. " +
        "The reading isn't saved.",
      check_nearby:
        "Offload compares your location against your saved places on this " +
        "device. The reading itself isn't sent anywhere.",
    };
    return explanations[reason];
  }

  /**
   * Get background permission explanation
   */
  getBackgroundPermissionExplanation(): string {
    return (
      "To remind you at a place while Offload is closed, iOS needs location " +
      "set to \"Always\".\n\n" +
      "The crossing is detected on your phone — iOS wakes Offload only at the " +
      "boundary of a place you saved. Offload doesn't continuously track your " +
      "location or upload a history of where you've been. On arrival it asks " +
      "the server which notes are waiting there.\n\n" +
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
    // Must have foreground permission first — request it if not already granted
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      console.log('[Privacy] Requesting foreground before background');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Privacy] Foreground denied — cannot request background');
        return false;
      }
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
   *
   * A single read, never a subscription. This service does not persist the
   * result — but callers may: RecordScreen hands it to the save-transcript call,
   * which stores it on the note. "Not stored" is a property of this function,
   * not of the reading it returns.
   */
  async getCurrentLocation(): Promise<Location.LocationObject | null> {
    const permissions = await this.checkPermissions();

    if (!permissions.whenInUse) {
      console.log('[Privacy] Cannot get location - no permission');
      return null;
    }

    try {
      console.log('[Privacy] Getting current location (one-time access)');
      // getCurrentPositionAsync can hang indefinitely when the device can't get a
      // fix (indoors, weak GPS) — a hang is not an error, so the catch never runs.
      // Cap it so it can never block the caller (e.g. the record button, which
      // awaits this before it can start recording). On timeout, fall back to the
      // last known position; location is optional for recording either way.
      const fresh = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Balance accuracy vs battery
      }).catch(() => null); // swallow late rejection so Promise.race loser is safe

      const timeout = new Promise<null>(resolve =>
        setTimeout(() => resolve(null), 5000)
      );

      const location = await Promise.race([fresh, timeout]);
      if (location) {
        console.log('[Location] One-time fix obtained — retention is up to the caller');
        return location;
      }

      console.warn('[Privacy] getCurrentPosition timed out — using last known position');
      return await Location.getLastKnownPositionAsync().catch(() => null);
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
