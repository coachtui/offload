/**
 * Search routes - semantic and hybrid search
 */

import express, { Request, Response } from 'express';
import { authenticate, AuthRequest } from '../auth/middleware';
import { semanticSearch, SemanticSearchOptions } from '../services/vectorService';
import { AtomicObjectModel } from '../models/AtomicObject';
import type { Category } from '@shared/types';

const router = express.Router();

/**
 * POST /api/v1/search/semantic
 * Perform semantic search on atomic objects
 */
router.post('/semantic', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query, limit, category, dateFrom, dateTo, urgency } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' });
    }

    const searchOptions: SemanticSearchOptions = {
      userId: req.user!.id,
      query,
      limit: limit ? parseInt(limit) : 10,
    };

    // Add optional filters
    if (category && Array.isArray(category)) {
      searchOptions.category = category;
    }

    if (dateFrom) {
      searchOptions.dateFrom = new Date(dateFrom);
    }

    if (dateTo) {
      searchOptions.dateTo = new Date(dateTo);
    }

    if (urgency) {
      searchOptions.urgency = urgency;
    }

    // Perform semantic search
    const searchResults = await semanticSearch(searchOptions);

    // Fetch full atomic objects from database
    const objectIds = searchResults.map((r) => r.objectId);
    const objects = await Promise.all(
      objectIds.map((id) => AtomicObjectModel.findById(id))
    );

    // Combine with search scores
    const results = objects
      .filter((obj): obj is AtomicObjectModel => obj !== null)
      .map((obj, index) => ({
        ...obj.toAtomicObject(),
        _searchScore: searchResults[index].score,
        _distance: searchResults[index].distance,
      }));

    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (error: any) {
    console.error('Error performing semantic search:', error);
    res.status(500).json({ error: 'Failed to perform search', details: error.message });
  }
});

/**
 * POST /api/v1/search/similar/:objectId
 * Find similar atomic objects
 */
router.post('/similar/:objectId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { objectId } = req.params;
    const { limit } = req.body;

    // Verify object belongs to user
    const object = await AtomicObjectModel.findById(objectId);
    if (!object) {
      return res.status(404).json({ error: 'Object not found' });
    }

    if (object.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find similar objects
    const { findSimilar } = await import('../services/vectorService');
    const searchResults = await findSimilar(
      objectId,
      req.user!.id,
      limit ? parseInt(limit) : 5
    );

    // Fetch full atomic objects
    const objectIds = searchResults.map((r) => r.objectId);
    const objects = await Promise.all(
      objectIds.map((id) => AtomicObjectModel.findById(id))
    );

    // Combine with search scores
    const results = objects
      .filter((obj): obj is AtomicObjectModel => obj !== null)
      .map((obj, index) => ({
        ...obj.toAtomicObject(),
        _searchScore: searchResults[index].score,
        _distance: searchResults[index].distance,
      }));

    res.json({
      objectId,
      results,
      count: results.length,
    });
  } catch (error: any) {
    console.error('Error finding similar objects:', error);
    res.status(500).json({ error: 'Failed to find similar objects', details: error.message });
  }
});

/**
 * POST /api/v1/search/hybrid
 * Hybrid search combining semantic and keyword search
 */
router.post('/hybrid', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query, limit, category, dateFrom, dateTo } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' });
    }

    const searchLimit = limit ? parseInt(limit) : 10;

    // Perform semantic search
    const semanticOptions: SemanticSearchOptions = {
      userId: req.user!.id,
      query,
      limit: searchLimit,
      category,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    };

    const semanticResults = await semanticSearch(semanticOptions);

    // Perform keyword search in PostgreSQL
    const keywordResults = await AtomicObjectModel.findByUserId(req.user!.id, {
      limit: searchLimit,
      // TODO: Add full-text search filter when implemented
    });

    // Combine and deduplicate results
    const semanticIds = new Set(semanticResults.map((r) => r.objectId));
    const combinedIds = [
      ...semanticResults.map((r) => r.objectId),
      ...keywordResults.objects
        .map((obj) => obj.id)
        .filter((id) => !semanticIds.has(id))
        .slice(0, searchLimit - semanticResults.length),
    ];

    // Fetch full objects
    const objects = await Promise.all(
      combinedIds.map((id) => AtomicObjectModel.findById(id))
    );

    // Calculate combined scores
    const results = objects
      .filter((obj): obj is AtomicObjectModel => obj !== null)
      .map((obj) => {
        const semanticResult = semanticResults.find((r) => r.objectId === obj.id);
        const semanticScore = semanticResult ? semanticResult.score : 0;
        const keywordScore = keywordResults.objects.find((o) => o.id === obj.id) ? 0.5 : 0;

        // Weighted combination: 70% semantic, 30% keyword
        const combinedScore = semanticScore * 0.7 + keywordScore * 0.3;

        return {
          ...obj.toAtomicObject(),
          _searchScore: combinedScore,
          _semanticScore: semanticScore,
          _keywordScore: keywordScore,
        };
      })
      .sort((a, b) => b._searchScore - a._searchScore)
      .slice(0, searchLimit);

    res.json({
      query,
      results,
      count: results.length,
      strategy: 'hybrid',
    });
  } catch (error: any) {
    console.error('Error performing hybrid search:', error);
    res.status(500).json({ error: 'Failed to perform search', details: error.message });
  }
});

export default router;
