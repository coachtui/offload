import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { VoiceSession } from '../types';

interface SessionsState {
  sessions: VoiceSession[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
}

interface SessionDetailState {
  session: VoiceSession | null;
  isActive: boolean;
  currentTranscript: string | null;
  chunkCount: number;
  duration: number;
  audioUrl: string | null;
  isLoadingDetail: boolean;
  isLoadingAudio: boolean;
}

interface UseSessionsReturn extends SessionsState, SessionDetailState {
  fetchSessions: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchSessionDetail: (sessionId: string) => Promise<void>;
  fetchAudioUrl: (sessionId: string) => Promise<void>;
  clearDetail: () => void;
}

const PAGE_SIZE = 20;

export function useSessions(): UseSessionsReturn {
  const [state, setState] = useState<SessionsState>({
    sessions: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
    total: 0,
    hasMore: false,
  });

  const [detailState, setDetailState] = useState<SessionDetailState>({
    session: null,
    isActive: false,
    currentTranscript: null,
    chunkCount: 0,
    duration: 0,
    audioUrl: null,
    isLoadingDetail: false,
    isLoadingAudio: false,
  });

  const [offset, setOffset] = useState(0);

  const fetchSessions = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiService.getSessions(PAGE_SIZE, 0);
      setState({
        sessions: response.sessions,
        isLoading: false,
        isRefreshing: false,
        error: null,
        total: response.total,
        hasMore: response.sessions.length < response.total,
      });
      setOffset(response.sessions.length);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sessions',
      }));
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const response = await apiService.getSessions(PAGE_SIZE, offset);
      setState((prev) => ({
        ...prev,
        sessions: [...prev.sessions, ...response.sessions],
        isLoading: false,
        total: response.total,
        hasMore: prev.sessions.length + response.sessions.length < response.total,
      }));
      setOffset((prev) => prev + response.sessions.length);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load more sessions',
      }));
    }
  }, [state.isLoading, state.hasMore, offset]);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, isRefreshing: true }));
    setOffset(0);
    await fetchSessions();
  }, [fetchSessions]);

  const fetchSessionDetail = useCallback(async (sessionId: string) => {
    setDetailState((prev) => ({ ...prev, isLoadingDetail: true, audioUrl: null }));

    try {
      const response = await apiService.getSession(sessionId);
      setDetailState((prev) => ({
        ...prev,
        session: response.session,
        isActive: response.isActive,
        currentTranscript: response.currentTranscript || null,
        chunkCount: response.chunkCount || 0,
        duration: response.duration || 0,
        isLoadingDetail: false,
      }));
    } catch (error) {
      setDetailState((prev) => ({
        ...prev,
        isLoadingDetail: false,
      }));
    }
  }, []);

  const fetchAudioUrl = useCallback(async (sessionId: string) => {
    setDetailState((prev) => ({ ...prev, isLoadingAudio: true }));

    try {
      const response = await apiService.getSessionAudioUrl(sessionId);
      setDetailState((prev) => ({
        ...prev,
        audioUrl: response.audioUrl,
        isLoadingAudio: false,
      }));
    } catch (error) {
      setDetailState((prev) => ({
        ...prev,
        isLoadingAudio: false,
      }));
    }
  }, []);

  const clearDetail = useCallback(() => {
    setDetailState({
      session: null,
      isActive: false,
      currentTranscript: null,
      chunkCount: 0,
      duration: 0,
      audioUrl: null,
      isLoadingDetail: false,
      isLoadingAudio: false,
    });
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    ...state,
    ...detailState,
    fetchSessions,
    loadMore,
    refresh,
    fetchSessionDetail,
    fetchAudioUrl,
    clearDetail,
  };
}
