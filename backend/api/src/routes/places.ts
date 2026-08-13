/**
 * Place Intelligence API routes
 *
 * GET    /api/v1/places                              — list user's inferred places
 * GET    /api/v1/places/overview                     — merged geofences + places overview
 * GET    /api/v1/places/:id/objects                  — get active linked objects
 * POST   /api/v1/places/:id/notify                   — check cooldown + return objects (called on geofence enter)
 * POST   /api/v1/places/:id/promote                  — promote a detected place to a manual geofence reminder (migrates notes)
 * POST   /api/v1/places/:placeId/objects/:objectId/done     — mark done
 * POST   /api/v1/places/:placeId/objects/:objectId/dismiss  — dismiss for current visit
 * POST   /api/v1/places/:placeId/objects/:objectId/snooze   — snooze with { until: ISO string }
 * DELETE /api/v1/places/:placeId/objects/:objectId          — unlink
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { PlaceModel } from '../models/Place';
import {
  getPlaceObjects,
  getPlaceNotifyPayload,
  markPlaceObjectDone,
  dismissPlaceObject,
  snoozePlaceObject,
  unlinkPlaceObject,
  promotePlaceToGeofence,
  getPendingPlaceLookups,
  resolvePendingLookup,
  dismissPendingLookup,
} from '../services/placeService';
import { getPlacesOverview } from '../services/geofenceService';

const router = Router();
router.use(authenticate);

// ─── Pending lookups — place names that need the user's help ───────────────
// Declared before the /:id param routes so "pending" is never read as an id.

router.get('/pending', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const pending = await getPendingPlaceLookups(userId);
    res.json({ pending });
  } catch (error: any) {
    console.error('[places] GET /pending error:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Failed to load pending lookups' });
  }
});

const resolvePendingSchema = z.union([
  z.object({ candidateIndex: z.number().int().min(0) }),
  z.object({ lat: z.number(), lng: z.number(), radius: z.number().positive().optional() }),
  z.object({ geofenceId: z.string().min(1) }),
]);

router.post('/pending/:id/resolve', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = resolvePendingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  try {
    // The union is validated above; this zod version's union inference widens
    // members to optionals, so re-narrow to the service's type.
    const choice = parsed.data as import('../services/placeService').PendingResolveChoice;
    const geofence = await resolvePendingLookup(userId, req.params.id, choice);
    res.json({ geofence });
  } catch (error: any) {
    console.error('[places] POST /pending/:id/resolve error:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Failed to resolve lookup' });
  }
});

router.post('/pending/:id/dismiss', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await dismissPendingLookup(userId, req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[places] POST /pending/:id/dismiss error:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Failed to dismiss lookup' });
  }
});

// ─── GET /api/v1/places ────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const places = await PlaceModel.findByUserId(userId);
    res.json({ places });
  } catch (error) {
    console.error('[places] GET / error:', error);
    res.status(500).json({ error: 'Failed to list places' });
  }
});

// ─── GET /api/v1/places/overview ───────────────────────────────────────────

router.get('/overview', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const places = await getPlacesOverview(userId);
    res.json({ places });
  } catch (error: any) {
    console.error('[places] GET /overview error:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Failed to load places overview' });
  }
});

// ─── GET /api/v1/places/:id/objects ───────────────────────────────────────

router.get('/:id/objects', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const objects = await getPlaceObjects(userId, req.params.id);
    res.json({ objects });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to get place objects' });
  }
});

// ─── POST /api/v1/places/:id/notify ───────────────────────────────────────
// Called by mobile geofence monitoring background task on geofence entry.
// Checks cooldown and returns active objects (or empty if cooling down).

router.post('/:id/notify', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = await getPlaceNotifyPayload(userId, req.params.id);

    if (!payload) {
      // In cooldown — mobile should suppress notification
      return res.json({ cooldown: true, objects: [], placeName: null });
    }

    res.json({ cooldown: false, objects: payload.objects, placeName: payload.placeName });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to get notify payload' });
  }
});

// ─── POST /api/v1/places/:placeId/objects/:objectId/done ─────────────────

router.post('/:placeId/objects/:objectId/done', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await markPlaceObjectDone(userId, req.params.placeId, req.params.objectId);
    res.json({ ok: true });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to mark done' });
  }
});

// ─── POST /api/v1/places/:placeId/objects/:objectId/dismiss ──────────────

router.post('/:placeId/objects/:objectId/dismiss', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await dismissPlaceObject(userId, req.params.placeId, req.params.objectId);
    res.json({ ok: true });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to dismiss' });
  }
});

// ─── POST /api/v1/places/:placeId/objects/:objectId/snooze ───────────────

const snoozeSchema = z.object({
  until: z.string().datetime({ message: 'until must be an ISO 8601 datetime string' }),
});

router.post('/:placeId/objects/:objectId/snooze', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = snoozeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }

  try {
    const until = new Date(parsed.data.until);
    await snoozePlaceObject(userId, req.params.placeId, req.params.objectId, until);
    res.json({ ok: true });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to snooze' });
  }
});

// ─── POST /api/v1/places/:id/promote ──────────────────────────────────────
// Promote a detected place into a manual geofence reminder (migrates notes).

router.post('/:id/promote', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const geofence = await promotePlaceToGeofence(userId, req.params.id);
    res.json({ geofence });
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to promote place' });
  }
});

// ─── DELETE /api/v1/places/:placeId/objects/:objectId ────────────────────

router.delete('/:placeId/objects/:objectId', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await unlinkPlaceObject(userId, req.params.placeId, req.params.objectId);
    res.status(204).send();
  } catch (error: any) {
    const status = error.status ?? 500;
    res.status(status).json({ error: error.message || 'Failed to unlink' });
  }
});

export default router;
