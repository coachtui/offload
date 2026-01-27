import { useState, useCallback } from 'react';
import { apiService } from '../services/api';
import type { AtomicObject, Category } from '@shared/types';

interface SearchOptions {
  category?: Category[];
  dateFrom?: Date;
  dateTo?: Date;
  urgency?: 'low' | 'medium' | 'high';
  limit?: number;
}

interface SearchResult extends AtomicObject {
  _searchScore?: number;
  _distance?: number;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, options?: SearchOptions) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.searchSemantic(query, {
        limit: options?.limit || 20,
        category: options?.category,
        dateFrom: options?.dateFrom?.toISOString(),
        dateTo: options?.dateTo?.toISOString(),
        urgency: options?.urgency,
      });

      setResults(response.results || []);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.error || 'Failed to search. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const findSimilar = useCallback(async (objectId: string, limit?: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.findSimilar(objectId, limit || 5);

      setResults(response.results || []);
    } catch (err: any) {
      console.error('Find similar error:', err);
      setError(err.response?.data?.error || 'Failed to find similar objects.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    search,
    findSimilar,
    clearResults,
  };
}
