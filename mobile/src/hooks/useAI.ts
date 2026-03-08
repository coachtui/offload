import { useState, useCallback } from 'react';
import { apiService } from '../services/api';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  themes?: string[];
  gaps?: string | null;
  citedIds?: string[];
  hasContradictions?: boolean;
  timestamp: Date;
}

export function useAI() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!question.trim()) return;

      const userMessage: AIMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setError(null);

      try {
        const response = await apiService.ragSpar(question, { topK: 8 });

        const aiMessage: AIMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          themes: response.themes,
          gaps: response.gaps,
          citedIds: response.citedIds,
          hasContradictions: response.hasContradictions,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);
      } catch (err: any) {
        console.error('AI spar error:', err);
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
    []
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    askQuestion,
    clearConversation,
  };
}
