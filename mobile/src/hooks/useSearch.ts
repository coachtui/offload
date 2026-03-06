import { useState, useCallback } from 'react';
import { apiService, RagSearchResult } from '../services/api';

export type ObjectDomain = 'work' | 'personal' | 'health' | 'family' | 'finance' | 'project';
export type ObjectType = 'task' | 'reminder' | 'idea' | 'observation' | 'question' | 'decision' | 'journal' | 'reference';

interface SearchOptions {
  domain?: ObjectDomain[];
  objectType?: ObjectType[];
  isActionable?: boolean;
  urgency?: 'low' | 'medium' | 'high';
  dateFrom?: Date;
  dateTo?: Date;
  topK?: number;
}

export function useSearch() {
  const [results, setResults] = useState<RagSearchResult[]>([]);
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
      const response = await apiService.ragSearch(query, {
        topK: options?.topK || 20,
        filters: {
          domain: options?.domain,
          objectType: options?.objectType,
          isActionable: options?.isActionable,
          urgency: options?.urgency,
          dateFrom: options?.dateFrom?.toISOString(),
          dateTo: options?.dateTo?.toISOString(),
        },
      });

      setResults(response.results || []);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search. Please try again.');
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
    clearResults,
  };
}
