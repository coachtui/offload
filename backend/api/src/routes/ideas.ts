/**
 * Ideas routes — dormant idea detection and resurfacing
 *
 * GET /api/v1/ideas/dormant — returns high-importance ideas not accessed recently
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware';
import { pool } from '../db/connection';

const router = Router();
router.use(authenticate);

export interface DormantIdea {
  id: string;
  title: string | null;
  cleanedText: string;
  importanceScore: number;
  mentionCount: number;
  daysDormant: number;
  domain: string;
  createdAt: string;
}

/**
 * GET /api/v1/ideas/dormant
 * Returns important ideas not recently accessed.
 * Query params: limit (default 5), minImportance (default 0.3), dormantDays (default 14)
 *
 * Note: minImportance defaults to 0.3 (not 0.5) until importance scoring has run for a week
 * and scores have accumulated. Raise threshold after first week of data.
 */
router.get('/dormant', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const limit = Math.min(parseInt(req.query.limit as string || '5', 10), 20);
    const minImportance = parseFloat(req.query.minImportance as string || '0.3');
    const dormantDays = parseInt(req.query.dormantDays as string || '14', 10);

    const result = await pool.query(
      `SELECT
         id,
         title,
         COALESCE(cleaned_text, content) AS cleaned_text,
         importance_score,
         mention_count,
         domain,
         created_at,
         last_accessed_at
       FROM hub.atomic_objects
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND object_type = 'idea'
         AND (state IS NULL OR state = 'open')
         AND importance_score >= $2
         AND (
           last_accessed_at < NOW() - ($3 || ' days')::interval
           OR last_accessed_at IS NULL
         )
         AND (linked_object_ids = '{}' OR linked_object_ids IS NULL)
       ORDER BY importance_score DESC
       LIMIT $4`,
      [req.user.id, minImportance, dormantDays, limit]
    );

    const ideas: DormantIdea[] = result.rows.map((row) => ({
      id: row.id,
      title: row.title ?? null,
      cleanedText: row.cleaned_text,
      importanceScore: parseFloat(row.importance_score),
      mentionCount: row.mention_count,
      daysDormant: Math.floor(
        (Date.now() - new Date(row.last_accessed_at ?? row.created_at).getTime()) / 86400000
      ),
      domain: row.domain ?? 'unknown',
      createdAt: new Date(row.created_at).toISOString(),
    }));

    return res.json({ ideas, total: ideas.length });
  } catch (error) {
    console.error('[ideas] Error fetching dormant ideas:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch dormant ideas',
    });
  }
});

export default router;
