/**
 * Conversation Service — Ask Offload threads as standing queries.
 *
 * Two operations:
 *
 *   runTurn()  — ask a question inside a thread. Retrieval is fresh every turn;
 *                prior turns are replayed so follow-ups ("the second one")
 *                resolve. This is the part that makes it behave like a chat.
 *
 *   resume()   — reopen a thread and report what changed since it last looked.
 *                This is the part that makes it *not* a chat: the answer is
 *                re-derived from live object state, not replayed from stored
 *                text. Read the header of migration 023 for why that
 *                distinction is the whole feature.
 *
 * The delta buckets are computed deterministically here, in SQL and code. The
 * LLM only narrates buckets it is handed — it never decides what was resolved.
 * Same division of labour as synthesisService's "Accomplished" list, and for
 * the same reason: "you finished this" is a claim that must be true.
 */
import { ConversationModel, type Conversation, type ConversationMessage } from '../models/Conversation';
import { semanticSearch } from './vectorService';
import { extractPeople } from './entityTyping';
import { queryMany } from '../db/queries';
import {
  buildContextPack,
  sparWithContext,
  callLLM,
  type ChatTurn,
  type SparringResponse,
} from './sparringService';

// ─── Tuning ───────────────────────────────────────────────────────────────────

/**
 * Replayable turns kept verbatim. Everything older is folded into the thread
 * summary. 12 messages ≈ 6 exchanges — enough that "the second one" still
 * resolves, bounded enough that a year-old thread plus a fresh sweep plus a
 * delta report still fits comfortably in one call.
 */
const HISTORY_TURN_LIMIT = 12;

/** Objects pulled by the resume sweep. Wider than a normal ask: the sweep is
 *  looking for things that appeared while the user was away, and those sort
 *  below the originals that already have relevance history. */
const RESUME_SWEEP_TOP_K = 15;

/**
 * Below this age a reopen skips the diff entirely.
 *
 * Kept short on purpose. The guard exists only to stop a rapid back-and-forth
 * (open, back out, open again) from re-diffing on every tap — an unchanged
 * thread already produces no message and no LLM call, so a longer window buys
 * almost nothing and actively hides real changes from someone who closed a task
 * this morning and checks the thread at lunch.
 */
const RESUME_MIN_AGE_MS = 30 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeltaObject {
  objectId: string;
  title: string;
  type: string;
  state: string;
  createdAt: string;
  stateUpdatedAt: string | null;
  nextAction: string | null;
  people: string[];
}

export interface ThreadDelta {
  /** True when any bucket below is non-empty — i.e. worth telling the user. */
  hasChanges: boolean;
  /** Cited objects that reached resolved/archived since the watermark. */
  resolved: DeltaObject[];
  /** Cited objects still open. */
  stillOpen: DeltaObject[];
  /** Cited objects the user has since deleted outright. */
  gone: string[];
  /** Captured after the watermark and relevant to the opening query. */
  newlyMentioned: DeltaObject[];
  /** Whole days since the thread last looked. */
  daysSince: number;
  /** The instant the delta was computed — the watermark to advance to. */
  checkedAt: Date;
}

export interface ResumeResult {
  delta: ThreadDelta;
  /** Null when nothing changed and no report was generated. */
  message: ConversationMessage | null;
}

// ─── Delta computation ────────────────────────────────────────────────────────

interface CitedObjectRow {
  id: string;
  title: string | null;
  cleaned_text: string | null;
  content: string | null;
  object_type: string | null;
  state: string | null;
  state_updated_at: Date | null;
  created_at: Date;
  metadata: any;
  actionability: any;
}

/** Database clock. Falls back to process time if the query fails — a slightly
 *  skewed watermark beats failing a resume the user is waiting on. */
async function dbNow(): Promise<Date> {
  try {
    const rows = await queryMany<{ now: Date }>('SELECT NOW() AS now');
    if (rows[0]?.now) return new Date(rows[0].now);
  } catch (error) {
    console.warn('[conversationService] db clock read failed, using process time:', error);
  }
  return new Date();
}

