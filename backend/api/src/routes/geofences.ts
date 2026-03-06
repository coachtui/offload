/**
 * Geofences routes
 */

import { Router, Request, Response } from 'express';
import {
  createGeofence,
  getGeofenceById,
  listGeofences,
  checkLocation,
  getGeofenceObjects,
  updateGeofence,
  deleteGeofence,
} from '../services/geofenceService';
import { authenticate } from '../auth/middleware';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/geofences
 * List geofences
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const geofences = await listGeofences(req.user.id);
    res.json({ geofences });
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to list geofences',
    });
  }
});

/**
 * GET /api/v1/geofences/:id/objects
 * Get atomic objects associated with a geofence (used by background notification task)
 */
router.get('/:id/objects', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const objects = await getGeofenceObjects(req.user.id, req.params.id);
    res.json({ objects });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Geofence not found') {
        res.status(404).json({ error: 'NOT_FOUND', message: error.message });
        return;
      }
      if (error.message === 'Unauthorized') {
        res.status(403).json({ error: 'FORBIDDEN', message: error.message });
        return;
      }
    }
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get geofence objects',
    });
  }
});

/**
 * GET /api/v1/geofences/:id
 * Get geofence by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const geofence = await getGeofenceById(req.user.id, req.params.id);
    res.json({ geofence });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Geofence not found') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message,
        });
        return;
      }
      if (error.message === 'Unauthorized') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get geofence',
    });
  }
});

/**
 * POST /api/v1/geofences
 * Create geofence
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const geofence = await createGeofence(req.user.id, req.body);
    res.status(201).json({ geofence });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to create geofence',
    });
  }
});

/**
 * POST /api/v1/geofences/check
 * Check location against geofences
 */
router.post('/check', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const locationSchema = z.object({
      location: z.object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().optional(),
        altitude: z.number().optional(),
      }),
    });

    const { location } = locationSchema.parse(req.body);
    const result = await checkLocation(req.user.id, location);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to check location',
    });
  }
});

/**
 * PUT /api/v1/geofences/:id
 * Update geofence
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const geofence = await updateGeofence(req.user.id, req.params.id, req.body);
    res.json({ geofence });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Geofence not found') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message,
        });
        return;
      }
      if (error.message === 'Unauthorized') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to update geofence',
    });
  }
});

/**
 * DELETE /api/v1/geofences/:id
 * Delete geofence
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    await deleteGeofence(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Geofence not found') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message,
        });
        return;
      }
      if (error.message === 'Unauthorized') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to delete geofence',
    });
  }
});

export default router;
