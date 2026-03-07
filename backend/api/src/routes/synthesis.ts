/**
 * Synthesis routes — weekly cross-domain reflection
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware';
import { generateWeeklySynthesis } from '../services/synthesisService';
import { Session } from '../models/Session';

const router = Router();
router.use(authenticate);

/**
 * POST /api/v1/synthesis/weekly
 * Trigger (or return cached) weekly synthesis for the authenticated user.
 * Pass ?force=true to regenerate even if one exists for today.
 */
router.post('/weekly', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const force = req.query.force === 'true';
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;

    const synthesis = await generateWeeklySynthesis(req.user.id, days, force);
    res.json({ synthesis });
  } catch (error) {
    console.error('[synthesis] Error generating weekly synthesis:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to generate synthesis',
    });
  }
});

/**
 * GET /api/v1/synthesis
 * List past synthesis sessions for the authenticated user.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const sessions = await Session.findSyntheses(req.user.id);
    const syntheses = sessions
      .map((s) => s.metadata.synthesis)
      .filter(Boolean);

    res.json({ syntheses });
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to list syntheses',
    });
  }
});

export default router;
