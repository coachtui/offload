/**
 * Sparring Service — RAG-powered AI thought partner
 *
 * Pipeline:
 *   1. Embed user query → semantic search → retrieve relevant atomic objects
 *   2. Hydrate full objects from PostgreSQL
 *   3. Build a RetrievalContextPack (structured, inspectable)
 *   4. Call LLM with grounded context → structured response
 */

import axios from 'axios';
import { AtomicObjectModel } from '../models/AtomicObject';
import { semanticSearch, type SemanticSearchOptions } from './vectorService';
import type { AtomicObject } from '@shared/types';
import { pool } from '../db/connection';
import { extractPeople } from './entityTyping';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RetrievedNote {
  objectId: string;
  score: number;
  title: string | null;
  cleanedText: string;
  rawText: string | null;
  type: string;
  domain: string;
  tags: string[];
  people: string[];
  createdAt: string;
  sourceTranscriptId: string | null;
  isActionable: boolean;
  nextAction: string | null;
}

export interface ContextPackSummary {
  dominantThemes: string[];
  repeatedIdeas: string[];
  actionableItems: string[];
  unresolvedQuestions: string[];
}

export interface RetrievalContextPack {
  query: string;
  retrieved: RetrievedNote[];
  summary: ContextPackSummary;
}

export interface SparringResponse {
  answer: string;
  citedIds: string[];
  themes: string[];
  hasContradictions: boolean;
  gaps: string | null;
  contextPack: RetrievalContextPack;
}

export interface SparringOptions {
  topK?: number;
  objectType?: string[];
  domain?: string[];
  isActionable?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  /**
   * Prior turns of a saved thread, oldest first. Absent for a one-shot ask.
   * Retrieval always runs against the current query alone — history informs
   * how the answer is *phrased* ("the second one"), never what gets retrieved,
   * so a thread that wandered can't drag stale context into the sweep.
   */
  history?: ChatTurn[];
  /**
   * Compressed stand-in for turns already folded away, so a long thread stays
   * within a bounded prompt. Rendered ahead of `history`.
   */
  threadSummary?: string | null;
}

