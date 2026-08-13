/**
 * Reactive permission state.
 *
 * Re-reads on every foreground, which is what makes the Settings round-trip
 * work: the user leaves to grant "Always" location, comes back, and the banner
 * clears itself. Granting background location also arms geofence monitoring on
 * the spot — without that the newly-permitted regions sit unregistered until
 * something else happens to call a sync.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import {
  PermissionSnapshot,
  EMPTY_SNAPSHOT,
  getPermissionSnapshot,
} from '../services/permissionService';
import { syncGeofencesWithOS } from '../services/geofenceSync';
import { syncTimeRemindersWithOS } from '../services/timeReminderSync';

export interface UsePermissionStatusResult {
  status: PermissionSnapshot;
  /** True until the first snapshot resolves — suppresses a banner flash on mount. */
  loading: boolean;
  refresh: () => Promise<PermissionSnapshot>;
}

export function usePermissionStatus(): UsePermissionStatusResult {
  const [status, setStatus] = useState<PermissionSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  // Tracks the previous value so we only sync on the false → true edge rather
  // than on every foreground.
  const hadAlwaysRef = useRef(false);
  const hadNotificationsRef = useRef(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<PermissionSnapshot> => {
    const next = await getPermissionSnapshot();
    if (!mountedRef.current) return next;

    setStatus(next);
    setLoading(false);

    if (next.locationAlways && !hadAlwaysRef.current) {
      console.log('[usePermissionStatus] background location newly granted — arming geofences');
      void syncGeofencesWithOS('permission-granted');
    }
    hadAlwaysRef.current = next.locationAlways;

    // Local reminders can only be scheduled once notifications are granted, and
    // every reminder that existed before the grant is currently unscheduled and
    // owned by the server. This edge is where the device takes them over.
    if (next.notifications && !hadNotificationsRef.current) {
      console.log('[usePermissionStatus] notifications newly granted — scheduling reminders');
      void syncTimeRemindersWithOS('notifications-granted');
    }
    hadNotificationsRef.current = next.notifications;

    return next;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      mountedRef.current = false;
      sub.remove();
    };
  }, [refresh]);

  return { status, loading, refresh };
}
