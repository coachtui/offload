/**
 * Synthesis Service — weekly cross-domain reflection agent
 *
 * Pipeline:
 *   1. Fetch all user objects from past N days
 *   2. Build a compact corpus (prioritise recent + actionable, cap at 100)
 *   3. Call LLM with synthesis prompt
 *   4. Parse structured response
 *   5. Persist as a session with metadata.type = 'synthesis'
 */

import axios from 'axios';
import { AtomicObjectModel } from '../models/AtomicObject';
import { Session } from '../models/Session';
import type { AtomicObject } from '@shared/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SynthesisRef {
  id: string;
  title: string;
  objectType: string;
  domain: string;
}

interface RefsEntry extends SynthesisRef {
  refNum: number;
}

export interface WeeklySynthesis {
  sessionId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  objectCount: number;
  domainBreakdown: Record<string, number>;
  narrative: string;           // paragraphs separated by \n\n
  patterns: string[];
  openThreads: string[];
  contradictions: string[];
  actionableInsights: string[];
  citedIds: string[];          // kept for backward compat
  citedObjects: SynthesisRef[]; // human-friendly cited notes
}

// ─── Corpus builder ───────────────────────────────────────────────────────────

function buildCorpus(objects: AtomicObject[]): { corpus: string; refsIndex: RefsEntry[] } {
  if (objects.length === 0) return { corpus: '(No notes captured this week)', refsIndex: [] };

  const refsIndex: RefsEntry[] = [];
  const lines = objects.map((obj, i) => {
    const refNum = i + 1;
    const date = new Date(obj.createdAt).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const type = obj.objectType ?? 'note';
    const domain = obj.domain ?? 'unknown';
    const text = (obj.cleanedText ?? obj.content).slice(0, 200);
    const titleStr = obj.title ? `"${obj.title}" — ` : '';
    const action = obj.actionability?.isActionable && obj.actionability.nextAction
      ? ` [Next: ${obj.actionability.nextAction.slice(0, 80)}]`
      : '';
    refsIndex.push({
      refNum,
      id: obj.id,
      title: obj.title || text.slice(0, 60),
      objectType: type,
      domain,
    });
    return `[${date}] ${type}/${domain} — ${titleStr}${text}${action} [ref_${refNum}]`;
  });

  return { corpus: lines.join('\n'), refsIndex };
}

function domainBreakdown(objects: AtomicObject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obj of objects) {
    const d = obj.domain ?? 'unknown';
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `You are a weekly synthesis agent for a personal second brain system.

Your job is to analyze the user's captured notes from the past week and generate a structured reflection that helps them understand their own thinking patterns.

Each note in the corpus is tagged with [ref_N] at the end of its line. Use these numbers to cite sources.

RULES:
1. Be specific — reference actual content from the notes
2. Find cross-domain patterns (e.g. stress appearing in both work and health notes)
3. Surface unresolved threads — open questions, pending decisions
4. Identify genuine contradictions — changed positions, conflicting plans
5. Extract concrete next actions from actionable items
6. Write in second person ("You've been thinking about...", "You mentioned...")
7. If there's not enough data, say so honestly — do not pad with generic advice
8. In the narrative, separate each paragraph with a blank line (\\n\\n)
9. Do NOT include inline citation markers like [1] or [ref_N] in the narrative text — write naturally, as if speaking directly to the person. Attribution is handled separately via cited_refs.

RETURN valid JSON with this exact structure:
{
  "narrative": "2–3 paragraphs separated by \\n\\n. Write naturally — no inline citation numbers.",
  "patterns": ["recurring theme or pattern 1", "..."],
  "open_threads": ["unresolved question or pending decision 1", "..."],
  "contradictions": ["brief description of a contradiction, or empty array if none"],
  "actionable_insights": ["concrete next step 1", "..."],
  "cited_refs": [1, 3, 5]
}

IMPORTANT: cited_refs must be an array of reference NUMBERS (integers) from the [ref_N] tags — not strings, not IDs.`;

async function callLLM(userMessage: string): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    const model = process.env.SPAR_MODEL || 'claude-sonnet-4-6';
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: 2048,
        temperature: 0.4,
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        headers: {
          'x-api-key': anthropicKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        timeout: 90000,
      }
    );
    return response.data.content[0].text;
  } else if (openaiKey) {
    const model = process.env.SPAR_MODEL || 'gpt-4o';
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [
          { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      }
    );
    return response.data.choices[0].message.content;
  } else {
    throw new Error('No LLM API key configured');
  }
}

