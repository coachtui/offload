/**
 * Foreground proximity alerts.
 *
 * iOS background region monitoring is unreliable — it's delayed and won't fire
 * an ENTER event if you're already inside the region when monitoring starts.
 * This hook is the dependable path: whenever the app becomes active (and on
 * mount), it checks the device's current location against the user's geofences
 * and, if you're at one with open notes, surfaces them immediately in Home's
 * "For you right now" card AND as a local notification. No dependence on OS
 * background events.
 *
 * The in-app half used to be a floating banner pinned to the top of the screen,
 * which landed in the same place as the local notification it fires alongside —
 * two arrival alerts stacked over each other on every app open at a place. It
 * now reads as the place's own group inside Home's list instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiService } from '../services/api';
import { locationService } from '../services/locationService';
import { wasRecentlyNotified, markNotified } from '../services/arrivalLedger';
import { subscribeNotesChanged } from '../services/notesBus';
import type { AtomicObject } from '../types';

export interface ProximityMatch {
  geofenceId: string;
  placeId?: string | null;
  name: string;
  count: number;
  preview: string;
  /** The open notes linked to this place, newest-first as the API returns them. */
  objects: AtomicObject[];
}

// GPS jitter buffer added to the geofence radius when deciding "you're here".
const ARRIVAL_BUFFER_METERS = 75;

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
      // This is an arrival alert, so geofences with "notify on entry" switched
      // off are skipped — same rule the background path applies.
      let best: any = null;
      let bestDist = Infinity;
      for (const g of geofences) {
        if (!g.enabled || !g.notifyOnEnter || !g.location) continue;
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
        objects,
      };
      setMatch(next);

      // Fire a local notification too, gated on the arrival ledger shared with
      // the background geofence task — the OS often delivers the pending region
      // event moments after the app opens at a place, and without a shared
      // record the same arrival pings twice.
      if (!(await wasRecentlyNotified(best.id))) {
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
        await markNotified(best.id);
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
    // Closing one of the place's notes has to empty the group it was listed in,
    // without waiting for the next foreground.
    const unsubscribe = subscribeNotesChanged(() => { void check(); });
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [check]);

  return { match, dismiss: useCallback(() => setMatch(null), []) };
}
