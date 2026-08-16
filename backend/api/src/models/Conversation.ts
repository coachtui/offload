/**
 * Conversation model — hub.conversations / hub.conversation_messages (migration 023).
 *
 * An Ask Offload thread. Read the migration header before changing anything
 * here: a thread is a *standing query*, not a chat log, and the three fields
 * that make it one (openingQuery, citedIds, lastCheckedAt) are the inputs to
 * the resume diff.
 *
 * Every method is scoped by user_id in the statement itself rather than behind
 * a prior ownership SELECT, so a request naming someone else's thread id
 * affects zero rows instead of racing a check.
 */
import { query, queryMany, queryOne } from '../db/queries';

export type ConversationRole = 'user' | 'assistant' | 'delta';

export interface Conversation {
  id: string;
  title: string;
  openingQuery: string;
  citedIds: string[];
  lastCheckedAt: Date;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  citedIds: string[];
  themes: string[];
  gaps: string | null;
  hasContradictions: boolean;
  createdAt: Date;
}

/** A thread plus the preview fields the thread list renders. */
export interface ConversationSummaryRow extends Conversation {
  messageCount: number;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
}

const CONVERSATION_COLUMNS = `
  id,
  title,
  opening_query   AS "openingQuery",
  cited_ids       AS "citedIds",
  last_checked_at AS "lastCheckedAt",
  summary,
  created_at      AS "createdAt",
  updated_at      AS "updatedAt"`;

const MESSAGE_COLUMNS = `
  id,
  conversation_id    AS "conversationId",
  role,
  content,
  cited_ids          AS "citedIds",
  themes,
  gaps,
  has_contradictions AS "hasContradictions",
  created_at         AS "createdAt"`;

/**
 * A thread title has to survive being read in a list weeks later, so it is the
 * opening question trimmed to something scannable rather than an LLM call —
 * naming a thread is not worth a round trip on the create path.
 */
export function deriveTitle(openingQuery: string): string {
  const collapsed = openingQuery.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 60) return collapsed || 'Untitled thread';
  return collapsed.slice(0, 57).trimEnd() + '…';
}

export class ConversationModel {
  static async create(input: {
    userId: string;
    openingQuery: string;
    title?: string;
  }): Promise<Conversation> {
    const row = await queryOne<Conversation>(
      `INSERT INTO hub.conversations (user_id, title, opening_query)
       VALUES ($1, $2, $3)
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.userId, input.title?.trim() || deriveTitle(input.openingQuery), input.openingQuery]
    );
    // The INSERT either returns a row or throws; the non-null assertion is the
    // shape of that guarantee, not an assumption about the data.
    return row!;
  }

  static async findById(userId: string, id: string): Promise<Conversation | null> {
    return queryOne<Conversation>(
      `SELECT ${CONVERSATION_COLUMNS}
         FROM hub.conversations
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  }

  /** Thread list, most recently active first. */
  static async listByUser(userId: string, limit = 50): Promise<ConversationSummaryRow[]> {
    return queryMany<ConversationSummaryRow>(
      `SELECT ${CONVERSATION_COLUMNS},
              COALESCE(m.message_count, 0)::int AS "messageCount",
              m.last_message_at                 AS "lastMessageAt",
              m.last_message_preview            AS "lastMessagePreview"
         FROM hub.conversations c
         LEFT JOIN LATERAL (
           SELECT COUNT(*)                                    AS message_count,
                  MAX(created_at)                             AS last_message_at,
                  (ARRAY_AGG(content ORDER BY created_at DESC))[1] AS last_message_preview
             FROM hub.conversation_messages
            WHERE conversation_id = c.id
         ) m ON true
        WHERE c.user_id = $1
        ORDER BY c.updated_at DESC
        LIMIT $2`,
      [userId, limit]
    );
  }

  static async listMessages(userId: string, conversationId: string): Promise<ConversationMessage[]> {
    return queryMany<ConversationMessage>(
      `SELECT ${MESSAGE_COLUMNS}
         FROM hub.conversation_messages
        WHERE conversation_id = $1 AND user_id = $2
        ORDER BY created_at ASC, id ASC`,
      [conversationId, userId]
    );
  }

  static async addMessage(input: {
    userId: string;
    conversationId: string;
    role: ConversationRole;
    content: string;
    citedIds?: string[];
    themes?: string[];
    gaps?: string | null;
    hasContradictions?: boolean;
  }): Promise<ConversationMessage | null> {
    // The SELECT source enforces ownership: no matching conversation row for
    // this user means no insert, and the caller gets null rather than a write
    // into someone else's thread.
    return queryOne<ConversationMessage>(
      `INSERT INTO hub.conversation_messages
         (conversation_id, user_id, role, content, cited_ids, themes, gaps, has_contradictions)
       SELECT c.id, $1, $3, $4, $5::uuid[], $6::text[], $7, $8
         FROM hub.conversations c
        WHERE c.id = $2 AND c.user_id = $1
       RETURNING ${MESSAGE_COLUMNS}`,
      [
        input.userId,
        input.conversationId,
        input.role,
        input.content,
        input.citedIds ?? [],
        input.themes ?? [],
        input.gaps ?? null,
        input.hasContradictions ?? false,
      ]
    );
  }

  /**
   * Fold newly-cited object ids into the thread's grounding set and bump
   * updated_at. Union rather than replace: the resume diff asks "what happened
   * to everything this thread ever stood on", so an object cited in turn one
   * still gets checked after turn nine stopped mentioning it.
   */
  static async mergeCitedIds(
    userId: string,
    conversationId: string,
    citedIds: string[]
  ): Promise<void> {
    await query(
      `UPDATE hub.conversations
          SET cited_ids  = ARRAY(SELECT DISTINCT unnest(cited_ids || $3::uuid[])),
              updated_at = NOW()
        WHERE id = $2 AND user_id = $1`,
      [userId, conversationId, citedIds]
    );
  }

  /**
   * Advance the delta watermark. Called only once a delta has actually been
   * handed to the user — a resume that dies mid-flight must not consume the
   * window of changes it failed to report.
   */
  static async markChecked(userId: string, conversationId: string, at: Date): Promise<void> {
    await query(
      `UPDATE hub.conversations
          SET last_checked_at = $3,
              updated_at      = NOW()
        WHERE id = $2 AND user_id = $1`,
      [userId, conversationId, at]
    );
  }

  static async setSummary(userId: string, conversationId: string, summary: string): Promise<void> {
    await query(
      `UPDATE hub.conversations
          SET summary = $3, updated_at = NOW()
        WHERE id = $2 AND user_id = $1`,
      [userId, conversationId, summary]
    );
  }

  static async rename(userId: string, conversationId: string, title: string): Promise<boolean> {
    const result = await query(
      `UPDATE hub.conversations
          SET title = $3, updated_at = NOW()
        WHERE id = $2 AND user_id = $1`,
      [userId, conversationId, title.trim() || 'Untitled thread']
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async remove(userId: string, conversationId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM hub.conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
