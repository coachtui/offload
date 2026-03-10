import { useState, useEffect } from 'react';
import { AtomicObject } from '../types';
import { apiService } from '../services/api';
import { locationService } from '../services/locationService';

// Haversine distance in metres
function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreObject(
  obj: AtomicObject,
  userLat?: number,
  userLon?: number
): number {
  let score = 0;
  const now = Date.now();

  // Use whichever timestamp is more recent (created vs updated)
  const ageMs = Math.min(
    now - new Date(obj.createdAt).getTime(),
    now - new Date(obj.updatedAt).getTime()
  );

  const h = 3600000;
  const d = 86400000;

  // Recency — notes < 1h old aren't surfaced (just captured); > 7d fade out
  if (ageMs >= h && ageMs < 12 * h) score += 4;        // 1–12h: prime window
  else if (ageMs < 24 * h) score += 3;                  // 12–24h
  else if (ageMs < 48 * h) score += 2;                  // 24–48h
  else if (ageMs < 7 * d) score += 1;                   // 2–7d

  // Urgency — prefer v2 temporalHints, fall back to legacy metadata urgency
  const urgency = obj.temporalHints?.urgency ?? obj.metadata?.urgency ?? null;
  if (urgency === 'high') score += 4;
  else if (urgency === 'medium') score += 2;

  // Actionable
  if (obj.actionability?.isActionable) score += 2;

  // Object type
  if (obj.objectType === 'task' || obj.objectType === 'reminder') score += 2;
  else if (obj.objectType === 'decision' || obj.objectType === 'question') score += 1;

  // Location proximity — only if object was captured with a GPS fix
  if (userLat != null && userLon != null && obj.source?.location) {
    const dist = distanceMetres(
      userLat,
      userLon,
      obj.source.location.latitude,
      obj.source.location.longitude
    );
    if (dist <= 500) score += 3;
    else if (dist <= 2000) score += 1;
  }

  return score;
}

export function useForYou() {
  const [items, setItems] = useState<AtomicObject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const res = await apiService.getObjects({ limit: 40, dateFrom: sevenDaysAgo });

        if (cancelled) return;

        // Optionally enrich with current location (silent failure)
        let userLat: number | undefined;
        let userLon: number | undefined;
        try {
          const loc = await locationService.getCurrentLocation();
          if (loc) {
            userLat = loc.coords.latitude;
            userLon = loc.coords.longitude;
          }
        } catch {
          // location is optional — silently skip
        }

        if (cancelled) return;

        const surfaced = res.objects
          .filter((obj) => (obj as any).state !== 'archived')
          .map((obj) => ({ obj, score: scoreObject(obj, userLat, userLon) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ obj }) => obj);

        setItems(surfaced);
      } catch {
        // section simply won't show
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}
