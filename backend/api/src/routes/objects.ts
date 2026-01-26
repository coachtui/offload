/**
 * Atomic objects routes
 */

import { Router, Request, Response } from 'express';
import {
  createObject,
  getObjectById,
  listObjects,
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

export default router;
