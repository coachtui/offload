import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { UserCategory } from '../types';

export function useCategories() {
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiService.getCategories();
      setCategories(res.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (input: { name: string; color?: string; icon?: string | null; keywords?: string[] }) => {
    const res = await apiService.createCategory(input);
    setCategories((prev) => [...prev, res.category]);
    return res.category;
  }, []);

  const updateCategory = useCallback(async (id: string, updates: Partial<{ name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number }>) => {
    const res = await apiService.updateCategory(id, updates);
    setCategories((prev) => prev.map((c) => (c.id === id ? res.category : c)));
    return res.category;
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await apiService.deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const applyCategory = useCallback(async (id: string) => {
    return apiService.applyCategory(id);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { categories, isLoading, error, refresh, createCategory, updateCategory, deleteCategory, applyCategory };
}
