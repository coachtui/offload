/**
 * RAG routes — semantic search, AI sparring, contradiction detection
 *
 * POST /api/v1/rag/search          — semantic search with filters
 * POST /api/v1/rag/spar            — AI sparring grounded in user's notes
 * POST /api/v1/rag/contradictions  — check a statement against existing notes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { semanticSearch } from '../services/vectorService';
import { AtomicObjectModel } from '../models/AtomicObject';
import { buildContextPack, sparWithContext, detectContradictions } from '../services/sparringService';

const router = Router();

router.use(authenticate);

// ─── Validation schemas ───────────────────────────────────────────────────────

const searchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(50).optional().default(10),
  filters: z
    .object({
      objectType: z
        .array(
          z.enum(['task', 'reminder', 'idea', 'observation', 'question', 'decision', 'journal', 'reference'])
        )
        .optional(),
      domain: z
        .array(z.enum(['work', 'personal', 'health', 'family', 'finance', 'project', 'misc', 'unknown']))
        .optional(),
      isActionable: z.boolean().optional(),
      urgency: z.enum(['low', 'medium', 'high']).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    })
    .optional(),
});

const sparSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(20).optional().default(8),
  filters: z
    .object({
      objectType: z.array(z.string()).optional(),
      domain: z.array(z.string()).optional(),
      isActionable: z.boolean().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    })
    .optional(),
});

// ─── POST /search ─────────────────────────────────────────────────────────────

/**
 * Semantic search over the user's atomic objects.
 * Returns ranked objects with scores.
 */
router.post('/search', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  console.log(`[RAG] POST /search — userId: ${userId}`);

  try {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const validation = searchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
    }

    const { query, topK, filters } = validation.data;
    console.log(`[RAG] search — userId: ${userId}, queryLen: ${query.length}, topK: ${topK}`);

    let searchResults;
    try {
      searchResults = await semanticSearch({
        userId,
        query,
        limit: topK,
        objectType: filters?.objectType,
        domain: filters?.domain,
        isActionable: filters?.isActionable,
        urgency: filters?.urgency,
        dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
      });
    } catch (err) {
      console.error('[RAG] Semantic search failed:', err);
      return res.status(503).json({
        error: 'Search unavailable',
        message: 'Vector search is not available. Ensure Weaviate is connected.',
      });
    }

    if (searchResults.length === 0) {
      return res.json({ results: [], total: 0, query });
    }

    // Hydrate full objects from PostgreSQL
    const objectIds = searchResults.map((r) => r.objectId);
    const scoreMap = new Map(searchResults.map((r) => [r.objectId, r.score]));
    const fullObjects = await AtomicObjectModel.findByIds(objectIds);

    const SCORE_THRESHOLD = 0.4;

    const results = fullObjects
      .map((obj) => {
        const atom = obj.toAtomicObject();
        return {
          score: scoreMap.get(obj.id) ?? 0,
          objectId: obj.id,
          title: atom.title ?? null,
          cleanedText: atom.cleanedText ?? atom.content,
          type: atom.objectType ?? 'observation',
          domain: atom.domain ?? 'unknown',
          tags: atom.metadata?.tags ?? [],
          isActionable: atom.actionability?.isActionable ?? false,
          nextAction: atom.actionability?.nextAction ?? null,
          temporalHints: atom.temporalHints,
          createdAt: atom.createdAt,
          sourceTranscriptId: atom.source?.recordingId ?? null,
        };
      })
      .filter((r) => r.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    console.log(`[RAG] search returned ${results.length} results`);
    return res.json({ results, total: results.length, query });
  } catch (error) {
    console.error('[RAG] search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── POST /spar ───────────────────────────────────────────────────────────────

/**
 * AI sparring — retrieves relevant notes and generates a grounded response.
 * Returns: answer, cited note IDs, themes, contradiction flag, gaps, context pack.
 */
router.post('/spar', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  console.log(`[RAG] POST /spar — userId: ${userId}`);

  try {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const validation = sparSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
    }

    const { query, topK, filters } = validation.data;
    console.log(`[RAG] spar — userId: ${userId}, queryLen: ${query.length}, topK: ${topK}`);

    const result = await sparWithContext(userId, query, {
      topK,
      objectType: filters?.objectType,
      domain: filters?.domain,
      isActionable: filters?.isActionable,
      dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    });

    return res.json({
      answer: result.answer,
      citedIds: result.citedIds,
      themes: result.themes,
      hasContradictions: result.hasContradictions,
      gaps: result.gaps,
      contextPack: result.contextPack,
    });
  } catch (error) {
    console.error('[RAG] spar error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Surface config errors clearly
    if (message.includes('No LLM API key')) {
      return res.status(503).json({
        error: 'AI sparring unavailable',
        message: 'No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      });
    }

    return res.status(500).json({ error: 'Sparring failed', message });
  }
});

// ─── POST /context-pack (inspection endpoint) ─────────────────────────────────

/**
 * Build and return a context pack without calling the LLM.
 * Useful for debugging retrieval quality.
 */
router.post('/context-pack', async (req: Request, res: Response) => {
  const userId = req.user?.id;

  try {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const validation = sparSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
    }

    const { query, topK, filters } = validation.data;

    const contextPack = await buildContextPack(userId, query, {
      topK,
      objectType: filters?.objectType,
      domain: filters?.domain,
      isActionable: filters?.isActionable,
      dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    });

    return res.json(contextPack);
  } catch (error) {
    console.error('[RAG] context-pack error:', error);
    return res.status(500).json({
      error: 'Failed to build context pack',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── POST /contradictions ──────────────────────────────────────────────────────

const contradictionsSchema = z.object({
  statement: z.string().min(1, 'Statement is required'),
  excludeIds: z.array(z.string().uuid()).optional().default([]),
});

/**
 * Check a statement (e.g. new transcript) against existing notes for contradictions.
 * excludeIds: IDs of objects just saved from this same recording — skip them.
 */
router.post('/contradictions', async (req: Request, res: Response) => {
  const userId = req.user?.id;

  try {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const validation = contradictionsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
    }

    const { statement, excludeIds } = validation.data;
    console.log(`[RAG] POST /contradictions — userId: ${userId}, statement length: ${statement.length}`);

    const result = await detectContradictions(userId, statement, excludeIds);

    return res.json(result);
  } catch (error) {
    console.error('[RAG] contradictions error:', error);
    return res.status(500).json({
      error: 'Contradiction check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
