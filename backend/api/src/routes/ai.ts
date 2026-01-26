/**
 * AI routes - RAG queries and AI-powered features
 */

import express, { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../auth/middleware';
import { queryWithRAG, checkContradictions } from '../services/ragService';

const router = express.Router();

/**
 * POST /api/v1/ai/query
 * Query your knowledge base with AI
 */
router.post('/query', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query, contextLimit, category, conversationHistory } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' });
    }

    const result = await queryWithRAG({
      userId: req.user!.id,
      query,
      contextLimit,
      category,
      conversationHistory,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error processing AI query:', error);
    res.status(500).json({ error: 'Failed to process query', details: error.message });
  }
});

/**
 * POST /api/v1/ai/check-contradictions
 * Check if a statement contradicts existing information
 */
router.post('/check-contradictions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { statement } = req.body;

    if (!statement || typeof statement !== 'string') {
      return res.status(400).json({ error: 'Statement is required and must be a string' });
    }

    const result = await checkContradictions(req.user!.id, statement);

    res.json(result);
  } catch (error: any) {
    console.error('Error checking contradictions:', error);
    res.status(500).json({ error: 'Failed to check contradictions', details: error.message });
  }
});

export default router;
