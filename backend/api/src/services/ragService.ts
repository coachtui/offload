/**
 * RAG (Retrieval-Augmented Generation) Service
 * Provides AI-powered query answering with context from atomic objects
 */

import axios from 'axios';
import { semanticSearch } from './vectorService';
import { AtomicObjectModel } from '../models/AtomicObject';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4-turbo';

interface RAGQueryRequest {
  userId: string;
  query: string;
  contextLimit?: number;
  category?: string[];
  includeHistory?: boolean;
  conversationHistory?: ConversationMessage[];
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RAGQueryResponse {
  answer: string;
  sources: SourceReference[];
  confidence: number;
  modelUsed: string;
}

interface SourceReference {
  objectId: string;
  content: string;
  relevance: number;
}

/**
 * Query with RAG - retrieve context and generate answer
 */
export async function queryWithRAG(request: RAGQueryRequest): Promise<RAGQueryResponse> {
  // Step 1: Retrieve relevant context using semantic search
  const contextLimit = request.contextLimit || 5;

  const searchResults = await semanticSearch({
    userId: request.userId,
    query: request.query,
    limit: contextLimit,
    category: request.category,
  });

  // Fetch full atomic objects
  const contextObjects = await Promise.all(
    searchResults.map(async (result) => {
      const obj = await AtomicObjectModel.findById(result.objectId);
      return obj ? { ...obj.toAtomicObject(), _score: result.score } : null;
    })
  );

  const validContextObjects = contextObjects.filter((obj) => obj !== null);

  if (validContextObjects.length === 0) {
    return {
      answer: "I don't have enough context to answer that question. Try recording more voice notes on this topic.",
      sources: [],
      confidence: 0,
      modelUsed: 'none',
    };
  }

  // Step 2: Build context for LLM
  const contextText = validContextObjects
    .map(
      (obj, idx) =>
        `[${idx + 1}] ${obj.content}\n   Categories: ${obj.category.join(', ')}\n   Tags: ${obj.metadata.tags.join(', ')}`
    )
    .join('\n\n');

  // Step 3: Generate answer with LLM
  const systemPrompt = `You are a helpful AI assistant that answers questions based on the user's personal voice notes and recorded information.

You have access to the user's atomic objects (pieces of information from their voice recordings). Use this context to answer their question accurately.

IMPORTANT RULES:
1. Only use information from the provided context
2. If the context doesn't contain enough information, say so honestly
3. Cite sources by referencing the numbered contexts like "[1]" or "[3]"
4. Be concise and direct
5. If you detect contradictions in the context, point them out
6. Consider the categories and tags when understanding context

Context from user's voice notes:

${contextText}`;

  const userMessage = `Question: ${request.query}`;

  let answer: string;
  let modelUsed: string;

  if (LLM_MODEL.startsWith('claude')) {
    // Use Anthropic Claude
    const result = await queryWithClaude(systemPrompt, userMessage, request.conversationHistory);
    answer = result.answer;
    modelUsed = result.model;
  } else {
    // Use OpenAI GPT
    const result = await queryWithOpenAI(systemPrompt, userMessage, request.conversationHistory);
    answer = result.answer;
    modelUsed = result.model;
  }

  // Step 4: Build source references
  const sources: SourceReference[] = validContextObjects.map((obj, idx) => ({
    objectId: obj.id,
    content: obj.content,
    relevance: obj._score,
  }));

  // Calculate confidence based on context relevance
  const avgRelevance = sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length;
  const confidence = Math.min(avgRelevance * 1.2, 1.0); // Boost slightly, cap at 1.0

  return {
    answer,
    sources,
    confidence,
    modelUsed,
  };
}

/**
 * Query using OpenAI GPT
 */
async function queryWithOpenAI(
  systemPrompt: string,
  userMessage: string,
  conversationHistory?: ConversationMessage[]
): Promise<{ answer: string; model: string }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const messages: any[] = [{ role: 'system', content: systemPrompt }];

  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }

  // Add current query
  messages.push({ role: 'user', content: userMessage });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const answer = response.data.choices[0].message.content;
    const model = response.data.model;

    return { answer, model };
  } catch (error: any) {
    console.error('Error querying OpenAI:', error.response?.data || error.message);
    throw new Error('Failed to generate answer with OpenAI');
  }
}

/**
 * Query using Anthropic Claude
 */
async function queryWithClaude(
  systemPrompt: string,
  userMessage: string,
  conversationHistory?: ConversationMessage[]
): Promise<{ answer: string; model: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Claude uses a different message format
  const messages: any[] = [];

  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }

  // Combine system prompt with user message for Claude
  const combinedMessage = `${systemPrompt}\n\n${userMessage}`;
  messages.push({ role: 'user', content: combinedMessage });

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: LLM_MODEL,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        timeout: 60000,
      }
    );

    const answer = response.data.content[0].text;
    const model = response.data.model;

    return { answer, model };
  } catch (error: any) {
    console.error('Error querying Claude:', error.response?.data || error.message);
    throw new Error('Failed to generate answer with Claude');
  }
}

/**
 * Check for contradictions between atomic objects
 */
export async function checkContradictions(
  userId: string,
  statement: string
): Promise<{ hasContradictions: boolean; contradictions: any[] }> {
  // Search for related objects
  const searchResults = await semanticSearch({
    userId,
    query: statement,
    limit: 10,
  });

  const relatedObjects = await Promise.all(
    searchResults.map((result) => AtomicObjectModel.findById(result.objectId))
  );

  const validObjects = relatedObjects.filter((obj) => obj !== null);

  if (validObjects.length === 0) {
    return { hasContradictions: false, contradictions: [] };
  }

  // Use LLM to detect contradictions
  const contextText = validObjects
    .map((obj, idx) => `[${idx + 1}] ${obj!.content}`)
    .join('\n');

  const systemPrompt = `You are an AI assistant that detects contradictions in information.

Given a new statement and existing recorded information, identify any contradictions or conflicts.

Existing information:
${contextText}

New statement: "${statement}"

Respond with JSON:
{
  "hasContradictions": true/false,
  "contradictions": [
    {
      "existingStatement": "...",
      "explanation": "...",
      "severity": "low/medium/high"
    }
  ]
}`;

  try {
    let result;
    if (LLM_MODEL.startsWith('claude')) {
      result = await queryWithClaude(systemPrompt, 'Analyze for contradictions', []);
    } else {
      result = await queryWithOpenAI(systemPrompt, 'Analyze for contradictions', []);
    }

    const parsed = JSON.parse(result.answer);
    return parsed;
  } catch (error) {
    console.error('Error checking contradictions:', error);
    return { hasContradictions: false, contradictions: [] };
  }
}
