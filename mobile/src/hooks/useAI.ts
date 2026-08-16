/**
 * useAI — Ask Offload thread state.
 *
 * This used to hold messages in local state and call a single-turn endpoint,
 * which meant two things: the thread died on unmount, and the model never saw
 * its own previous answers, so "what about the second one?" was answered blind.
 *
 * Threads now live on the server, and reopening one is not a replay. The server
 * re-derives what changed while you were away — resolved, still open, newly
 * captured — and that report arrives as a `delta` message. Opening a thread
 * fires it automatically; that is the point of the feature, not a refresh
 * convenience. See backend migration 023 and conversationService.ts.
 */
import { useState, useCallback, useRef } from 'react';
import {
  apiService,
  type ConversationListItem,
  type ConversationMessage,
  type ThreadDelta,
} from '../services/api';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'delta';
  content: string;
  themes?: string[];
  gaps?: string | null;
  citedIds?: string[];
  hasContradictions?: boolean;
  timestamp: Date;
  /** Present on delta messages — lets the UI show counts without parsing prose. */
  delta?: ThreadDelta;
}

function toAIMessage(m: ConversationMessage, delta?: ThreadDelta): AIMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    themes: m.themes,
    gaps: m.gaps,
    citedIds: m.citedIds,
    hasContradictions: m.hasContradictions,
    timestamp: new Date(m.createdAt),
    delta,
  };
}

export function useAI() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [threads, setThreads] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The id the *next* send should target. React state updates are async, so a
  // user who types a second question before the first response commits would
  // otherwise open a second thread with the same opening query.
  const activeIdRef = useRef<string | null>(null);

  const setActiveThread = useCallback((id: string | null, title: string | null) => {
    activeIdRef.current = id;
    setConversationId(id);
    setConversationTitle(title);
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const { conversations } = await apiService.listConversations();
      setThreads(conversations);
    } catch (err: any) {
      console.warn('Failed to load threads:', err?.message ?? err);
    }
  }, []);

  const askQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      // Optimistic user bubble so the question appears instantly. Replaced by
      // the server's persisted rows once the turn commits.
      const pendingId = `pending-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: pendingId, role: 'user', content: trimmed, timestamp: new Date() },
      ]);
      setLoading(true);
      setError(null);

      try {
        const targetId = activeIdRef.current;
        const result = targetId
          ? await apiService.sendConversationMessage(targetId, trimmed, { topK: 8 })
          : await apiService.startConversation(trimmed, { topK: 8 });

        setActiveThread(result.conversation.id, result.conversation.title);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== pendingId),
          ...result.messages.map((m) => toAIMessage(m)),
        ]);
        void refreshThreads();
      } catch (err: any) {
        console.error('AI turn error:', err);
        const errorMessage = err.message || 'Failed to get answer. Please try again.';
        setError(errorMessage);
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-error-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${errorMessage}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [refreshThreads, setActiveThread]
  );

  /**
   * Open a saved thread and immediately report what changed.
   *
   * Messages render first, then the delta appends — the thread should be
   * readable while the diff runs, not blank behind a spinner. `force` skips the
   * server's minimum-age window for an explicit pull-to-refresh.
   */
  const openThread = useCallback(
    async (id: string, options: { force?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const { conversation, messages: stored } = await apiService.getConversation(id);
        setActiveThread(conversation.id, conversation.title);
        setMessages(stored.map((m) => toAIMessage(m)));
        setLoading(false);

        setResuming(true);
        try {
          const { delta, message } = await apiService.resumeConversation(id, options.force ?? false);
          if (message) {
            setMessages((prev) => [...prev, toAIMessage(message, delta)]);
          }
        } catch (err: any) {
          // A failed diff must not eat the thread the user came to read. The
          // server leaves its watermark unmoved, so the next open retries.
          console.warn('Resume delta failed:', err?.message ?? err);
          setError('Could not check for updates. Showing the saved thread.');
        } finally {
          setResuming(false);
        }
      } catch (err: any) {
        console.error('Open thread error:', err);
        setError(err.message || 'Failed to open this thread.');
        setLoading(false);
      }
    },
    [setActiveThread]
  );

  /** Explicit re-check of an already-open thread. */
  const checkForUpdates = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id || resuming) return;
    setResuming(true);
    setError(null);
    try {
      const { delta, message } = await apiService.resumeConversation(id, true);
      if (message) setMessages((prev) => [...prev, toAIMessage(message, delta)]);
    } catch (err: any) {
      setError(err.message || 'Could not check for updates.');
    } finally {
      setResuming(false);
    }
  }, [resuming]);

  /** Start fresh. The previous thread stays saved — this is not a delete. */
  const newThread = useCallback(() => {
    setActiveThread(null, null);
    setMessages([]);
    setError(null);
  }, [setActiveThread]);

  const deleteThread = useCallback(
    async (id: string) => {
      try {
        await apiService.deleteConversation(id);
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (activeIdRef.current === id) {
          setActiveThread(null, null);
          setMessages([]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to delete thread.');
      }
    },
    [setActiveThread]
  );

  const renameThread = useCallback(async (id: string, title: string) => {
    try {
      await apiService.renameConversation(id, title);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
      if (activeIdRef.current === id) setConversationTitle(title);
    } catch (err: any) {
      console.warn('Rename failed:', err?.message ?? err);
    }
  }, []);

  return {
    messages,
    conversationId,
    conversationTitle,
    threads,
    loading,
    resuming,
    error,
    askQuestion,
    openThread,
    checkForUpdates,
    newThread,
    deleteThread,
    renameThread,
    refreshThreads,
  };
}
