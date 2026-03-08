/**
 * Atomic objects routes
 */

import { Router, Request, Response } from 'express';
import {
  createObject,
  getObjectById,
  listObjects,
  listStaleActionables,
  updateObject,
  deleteObject,
  findSimilarObjects,
} from '../services/objectService';
import { authenticate } from '../auth/middleware';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/objects
 * List atomic objects
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

    const category = req.query.category
      ? (Array.isArray(req.query.category)
          ? req.query.category
          : [req.query.category]) as string[]
      : undefined;

    const domain = req.query.domain
      ? (Array.isArray(req.query.domain)
          ? req.query.domain
          : [req.query.domain]) as string[]
      : undefined;

    const objectType = req.query.objectType
      ? (Array.isArray(req.query.objectType)
          ? req.query.objectType
          : [req.query.objectType]) as string[]
      : undefined;

    const dateFrom = req.query.dateFrom
      ? new Date(req.query.dateFrom as string)
      : undefined;
    const dateTo = req.query.dateTo
      ? new Date(req.query.dateTo as string)
      : undefined;

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : undefined;
    const offset = req.query.offset
      ? parseInt(req.query.offset as string, 10)
      : undefined;

    const result = await listObjects(req.user.id, {
      category: category as any,
      domain,
      objectType,
      dateFrom,
      dateTo,
      search: req.query.search as string,
      limit,
      offset,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to list objects',
    });
  }
});

/**
 * GET /api/v1/objects/stale-actionables
 * Objects with is_actionable=true, older than 7 days, no linked resolution
 */
router.get('/stale-actionables', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const objects = await listStaleActionables(req.user.id);
    res.json({ objects });
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch stale actionables',
    });
  }
});

/**
 * GET /api/v1/objects/:id
 * Get atomic object by ID
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

    const object = await getObjectById(req.user.id, req.params.id);
    res.json({ object });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Object not found') {
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
      message: error instanceof Error ? error.message : 'Failed to get object',
    });
  }
});

/**
 * GET /api/v1/objects/:id/similar
 * Get similar atomic objects
 */
router.get('/:id/similar', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 5;

    const similarObjects = await findSimilarObjects(
      req.user.id,
      req.params.id,
      limit
    );

    res.json({ objects: similarObjects });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Object not found') {
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
      message:
        error instanceof Error ? error.message : 'Failed to find similar objects',
    });
  }
});

/**
 * POST /api/v1/objects
 * Create atomic object
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

    const object = await createObject(req.user.id, req.body);
    res.status(201).json({ object });
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
      message: error instanceof Error ? error.message : 'Failed to create object',
    });
  }
});

/**
 * PUT /api/v1/objects/:id
 * Update atomic object
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

    const object = await updateObject(req.user.id, req.params.id, req.body);
    res.json({ object });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Object not found') {
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
      message: error instanceof Error ? error.message : 'Failed to update object',
    });
  }
});

/**
 * DELETE /api/v1/objects/:id
 * Delete atomic object
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

    await deleteObject(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Object not found') {
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
      message: error instanceof Error ? error.message : 'Failed to delete object',
    });
  }
});

/**
 * POST /api/v1/objects/:id/state
 * Transition an object's lifecycle state.
 * Body: { state: 'open' | 'active' | 'resolved' | 'archived', evolvedFromId?: string }
 */
router.post('/:id/state', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const { state, evolvedFromId } = req.body as { state: string; evolvedFromId?: string };

    const VALID_STATES = ['open', 'active', 'resolved', 'archived'];
    if (!state || !VALID_STATES.includes(state)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `state must be one of: ${VALID_STATES.join(', ')}`,
      });
    }

    const { pool } = await import('../db/connection');
    const checkResult = await pool.query(
      `SELECT id, state FROM hub.atomic_objects
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Object not found' });
    }

    const VALID_TRANSITIONS: Record<string, string[]> = {
      open:     ['active', 'resolved', 'archived'],
      active:   ['resolved', 'archived', 'open'],
      resolved: ['archived'],
      archived: ['open'],
      null:     ['open', 'active', 'resolved', 'archived'],
    };

    const currentState = checkResult.rows[0].state ?? 'open';
    const allowed = VALID_TRANSITIONS[currentState] ?? VALID_TRANSITIONS['null'];
    if (!allowed.includes(state)) {
      return res.status(400).json({
        error: 'INVALID_TRANSITION',
        message: `Cannot transition from '${currentState}' to '${state}'`,
      });
    }

    await pool.query(
      `UPDATE hub.atomic_objects
       SET state = $1,
           state_updated_at = NOW(),
           evolved_from_id = COALESCE($2, evolved_from_id)
       WHERE id = $3 AND user_id = $4`,
      [state, evolvedFromId ?? null, req.params.id, req.user.id]
    );

    return res.json({ id: req.params.id, state, stateUpdatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[objects] state transition error:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to update state',
    });
  }
});

/**
 * POST /api/v1/decisions/:id/review
 * Record actual outcome for a decision object.
 * Body: { actualOutcome: string, accuracyScore?: number (0-1) }
 */
router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const { actualOutcome, accuracyScore } = req.body as {
      actualOutcome: string;
      accuracyScore?: number;
    };

    if (!actualOutcome || typeof actualOutcome !== 'string') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'actualOutcome is required',
      });
    }

    const { pool } = await import('../db/connection');
    const checkResult = await pool.query(
      `SELECT id, object_type FROM hub.atomic_objects
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Object not found' });
    }

    if (checkResult.rows[0].object_type !== 'decision') {
      return res.status(400).json({
        error: 'INVALID_TYPE',
        message: 'Review can only be recorded for decision objects',
      });
    }

    await pool.query(
      `UPDATE hub.atomic_objects
       SET actual_outcome       = $1,
           outcome_evaluated_at = NOW(),
           outcome_accuracy     = $2,
           state                = 'resolved',
           state_updated_at     = NOW()
       WHERE id = $3 AND user_id = $4`,
      [actualOutcome, accuracyScore ?? null, req.params.id, req.user.id]
    );

    return res.json({
      id: req.params.id,
      actualOutcome,
      outcomeEvaluatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[objects] decision review error:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to record review',
    });
  }
});

export default router;

