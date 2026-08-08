/**
 * Standalone geofence → OS sync.
 *
 * Pulled out of useGeofences so it can be called from places that have no
 * business mounting a CRUD hook — chiefly the permission flow, which must arm
 * monitoring the instant "Always" location is granted. Until that happens
 * syncMonitoring short-circuits on the permission check, so every geofence the
 * backend created while the user was unpermissioned exists server-side and is
 * registered nowhere.
 */

import { apiService } from './api';
import { locationService } from './locationService';
import { geofenceMonitoringService, GeofenceRegion } from './geofenceMonitoringService';

/**
 * Fetch the user's geofences and register the enabled ones with the OS.
 * Returns the number of regions registered, or 0 if monitoring isn't possible.
 * Never throws — callers are fire-and-forget UI paths.
 */
export async function syncGeofencesWithOS(reason: string): Promise<number> {
  try {
    const canMonitor = await locationService.canMonitorGeofences();
    if (!canMonitor.allowed) {
      console.log(`[geofenceSync] (${reason}) skipping — ${canMonitor.reason}`);
      return 0;
    }

    const { geofences } = await apiService.getGeofences();
    const regions: GeofenceRegion[] = geofences
      .filter((g: any) => g.enabled && g.location)
      .map((g: any) => ({
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
        // Snapshotted into geofence_regions.json so a background wake that
        // cannot reach the backend still knows whether notes are waiting here —
        // and can say what the newest one is about.
        openCount: g.openObjectCount ?? 0,
        openPreview: g.openPreview ?? undefined,
      }));

    console.log(`[geofenceSync] (${reason}) syncing ${regions.length} region(s)`);
    await geofenceMonitoringService.syncRegions(regions);
    return regions.length;
  } catch (err) {
    console.warn(`[geofenceSync] (${reason}) failed:`, err);
    return 0;
  }
}
