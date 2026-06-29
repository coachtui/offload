import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  applyCategoryRules,
} from '../services/categoryService';
import { authenticate } from '../auth/middleware';

const router = Router();
router.use(authenticate);

function handleError(error: unknown, res: Response, fallback: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors });
  }
  if (error instanceof Error) {
    if (error.message === 'Category not found') {
      return res.status(404).json({ error: 'NOT_FOUND', message: error.message });
    }
    if (error.message === 'Unauthorized') {
      return res.status(403).json({ error: 'FORBIDDEN', message: error.message });
    }
  }
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : fallback });
}

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const categories = await listCategories(req.user.id);
    return res.json({ categories });
  } catch (error) {
    return handleError(error, res, 'Failed to list categories');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const category = await createCategory(req.user.id, req.body);
    return res.status(201).json({ category });
  } catch (error) {
    return handleError(error, res, 'Failed to create category');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const category = await updateCategory(req.user.id, req.params.id, req.body);
    return res.json({ category });
  } catch (error) {
    return handleError(error, res, 'Failed to update category');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    await deleteCategory(req.user.id, req.params.id);
    return res.status(204).send();
  } catch (error) {
    return handleError(error, res, 'Failed to delete category');
  }
});

router.post('/:id/apply', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const result = await applyCategoryRules(req.user.id, req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, 'Failed to apply category rules');
  }
});

export default router;