function toDeltaObject(row: CitedObjectRow): DeltaObject {
  const text = row.title || row.cleaned_text || row.content || '(untitled)';
  return {
    objectId: row.id,
    title: text.length > 140 ? text.slice(0, 137).trimEnd() + '…' : text,
    type: row.object_type ?? 'observation',
    state: row.state ?? 'open',
    createdAt: new Date(row.created_at).toISOString(),
    stateUpdatedAt: row.state_updated_at ? new Date(row.state_updated_at).toISOString() : null,
    nextAction: row.actionability?.nextAction ?? row.actionability?.next_action ?? null,
    people: extractPeople(row.metadata?.entities),
  };
}

/**
 * Diff the world against what this thread last saw.
 *
 * Scoped by user_id in the query rather than trusting that cited_ids are the
 * caller's — they are, but the set is written from LLM output and a defensive
 * scope costs nothing.
 */
export async function computeDelta(
  userId: string,
  conversation: Conversation
): Promise<ThreadDelta> {
  // Watermark time must come from the same clock as state_updated_at, which
  // Postgres stamps with NOW(). Taking it from the app server instead makes the
  // window drift by whatever the two clocks disagree by — and a DB running
  // behind would let an object resolved in that gap fall between two resumes
  // and never be reported at all. One cheap query removes the whole class.
  const checkedAt = await dbNow();
  const watermark = conversation.lastCheckedAt;
  const citedIds = conversation.citedIds ?? [];

  // ── Bucket 1-3: what happened to the objects this thread stood on ──────────
  const citedRows =
    citedIds.length === 0
      ? []
      : await queryMany<CitedObjectRow>(
          `SELECT id, title, cleaned_text, content, object_type, state,
                  state_updated_at, created_at, metadata, actionability
             FROM hub.atomic_objects
            WHERE id = ANY($1::uuid[])
              AND user_id = $2
              AND deleted_at IS NULL`,
          [citedIds, userId]
        );

  const survivingIds = new Set(citedRows.map((r) => r.id));
  const gone = citedIds.filter((id) => !survivingIds.has(id));

  const resolved: DeltaObject[] = [];
  const stillOpen: DeltaObject[] = [];

  for (const row of citedRows) {
    const state = row.state ?? 'open';
    const isClosed = state === 'resolved' || state === 'archived';
    if (!isClosed) {
      stillOpen.push(toDeltaObject(row));
      continue;
    }
    // Closed *since the thread last looked*. A note already resolved at the
    // previous visit was reported then; repeating it every resume would turn
    // the delta into a standing list.
    if (row.state_updated_at && row.state_updated_at > watermark) {
      resolved.push(toDeltaObject(row));
    }
  }

  // ── Bucket 4: fresh sweep for what has been captured since ────────────────
  // Re-runs the *opening* query, not the thread's latest message — the user is
  // coming back to the question they opened with.
  let newlyMentioned: DeltaObject[] = [];
  try {
    const hits = await semanticSearch({
      userId,
      query: conversation.openingQuery,
      limit: RESUME_SWEEP_TOP_K,
    });
    const freshIds = hits.map((h) => h.objectId).filter((id) => !citedIds.includes(id));

    if (freshIds.length > 0) {
      const freshRows = await queryMany<CitedObjectRow>(
        `SELECT id, title, cleaned_text, content, object_type, state,
                state_updated_at, created_at, metadata, actionability
           FROM hub.atomic_objects
          WHERE id = ANY($1::uuid[])
            AND user_id = $2
            AND deleted_at IS NULL
            AND created_at > $3
          ORDER BY created_at DESC`,
        [freshIds, userId, watermark]
      );
      // Only things captured *after* the watermark. A relevant note that
      // existed at the last visit but ranked below the cut is not news — it is
      // last visit's retrieval being imperfect, and reporting it as new would
      // be a lie the user can catch.
      newlyMentioned = freshRows.map(toDeltaObject);
    }
  } catch (error) {
    // A dead vector store costs the "what's new" half of the report. The
    // resolution half comes from Postgres and still stands, so degrade rather
    // than fail the resume.
    console.error('[conversationService] resume sweep failed:', error);
  }

  const daysSince = Math.max(
    0,
    Math.floor((checkedAt.getTime() - watermark.getTime()) / (24 * 60 * 60 * 1000))
  );

  return {
    hasChanges: resolved.length > 0 || gone.length > 0 || newlyMentioned.length > 0,
    resolved,
    stillOpen,
    gone,
    newlyMentioned,
    daysSince,
    checkedAt,
  };
}