// Strip [ref_N] and [N] artifacts that may leak into text fields
function cleanText(s: string): string {
  return s.replace(/\[ref_\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

function parseLLMResponse(
  raw: string,
  refsIndex: RefsEntry[]
): {
  narrative: string;
  patterns: string[];
  openThreads: string[];
  contradictions: string[];
  actionableInsights: string[];
  citedIds: string[];
  citedObjects: SynthesisRef[];
} {
  const empty = {
    narrative: raw,
    patterns: [],
    openThreads: [],
    contradictions: [],
    actionableInsights: [],
    citedIds: [],
    citedObjects: [],
  };

  try {
    let text = raw.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    const parsed = JSON.parse(text.trim());

    // Resolve cited_refs (numbers) → full objects
    const citedRefs: number[] = Array.isArray(parsed.cited_refs) ? parsed.cited_refs : [];
    const citedObjects: SynthesisRef[] = citedRefs
      .map((n) => refsIndex.find((r) => r.refNum === n))
      .filter((r): r is RefsEntry => r !== undefined)
      .map(({ id, title, objectType, domain }) => ({ id, title, objectType, domain }));
    const citedIds = citedObjects.map((o) => o.id);

    return {
      narrative: parsed.narrative || 'No narrative generated.',
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns.map(cleanText) : [],
      openThreads: Array.isArray(parsed.open_threads) ? parsed.open_threads.map(cleanText) : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.map(cleanText) : [],
      actionableInsights: Array.isArray(parsed.actionable_insights)
        ? parsed.actionable_insights.map(cleanText)
        : [],
      citedIds,
      citedObjects,
    };
  } catch {
    return empty;
  }
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Generate a weekly synthesis for a user.
 * If force=false (default), returns a cached result if one was generated today.
 */
export async function generateWeeklySynthesis(
  userId: string,
  days = 7,
  force = false
): Promise<WeeklySynthesis> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - days);

  // Check for a recent synthesis (same calendar day) unless forced
  if (!force) {
    const existing = await Session.findSyntheses(userId, 1);
    if (existing.length > 0) {
      const last = existing[0];
      const lastDate = new Date(last.createdAt).toDateString();
      if (lastDate === new Date().toDateString()) {
        console.log('[synthesisService] Returning cached synthesis from today');
        return last.metadata.synthesis as WeeklySynthesis;
      }
    }
  }

  console.log(
    `[synthesisService] Generating synthesis for ${userId}, past ${days} days`
  );

  // Fetch objects from the period (up to 200, let prioritisation below trim)
  const { objects: raw } = await AtomicObjectModel.findByUserId(userId, {
    dateFrom: periodStart,
    dateTo: periodEnd,
    limit: 200,
  });

  const objects = raw.map((obj) => obj.toAtomicObject());

  // Prioritise: actionable first, then recent, cap at 100
  const actionable = objects.filter((o) => o.actionability?.isActionable);
  const rest = objects.filter((o) => !o.actionability?.isActionable);
  const corpus = [...actionable, ...rest].slice(0, 100);

  const breakdown = domainBreakdown(corpus);
  const { corpus: corpusText, refsIndex } = buildCorpus(corpus);

  const domainSummary = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d}: ${n}`)
    .join(', ');

  const userMessage = `PERIOD: ${periodStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
TOTAL NOTES: ${corpus.length}
DOMAIN BREAKDOWN: ${domainSummary}

NOTES:
${corpusText}

Generate a weekly synthesis.`;

  const rawResponse = await callLLM(userMessage);
  const parsed = parseLLMResponse(rawResponse, refsIndex);

  const synthesis: WeeklySynthesis = {
    sessionId: '', // filled after save
    generatedAt: periodEnd.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    objectCount: corpus.length,
    domainBreakdown: breakdown,
    ...parsed,
  };

  // Persist as a session
  const session = await Session.create({
    userId,
    deviceId: 'synthesis-agent',
    metadata: {
      type: 'synthesis',
      synthesis: { ...synthesis, sessionId: 'pending' },
    },
  });

  // Update session to completed with real ID
  synthesis.sessionId = session.id;
  await session.update({
    status: 'completed',
    metadata: { type: 'synthesis', synthesis },
  });

  console.log(
    `[synthesisService] Synthesis complete — ${corpus.length} objects, ${parsed.patterns.length} patterns`
  );

  return synthesis;
}
