/**
 * Foreground proximity alerts.
 *
 * iOS background region monitoring is unreliable — it's delayed and won't fire
 * an ENTER event if you're already inside the region when monitoring starts.
 * This hook is the dependable path: whenever the app becomes active (and on
 * mount), it checks the device's current location against the user's geofences
 * and, if you're at one with open notes, surfaces them immediately via an
 * in-app banner AND a local notification. No dependence on OS background events.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiService } from '../services/api';
import { locationService } from '../services/locationService';

export interface ProximityMatch {
  geofenceId: string;
  placeId?: string | null;
  name: string;
  count: number;
  preview: string;
}

// GPS jitter buffer added to the geofence radius when deciding "you're here".
const ARRIVAL_BUFFER_METERS = 75;
// Don't re-fire a notification for the same geofence within this window.
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function useProximityAlerts() {
  const [match, setMatch] = useState<ProximityMatch | null>(null);
  const lastNotifiedRef = useRef<Record<string, number>>({});
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const token = await apiService.getStoredToken();
      if (!token) return; // not logged in — nothing to check

      const loc = await locationService.getCurrentLocation();
      if (!loc) return;
      const { latitude, longitude } = loc.coords;

      const { geofences } = await apiService.getGeofences();

      // Nearest enabled geofence whose radius (+ GPS buffer) we're inside.
      let best: any = null;
      let bestDist = Infinity;
      for (const g of geofences) {
        if (!g.enabled || !g.location) continue;
        const d = haversineMeters(latitude, longitude, g.location.latitude, g.location.longitude);
        if (d <= (g.radius ?? 150) + ARRIVAL_BUFFER_METERS && d < bestDist) {
          best = g;
          bestDist = d;
        }
      }

      if (!best) {
        setMatch(null);
        return;
      }

      const { objects } = await apiService.getGeofenceObjects(best.id, true);
      if (!objects || objects.length === 0) {
        setMatch(null);
        return;
      }

      const first: any = objects[0];
      const preview: string = first?.title || first?.cleanedText || first?.content || 'Tap to view your notes';
      const next: ProximityMatch = {
        geofenceId: best.id,
        placeId: best.placeId ?? null,
        name: best.name,
        count: objects.length,
        preview,
      };
      setMatch(next);

      // Fire a local notification too, with a per-geofence cooldown so re-opening
      // the app at the same place doesn't spam.
      const now = Date.now();
      if (now - (lastNotifiedRef.current[best.id] ?? 0) > NOTIFY_COOLDOWN_MS) {
        lastNotifiedRef.current[best.id] = now;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `📍 You're at ${best.name}`,
            body: next.count > 1 ? `${next.count} notes · ${preview}` : preview,
            data: {
              screen: 'PlaceSummary',
              placeId: next.placeId,
              geofenceId: best.id,
              placeName: best.name,
            },
            sound: true,
          },
          trigger: null,
        });
        console.log(`[Proximity] notified for "${best.name}" (${Math.round(bestDist)}m, ${next.count} note(s))`);
      }
    } catch (e) {
      console.warn('[Proximity] check failed:', e);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return { match, dismiss: useCallback(() => setMatch(null), []) };
}
