import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { AtomicObject, Category } from '../types';

interface ObjectsState {
  objects: AtomicObject[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
}

interface ObjectFilters {
  category?: Category[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ObjectDetailState {
  object: AtomicObject | null;
  isLoadingDetail: boolean;
  isUpdating: boolean;
  updateError: string | null;
}

interface UseObjectsReturn extends ObjectsState, ObjectDetailState {
  filters: ObjectFilters;
  fetchObjects: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: ObjectFilters) => void;
  fetchObjectDetail: (objectId: string) => Promise<void>;
  updateObject: (objectId: string, data: Partial<AtomicObject>) => Promise<boolean>;
  clearDetail: () => void;
}

const PAGE_SIZE = 20;

export function useObjects(): UseObjectsReturn {
  const [state, setState] = useState<ObjectsState>({
    objects: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
    total: 0,
    hasMore: false,
  });

  const [detailState, setDetailState] = useState<ObjectDetailState>({
    object: null,
    isLoadingDetail: false,
    isUpdating: false,
    updateError: null,
  });

  const [filters, setFiltersState] = useState<ObjectFilters>({});
  const [offset, setOffset] = useState(0);

  const fetchObjects = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiService.getObjects({
        limit: PAGE_SIZE,
        offset: 0,
        category: filters.category,
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });

      setState({
        objects: response.objects,
        isLoading: false,
        isRefreshing: false,
        error: null,
        total: response.total,
        hasMore: response.objects.length < response.total,
      });
      setOffset(response.objects.length);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: error instanceof Error ? error.message : 'Failed to fetch objects',
      }));
    }
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const response = await apiService.getObjects({
        limit: PAGE_SIZE,
        offset,
        category: filters.category,
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });

      setState((prev) => ({
        ...prev,
        objects: [...prev.objects, ...response.objects],
        isLoading: false,
        total: response.total,
        hasMore: prev.objects.length + response.objects.length < response.total,
      }));
      setOffset((prev) => prev + response.objects.length);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load more objects',
      }));
    }
  }, [state.isLoading, state.hasMore, offset, filters]);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, isRefreshing: true }));
    setOffset(0);
    await fetchObjects();
  }, [fetchObjects]);

  const setFilters = useCallback((newFilters: ObjectFilters) => {
    setFiltersState(newFilters);
    setOffset(0);
  }, []);

  const fetchObjectDetail = useCallback(async (objectId: string) => {
    setDetailState((prev) => ({ ...prev, isLoadingDetail: true, updateError: null }));

    try {
      const response = await apiService.getObject(objectId);
      setDetailState((prev) => ({
        ...prev,
        object: response.object,
        isLoadingDetail: false,
      }));
    } catch (error) {
      setDetailState((prev) => ({
        ...prev,
        isLoadingDetail: false,
      }));
    }
  }, []);

  const updateObject = useCallback(async (objectId: string, data: Partial<AtomicObject>): Promise<boolean> => {
    setDetailState((prev) => ({ ...prev, isUpdating: true, updateError: null }));

    try {
      const response = await apiService.updateObject(objectId, data);
      setDetailState((prev) => ({
        ...prev,
        object: response.object,
        isUpdating: false,
      }));

      // Update in list as well
      setState((prev) => ({
        ...prev,
        objects: prev.objects.map((obj) =>
          obj.id === objectId ? response.object : obj
        ),
      }));

      return true;
    } catch (error) {
      setDetailState((prev) => ({
        ...prev,
        isUpdating: false,
        updateError: error instanceof Error ? error.message : 'Failed to update object',
      }));
      return false;
    }
  }, []);

  const clearDetail = useCallback(() => {
    setDetailState({
      object: null,
      isLoadingDetail: false,
      isUpdating: false,
      updateError: null,
    });
  }, []);

  useEffect(() => {
    fetchObjects();
  }, [fetchObjects]);

  return {
    ...state,
    ...detailState,
    filters,
    fetchObjects,
    loadMore,
    refresh,
    setFilters,
    fetchObjectDetail,
    updateObject,
    clearDetail,
  };
}