/** One replayable turn. 'delta' reports are deliberately not replayable — see migration 023. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Context pack builder ─────────────────────────────────────────────────────

export async function buildContextPack(
  userId: string,
  query: string,
  options: SparringOptions = {}
): Promise<RetrievalContextPack> {
  const topK = options.topK ?? 8;

  const searchOpts: SemanticSearchOptions = {
    userId,
    query,
    limit: topK,
    objectType: options.objectType,
    domain: options.domain,
    isActionable: options.isActionable,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  };

  let searchResults;
  try {
    searchResults = await semanticSearch(searchOpts);
  } catch (error) {
    console.error('[sparringService] Semantic search failed:', error);
    searchResults = [];
  }

  if (searchResults.length === 0) {
    return {
      query,
      retrieved: [],
      summary: {
        dominantThemes: [],
        repeatedIdeas: [],
        actionableItems: [],
        unresolvedQuestions: [],
      },
    };
  }

  // Hydrate full objects from PostgreSQL
  const objectIds = searchResults.map((r) => r.objectId);
  const scoreMap = new Map(searchResults.map((r) => [r.objectId, r.score]));

  const fullObjects = await AtomicObjectModel.findByIds(objectIds);
  const atomicObjects = fullObjects.map((obj) => obj.toAtomicObject());

  // Track retrieval: increment mention_count, update last_accessed_at (fire-and-forget)
  if (objectIds.length > 0) {
    setImmediate(() =>
      pool.query(
        `UPDATE hub.atomic_objects
         SET mention_count    = mention_count + 1,
             last_accessed_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND deleted_at IS NULL`,
        [objectIds]
      ).catch((err: Error) => console.warn('[sparring] mention_count update failed:', err))
    );
  }

  // Build retrieved notes list (ordered by score desc)
  const retrieved: RetrievedNote[] = atomicObjects
    .map((obj) => ({
      objectId: obj.id,
      score: Number(scoreMap.get(obj.id) ?? 0),
      title: obj.title ?? null,
      cleanedText: obj.cleanedText ?? obj.content,
      rawText: obj.rawText ?? null,
      type: obj.objectType ?? 'observation',
      domain: obj.domain ?? 'unknown',
      tags: obj.metadata?.tags ?? [],
      people: extractPeople(obj.metadata?.entities),
      createdAt: new Date(obj.createdAt).toISOString(),
      sourceTranscriptId: obj.source?.recordingId ?? null,
      isActionable: obj.actionability?.isActionable ?? false,
      nextAction: obj.actionability?.nextAction ?? null,
    }))
    .sort((a, b) => b.score - a.score);

  // Build summary from retrieved notes
  const summary = buildSummary(retrieved);

  return { query, retrieved, summary };
}

function buildSummary(notes: RetrievedNote[]): ContextPackSummary {
  // Dominant themes: most common domains + types
  const domainCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const note of notes) {
    domainCounts.set(note.domain, (domainCounts.get(note.domain) ?? 0) + 1);
    typeCounts.set(note.type, (typeCounts.get(note.type) ?? 0) + 1);
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const dominantThemes = [
    ...Array.from(domainCounts.entries())
      .filter(([d]) => d !== 'unknown')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([d]) => d),
    ...Array.from(tagCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag),
  ].slice(0, 4);

  // Repeated ideas: tags appearing in multiple notes
  const repeatedIdeas = Array.from(tagCounts.entries())
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);

  // Actionable items
  const actionableItems = notes
    .filter((n) => n.isActionable && n.nextAction)
    .slice(0, 5)
    .map((n) => n.nextAction!);

  // Unresolved questions
  const unresolvedQuestions = notes
    .filter((n) => n.type === 'question')
    .slice(0, 5)
    .map((n) => n.title ?? n.cleanedText);

  return { dominantThemes, repeatedIdeas, actionableItems, unresolvedQuestions };
}

// ─── LLM call ─────────────────────────────────────────────────────────────────

const SPAR_SYSTEM_PROMPT = `You are a thought-partner AI for a proactive personal memory layer. You have access to the user's actual captured notes, retrieved based on relevance to their query.

Your job is to synthesize and respond GROUNDED in the retrieved notes only. Do not add generic advice that isn't in the notes.

RULES:
1. Ground every claim in a retrieved note
2. Reference notes using: "You mentioned...", "In your notes...", "You captured..."
3. Inference: "Based on your notes, it seems..."
4. Recommendations: "Given what you've noted, you might consider..."
5. If notes are insufficient: clearly say so — do NOT hallucinate
6. Find patterns, repetitions, and tensions across notes
7. Flag contradictions if you notice any

RETURN valid JSON with this exact structure:
{
  "answer": "Your full response to the user",
  "cited_ids": ["objectId1", "objectId2"],
  "themes": ["theme1", "theme2"],
  "has_contradictions": false,
  "gaps": "What cannot be answered from the notes, or null"
}`;

/**
 * Appended when prior turns are being replayed. Two things need saying that a
 * single-turn prompt never had to:
 *
 * 1. Stored assistant turns are the plain `answer` string, not the JSON
 *    envelope they arrived in. Without this line the model imitates the
 *    history's shape and returns bare prose, and every reply in a resumed
 *    thread silently loses its citations to the parse fallback.
 * 2. Each turn carries a fresh retrieval sweep. Earlier turns' notes are gone
 *    from the context, so an answer must stand on the notes attached to the
 *    turn it is answering.
 */
const THREAD_CONTINUATION_SUFFIX = `CONTINUING A SAVED THREAD:
- Earlier assistant turns appear as plain prose because only their "answer" field was stored. Your reply must STILL be the full JSON object specified above.
- The notes attached to earlier turns are no longer in context. Ground this answer in the notes attached to the CURRENT query, and cite only ids that appear there.
- Time has likely passed since the earlier turns. Trust the note dates and states in the current retrieval over anything asserted earlier in the thread.`;

