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

/**
 * GET /api/v1/synthesis/trends
 * Cross-synthesis pattern analysis for long-term cognitive archive.
 * Requires hub.patterns to be populated (by weekly synthesis).
 * Query params: months (1-12, default 3)
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const months = Math.min(Math.max(parseInt(req.query.months as string || '3', 10), 1), 12);
    const { pool } = await import('../db/connection');

    const [patternHistory, domainHistory, synthesisList] = await Promise.all([
      pool.query(
        `SELECT description, frequency, first_seen_at, last_seen_at, pattern_type
         FROM hub.patterns
         WHERE user_id = $1
           AND last_seen_at > NOW() - ($2 || ' months')::interval
         ORDER BY frequency DESC, last_seen_at DESC
         LIMIT 20`,
        [req.user.id, months]
      ),
      pool.query(
        `SELECT
           date_trunc('week', created_at)::date AS week,
           domain,
           COUNT(*)::int AS count
         FROM hub.atomic_objects
         WHERE user_id = $1
           AND deleted_at IS NULL
           AND created_at > NOW() - ($2 || ' months')::interval
         GROUP BY 1, 2
         ORDER BY 1`,
        [req.user.id, months]
      ),
      Session.findSyntheses(req.user.id, months * 5),
    ]);

    // Compute domain trends
    const domainWeeks: Record<string, { week: string; count: number }[]> = {};
    for (const row of domainHistory.rows) {
      if (!row.domain) continue;
      if (!domainWeeks[row.domain]) domainWeeks[row.domain] = [];
      domainWeeks[row.domain].push({ week: row.week, count: row.count });
    }

    const domainTrends = Object.entries(domainWeeks).map(([domain, history]) => {
      const recent = history.slice(-2).reduce((s, r) => s + r.count, 0);
      const older = history.slice(0, -2).reduce((s, r) => s + r.count, 0) || 1;
      const ratio = recent / older;
      const trend = ratio > 1.3 ? 'increasing' : ratio < 0.7 ? 'decreasing' : 'stable';
      return { domain, weeklyHistory: history, trend } as const;
    });

    const focusShifts = domainTrends
      .filter((d) => d.trend !== 'stable')
      .map((d) => `${d.domain}: ${d.trend}`);

    return res.json({
      period: {
        from: new Date(Date.now() - months * 30 * 86400000).toISOString(),
        to: new Date().toISOString(),
      },
      patternHistory: patternHistory.rows.map((r) => ({
        description: r.description,
        frequency: r.frequency,
        firstSeen: new Date(r.first_seen_at).toISOString(),
        lastSeen: new Date(r.last_seen_at).toISOString(),
        patternType: r.pattern_type,
      })),
      domainTrends,
      focusShifts,
      synthesisSessions: synthesisList.map((s) => ({
        id: s.id,
        generatedAt: s.createdAt.toISOString(),
        objectCount: s.metadata.synthesis?.objectCount ?? 0,
      })),
    });
  } catch (error) {
    console.error('[synthesis] trends error:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch trends',
    });
  }
});

export default router;

