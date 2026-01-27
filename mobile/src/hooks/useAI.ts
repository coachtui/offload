import { useState, useCallback } from 'react';
import { apiService } from '../services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  timestamp: Date;
}

interface SourceReference {
  objectId: string;
  content: string;
  relevance: number;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useAI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!question.trim()) return;

      // Add user message immediately
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setError(null);

      try {
        // Build conversation history for context
        const conversationHistory: ConversationMessage[] = messages
          .slice(-5) // Last 5 messages for context
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

        // Call AI query endpoint
        const response = await apiService.aiQuery(question, {
          conversationHistory,
          contextLimit: 5,
        });

        // Add AI response
        const aiMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.data.answer,
          sources: response.data.sources,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);
      } catch (err: any) {
        console.error('AI query error:', err);
        const errorMessage =
          err.response?.data?.error || 'Failed to get answer. Please try again.';
        setError(errorMessage);

        // Add error message as AI response
        const errorAiMessage: Message = {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMessage}`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorAiMessage]);
      } finally {
        setLoading(false);
      }
    },
    [messages]
  );

  const checkContradictions = useCallback(async (statement: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.checkContradictions(statement);

      return response;
    } catch (err: any) {
      console.error('Contradiction check error:', err);
      setError(err.response?.data?.error || 'Failed to check contradictions.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    askQuestion,
    checkContradictions,
    clearConversation,
  };
}