export function formatNotesForPrompt(notes: RetrievedNote[]): string {
  if (notes.length === 0) {
    return '(No relevant notes found in your history)';
  }

  return notes
    .map((note, i) => {
      const date = new Date(note.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const lines = [
        `[${i + 1}] ID: ${note.objectId}`,
        `Type: ${note.type} | Domain: ${note.domain} | Score: ${note.score.toFixed(2)}`,
        `Date: ${date}`,
        note.title ? `Title: ${note.title}` : null,
        `Note: ${note.cleanedText}`,
        note.isActionable && note.nextAction ? `Next action: ${note.nextAction}` : null,
        note.tags.length > 0 ? `Tags: ${note.tags.join(', ')}` : null,
        note.people.length > 0 ? `People: ${note.people.join(', ')}` : null,
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}

/** Single-turn convenience wrapper. */
export async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  return callLLMWithHistory(systemPrompt, [{ role: 'user', content: userMessage }]);
}

/**
 * Multi-turn call. `messages` must be a strictly alternating, user-first,
 * user-last sequence — both providers reject anything else, and the history
 * we replay comes out of a database where an interrupted turn can leave a
 * dangling user or assistant message. `sanitizeTurns` enforces that shape.
 */
export async function callLLMWithHistory(
  systemPrompt: string,
  messages: ChatTurn[]
): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const turns = sanitizeTurns(messages);

  if (turns.length === 0) {
    throw new Error('callLLMWithHistory requires at least one user turn');
  }

  if (anthropicKey) {
    return callClaude(systemPrompt, turns, anthropicKey);
  } else if (openaiKey) {
    return callOpenAI(systemPrompt, turns, openaiKey);
  } else {
    throw new Error('No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }
}

/**
 * Coerce a stored thread into a valid message sequence: drop empties, collapse
 * consecutive same-role turns into one, drop a leading assistant turn, and
 * drop a trailing assistant turn. The last two happen for real — a thread whose
 * first message is a 'delta' report (filtered out upstream) starts on an
 * assistant answer, and a request that died after saving the user's question
 * leaves the pair unbalanced.
 */
export function sanitizeTurns(messages: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const turn of messages) {
    const content = turn.content?.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${content}`;
      continue;
    }
    if (out.length === 0 && turn.role === 'assistant') continue;
    out.push({ role: turn.role, content });
  }
  while (out.length > 0 && out[out.length - 1].role === 'assistant') out.pop();
  return out;
}

async function callClaude(
  systemPrompt: string,
  messages: ChatTurn[],
  apiKey: string
): Promise<string> {
  const model = process.env.CLAUDE_MODEL || process.env.SPAR_MODEL || 'claude-sonnet-4-6';
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: 2048,
      temperature: 0.3,
      system: systemPrompt,
      messages,
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      timeout: 60000,
    }
  );
  return response.data.content[0].text;
}

async function callOpenAI(
  systemPrompt: string,
  messages: ChatTurn[],
  apiKey: string
): Promise<string> {
  const model = process.env.SPAR_MODEL || 'gpt-4o';
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );
  return response.data.choices[0].message.content;
}

function parseLLMResponse(raw: string): {
  answer: string;
  citedIds: string[];
  themes: string[];
  hasContradictions: boolean;
  gaps: string | null;
} {
  try {
    // Strip markdown fences if present
    let text = raw.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    text = text.trim();

    const parsed = JSON.parse(text);
    return {
      answer: parsed.answer || 'No response generated.',
      citedIds: Array.isArray(parsed.cited_ids) ? parsed.cited_ids : [],
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      hasContradictions: Boolean(parsed.has_contradictions),
      gaps: parsed.gaps ?? null,
    };
  } catch {
    // If JSON parse fails, treat the raw text as the answer
    return {
      answer: raw,
      citedIds: [],
      themes: [],
      hasContradictions: false,
      gaps: null,
    };
  }
}

// ─── Contradiction detection ──────────────────────────────────────────────────

export interface ConflictItem {
  objectId: string;
  description: string;
  confidence: number;
}

export interface ContradictionResult {
  hasConflict: boolean;
  conflicts: ConflictItem[];
  explanation: string | null;
}

const CONTRADICTION_SYSTEM_PROMPT = `You are a memory consistency checker for a proactive personal memory layer.

Given a new statement and a list of existing notes, identify DIRECT contradictions only — where the new statement clearly conflicts with an existing note.

Contradictions include:
- Changed decisions: "I decided X" vs "I decided not X"
- Conflicting facts: "Meeting on Tuesday" vs "Meeting on Wednesday"
- Reversed plans: "I'm doing Y" vs "I cancelled Y"

Do NOT flag: updates or refinements, vague similarities, or different time periods.

RETURN valid JSON only:
{
  "has_conflict": false,
  "conflicts": [{"object_id": "...", "description": "Brief conflict description", "confidence": 0.9}],
  "explanation": "One sentence summary, or null"
}`;

/**
 * Check a new statement for contradictions against the user's existing notes.
 * excludeIds: object IDs to skip (e.g. just-saved objects from the same transcript).
 */
export async function detectContradictions(
  userId: string,
  statement: string,
  excludeIds: string[] = []
): Promise<ContradictionResult> {
  const empty: ContradictionResult = { hasConflict: false, conflicts: [], explanation: null };

  if (statement.trim().length < 50) return empty;

  let searchResults;
  try {
    searchResults = await semanticSearch({ userId, query: statement, limit: 10 });
  } catch {
    return empty;
  }

  const SCORE_THRESHOLD = 0.45;
  const filtered = searchResults.filter(
    (r) => !excludeIds.includes(r.objectId) && r.score >= SCORE_THRESHOLD
  );

  if (filtered.length === 0) return empty;

  const fullObjects = await AtomicObjectModel.findByIds(filtered.map((r) => r.objectId));
  const notesText = fullObjects
    .map((obj) => {
      const atom = obj.toAtomicObject();
      const date = new Date(atom.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const text = (atom.cleanedText ?? atom.content).slice(0, 300);
      return `ID: ${atom.id}\nDate: ${date}\n${text}`;
    })
    .join('\n\n---\n\n');

  let rawResponse: string;
  try {
    rawResponse = await callLLM(
      CONTRADICTION_SYSTEM_PROMPT,
      `NEW STATEMENT:\n${statement.slice(0, 1000)}\n\nEXISTING NOTES:\n${notesText}`
    );
  } catch {
    return empty;
  }

  try {
    let text = rawResponse.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    const parsed = JSON.parse(text.trim());
    return {
      hasConflict: Boolean(parsed.has_conflict),
      conflicts: Array.isArray(parsed.conflicts)
        ? parsed.conflicts.map((c: any) => ({
            objectId: c.object_id,
            description: c.description,
            confidence: c.confidence ?? 0.5,
          }))
        : [],
      explanation: parsed.explanation ?? null,
    };
  } catch {
    return empty;
  }
}

// ─── Main spar function ───────────────────────────────────────────────────────

/**
 * Run a full RAG sparring session:
 *   retrieve → build context pack → call LLM → return structured response
 */
export async function sparWithContext(
  userId: string,
  query: string,
  options: SparringOptions = {}
): Promise<SparringResponse> {
  console.log(`[sparringService] Sparring — userId: ${userId}, queryLen: ${query.length}`);

  const contextPack = await buildContextPack(userId, query, options);

  console.log(
    `[sparringService] Retrieved ${contextPack.retrieved.length} notes for context pack`
  );

  const notesText = formatNotesForPrompt(contextPack.retrieved);
  const history = options.history ?? [];

  // Retrieved notes ride on the *current* user turn, not the system prompt:
  // each turn gets its own fresh sweep, and pinning an earlier turn's notes
  // into the system prompt would keep them authoritative for the rest of the
  // thread long after they stopped being the best match.
  const userMessage = `USER QUERY: ${query}

RETRIEVED NOTES FROM YOUR HISTORY (${contextPack.retrieved.length} results):

${notesText}

Synthesize and respond grounded in these notes.`;

  const systemPrompt =
    history.length > 0 || options.threadSummary
      ? `${SPAR_SYSTEM_PROMPT}\n\n${THREAD_CONTINUATION_SUFFIX}${
          options.threadSummary
            ? `\n\nEARLIER IN THIS THREAD (summarised):\n${options.threadSummary}`
            : ''
        }`
      : SPAR_SYSTEM_PROMPT;

  const rawResponse = await callLLMWithHistory(systemPrompt, [
    ...history,
    { role: 'user', content: userMessage },
  ]);
  const parsed = parseLLMResponse(rawResponse);

  // A cited id that was never retrieved is not grounding, it is a fabricated
  // citation — the one failure mode this whole feature cannot ship with. Drop
  // anything the model invented rather than surfacing "4 notes cited" over an
  // answer that stood on two.
  const retrievedIds = new Set(contextPack.retrieved.map((n) => n.objectId));
  const citedIds = parsed.citedIds.filter((id) => retrievedIds.has(id));
  if (citedIds.length !== parsed.citedIds.length) {
    console.warn(
      `[sparringService] dropped ${parsed.citedIds.length - citedIds.length} ungrounded citation(s)`
    );
  }

  console.log(
    `[sparringService] Sparring complete — cited ${citedIds.length} notes, ${parsed.themes.length} themes`
  );

  return {
    ...parsed,
    citedIds,
    contextPack,
  };
}