// ─── Delta narration ──────────────────────────────────────────────────────────

const DELTA_SYSTEM_PROMPT = `You are the memory layer of a personal capture app, greeting a user who has just reopened a saved thread after time away.

You are given a DETERMINISTIC change report — already computed from the database. Your only job is to narrate it in the user's own terms.

RULES:
1. NEVER add, infer, or invent a change that is not in the report. The buckets are facts; you are the phrasing.
2. Lead with what closed, then what is still open, then what is new.
3. Be brief — this is a greeting, not a summary. Two to four sentences.
4. Speak directly: "You closed the invoice question", "Still open:", "You've mentioned him twice since".
5. Do not congratulate, coach, or editorialise. Report.
6. If a bucket is empty, say nothing about it. Do not write "nothing was deleted".

RETURN valid JSON with this exact structure:
{
  "report": "Your two-to-four sentence delta report",
  "themes": ["theme1", "theme2"]
}`;

function formatDeltaForPrompt(delta: ThreadDelta, openingQuery: string): string {
  const section = (label: string, items: DeltaObject[]) =>
    items.length === 0
      ? null
      : `${label} (${items.length}):\n` +
        items
          .map((o) => {
            const bits = [`- [${o.type}] ${o.title}`];
            if (o.nextAction) bits.push(`  next action: ${o.nextAction}`);
            if (o.people.length > 0) bits.push(`  people: ${o.people.join(', ')}`);
            return bits.join('\n');
          })
          .join('\n');

  return [
    `ORIGINAL QUESTION: ${openingQuery}`,
    `TIME AWAY: ${delta.daysSince} day(s)`,
    '',
    section('RESOLVED SINCE YOU LAST LOOKED', delta.resolved),
    section('STILL OPEN', delta.stillOpen),
    section('NEWLY CAPTURED AND RELEVANT', delta.newlyMentioned),
    delta.gone.length > 0 ? `DELETED SINCE (${delta.gone.length}) — mention only as "deleted"` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Deterministic fallback. Used when there is nothing to narrate, and when the
 * LLM call fails — a resume must always produce *something*, because the user
 * opened a thread and is waiting.
 */
export function describeDeltaPlainly(delta: ThreadDelta): string {
  if (!delta.hasChanges) {
    const open = delta.stillOpen.length;
    if (open === 0) return 'Nothing has changed here since you last looked.';
    return `Nothing has changed since you last looked. ${open} item${
      open === 1 ? ' is' : 's are'
    } still open.`;
  }

  const parts: string[] = [];
  if (delta.resolved.length > 0) {
    parts.push(
      `${delta.resolved.length} resolved: ${delta.resolved.map((o) => o.title).join('; ')}`
    );
  }
  if (delta.stillOpen.length > 0) {
    parts.push(
      `Still open: ${delta.stillOpen.map((o) => o.title).join('; ')}`
    );
  }
  if (delta.newlyMentioned.length > 0) {
    parts.push(
      `New since: ${delta.newlyMentioned.map((o) => o.title).join('; ')}`
    );
  }
  if (delta.gone.length > 0) {
    parts.push(`${delta.gone.length} deleted`);
  }
  return parts.join('. ') + '.';
}

async function narrateDelta(
  delta: ThreadDelta,
  openingQuery: string
): Promise<{ report: string; themes: string[] }> {
  try {
    const raw = await callLLM(DELTA_SYSTEM_PROMPT, formatDeltaForPrompt(delta, openingQuery));
    let text = raw.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    const parsed = JSON.parse(text.trim());
    if (typeof parsed.report === 'string' && parsed.report.trim()) {
      return {
        report: parsed.report.trim(),
        themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      };
    }
  } catch (error) {
    console.warn('[conversationService] delta narration failed, using plain description:', error);
  }
  return { report: describeDeltaPlainly(delta), themes: [] };
}

// ─── Resume ───────────────────────────────────────────────────────────────────

/**
 * Reopen a thread: diff, narrate, persist the report as a 'delta' message, and
 * advance the watermark.
 *
 * The watermark moves only after the report row is written. A resume that dies
 * between the diff and the insert must be replayable — otherwise the user
 * loses a window of changes they were never shown.
 */
export async function resumeConversation(
  userId: string,
  conversationId: string,
  options: { force?: boolean } = {}
): Promise<ResumeResult | null> {
  const conversation = await ConversationModel.findById(userId, conversationId);
  if (!conversation) return null;

  const age = Date.now() - conversation.lastCheckedAt.getTime();
  if (!options.force && age < RESUME_MIN_AGE_MS) {
    // Too soon to be interesting. Return an empty delta without burning an LLM
    // call or writing a report row — reopening a thread twice in an afternoon
    // should just show the thread.
    return {
      delta: {
        hasChanges: false,
        resolved: [],
        stillOpen: [],
        gone: [],
        newlyMentioned: [],
        daysSince: 0,
        checkedAt: new Date(),
      },
      message: null,
    };
  }

  const delta = await computeDelta(userId, conversation);

  if (!delta.hasChanges) {
    // Still advance the watermark: the thread genuinely did look, and not
    // moving it would make the next resume re-scan a window already known
    // empty. No message row — an unchanging thread should not accumulate
    // "nothing changed" entries every time it is opened.
    await ConversationModel.markChecked(userId, conversationId, delta.checkedAt);
    return { delta, message: null };
  }

  const { report, themes } = await narrateDelta(delta, conversation.openingQuery);

  const message = await ConversationModel.addMessage({
    userId,
    conversationId,
    role: 'delta',
    content: report,
    citedIds: [
      ...delta.resolved.map((o) => o.objectId),
      ...delta.newlyMentioned.map((o) => o.objectId),
    ],
    themes,
  });

  // Newly surfaced objects join the thread's grounding set — they are part of
  // what this thread is about now, so the next resume tracks their state too.
  if (delta.newlyMentioned.length > 0) {
    await ConversationModel.mergeCitedIds(
      userId,
      conversationId,
      delta.newlyMentioned.map((o) => o.objectId)
    );
  }

  await ConversationModel.markChecked(userId, conversationId, delta.checkedAt);

  return { delta, message };
}

// ─── Turns ────────────────────────────────────────────────────────────────────

/**
 * Prior turns as an LLM-replayable sequence.
 *
 * 'delta' messages are excluded deliberately. They describe the world at a past
 * instant; every turn re-retrieves anyway, so replaying an old change-report
 * only gives the model stale facts to contradict the fresh ones with.
 */
export function toReplayableHistory(messages: ConversationMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

const SUMMARY_SYSTEM_PROMPT = `You compress the early portion of a saved thread between a user and their personal memory assistant, so later turns still have context without replaying every message.

Write a compact third-person summary: what the user asked about, what was established, what stayed unresolved. Keep names, dates, and specifics — drop pleasantries and phrasing.

Return plain prose, at most 150 words. No preamble, no JSON.`;

/**
 * Fold everything older than the replay window into `conversation.summary`.
 * Fire-and-forget from the caller's perspective: a failed compaction means the
 * next turn replays slightly more history, which is survivable.
 */
async function compactIfNeeded(
  userId: string,
  conversation: Conversation,
  messages: ConversationMessage[]
): Promise<void> {
  const replayable = messages.filter((m) => m.role !== 'delta');
  if (replayable.length <= HISTORY_TURN_LIMIT) return;

  const older = replayable.slice(0, replayable.length - HISTORY_TURN_LIMIT);
  const transcript = older
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  try {
    const summary = await callLLM(
      SUMMARY_SYSTEM_PROMPT,
      [
        conversation.summary ? `EXISTING SUMMARY:\n${conversation.summary}\n` : '',
        `THREAD OPENED WITH: ${conversation.openingQuery}`,
        '',
        'TURNS TO FOLD IN:',
        transcript,
      ]
        .filter(Boolean)
        .join('\n')
    );
    if (summary.trim()) {
      await ConversationModel.setSummary(userId, conversation.id, summary.trim());
    }
  } catch (error) {
    console.warn('[conversationService] thread compaction failed:', error);
  }
}

export interface TurnResult {
  conversation: Conversation;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  spar: SparringResponse;
}

/**
 * Ask a question inside a thread.
 *
 * Order matters: the user's message is persisted *before* the LLM call, so a
 * request that times out still leaves the question in the thread rather than
 * swallowing what the user typed. sanitizeTurns() in sparringService is what
 * makes the resulting dangling user turn safe to replay.
 */
export async function runTurn(
  userId: string,
  conversationId: string,
  question: string,
  options: { topK?: number } = {}
): Promise<TurnResult | null> {
  const conversation = await ConversationModel.findById(userId, conversationId);
  if (!conversation) return null;

  const priorMessages = await ConversationModel.listMessages(userId, conversationId);
  const replayable = toReplayableHistory(priorMessages);
  const history = replayable.slice(-HISTORY_TURN_LIMIT);

  const userMessage = await ConversationModel.addMessage({
    userId,
    conversationId,
    role: 'user',
    content: question,
  });
  if (!userMessage) return null;

  const spar = await sparWithContext(userId, question, {
    topK: options.topK ?? 8,
    history,
    threadSummary: conversation.summary,
  });

  const assistantMessage = await ConversationModel.addMessage({
    userId,
    conversationId,
    role: 'assistant',
    content: spar.answer,
    citedIds: spar.citedIds,
    themes: spar.themes,
    gaps: spar.gaps,
    hasContradictions: spar.hasContradictions,
  });
  if (!assistantMessage) return null;

  await ConversationModel.mergeCitedIds(userId, conversationId, spar.citedIds);

  // Answering is also looking: without this, the first resume after a long
  // active session would replay every change the user just discussed.
  // Database clock, for the same reason computeDelta uses it.
  await ConversationModel.markChecked(userId, conversationId, await dbNow());

  // Compaction is not on the response path — the answer is already complete.
  setImmediate(() => {
    void compactIfNeeded(userId, conversation, [
      ...priorMessages,
      userMessage,
      assistantMessage,
    ]);
  });

  const updated = (await ConversationModel.findById(userId, conversationId)) ?? conversation;
  return { conversation: updated, userMessage, assistantMessage, spar };
}

/** Open a new thread and answer its first question in one call. */
export async function startConversation(
  userId: string,
  question: string,
  options: { topK?: number; title?: string } = {}
): Promise<TurnResult> {
  const conversation = await ConversationModel.create({
    userId,
    openingQuery: question,
    title: options.title,
  });
  const result = await runTurn(userId, conversation.id, question, { topK: options.topK });
  // runTurn only returns null when the conversation is missing or not the
  // caller's; it was just created for this user, so this cannot happen.
  if (!result) throw new Error('Failed to run first turn on a just-created conversation');
  return result;
}

/** Retrieval-only preview of what a resume would sweep. Debug aid, mirrors /context-pack. */
export async function previewSweep(userId: string, conversation: Conversation) {
  return buildContextPack(userId, conversation.openingQuery, { topK: RESUME_SWEEP_TOP_K });
}
