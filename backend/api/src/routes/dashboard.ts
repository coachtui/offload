/**
 * Dashboard route — GET /api/v1/dashboard
 * Returns real-time cognitive state metrics for the authenticated user.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware';
import { getDashboardMetrics } from '../services/dashboardService';

const router = Router();
router.use(authenticate);

/**
 * GET /api/v1/dashboard
 * Returns aggregated cognitive load metrics.
 * Cached per user for 5 minutes.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const metrics = await getDashboardMetrics(req.user.id);
    return res.json(metrics);
  } catch (error) {
    console.error('[dashboard] Error fetching metrics:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch dashboard metrics',
    });
  }
});

export default router;
