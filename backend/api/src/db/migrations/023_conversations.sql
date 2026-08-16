-- 023_conversations.sql — durable Ask Offload threads as *standing queries*
--
-- Ask Offload looked like a chat and was not one. The client held messages in
-- React state (they died on unmount) and the server sent a single-turn
-- `messages: [{role:'user'}]` to the LLM with no history at all — so even a
-- live follow-up like "what about the second one?" was answered blind.
--
-- The obvious fix is to store the transcript and replay it. That is the wrong
-- fix here, and the distinction is the whole point of this table:
--
--   A replayed chat thread is a *record of what was true then*. Reopened three
--   weeks later it confidently repeats a stale answer, because the text is the
--   only state it has.
--
--   A standing query stores the QUESTION plus the object set the answer stood
--   on plus a watermark, and re-derives the answer against live data on every
--   resume. "What did I need to talk to Justin about" reopens as "three of
--   those four are resolved, one is still open, and you've mentioned him twice
--   since" — which no general-purpose assistant can do, because none of them
--   have a state model behind the conversation.
--
-- Hence the three non-obvious columns below: opening_query, cited_ids,
-- last_checked_at. They are the diff inputs. See conversationService.ts.

CREATE SCHEMA IF NOT EXISTS hub;

CREATE TABLE IF NOT EXISTS hub.conversations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cascade, like every other user-owned table: deleting the account takes the
  -- threads with it.
  user_id          uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,

  -- Display name. Derived from the opening question on create, editable later.
  title            text        NOT NULL,

  -- The standing question. This is re-run through semantic search on every
  -- resume — NOT the user's latest message. A thread that opened with "what do
  -- I need to talk to Justin about" keeps sweeping for Justin even after the
  -- conversation wandered into something else, because that opening intent is
  -- what the user came back for.
  opening_query    text        NOT NULL,

  -- Union of every object id an answer in this thread was grounded in. This is
  -- the "what did we decide was relevant" set that resolution is checked
  -- against on resume. Deliberately NOT a foreign key array: objects get hard
  -- deleted, and a thread that cited a since-deleted note should still be able
  -- to say "one of these is gone" rather than lose the reference silently.
  cited_ids        uuid[]      NOT NULL DEFAULT '{}',

  -- Delta watermark: the instant the thread last saw the world. Everything
  -- that changed state or came into existence after this is "new since we
  -- talked". Advanced only when a delta is actually reported to the user, so a
  -- resume that fails partway does not silently swallow a window of changes.
  last_checked_at  timestamptz NOT NULL DEFAULT NOW(),

  -- Rolling summary of turns already folded away. Without this, a long thread
  -- plus a fresh retrieval sweep plus a delta report grows the prompt without
  -- bound; with it, old turns compress and recent turns stay verbatim.
  summary          text,

  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub.conversation_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id  uuid        NOT NULL REFERENCES hub.conversations(id) ON DELETE CASCADE,

  -- Denormalised so message reads can be scoped to the caller without joining
  -- back to conversations on every query.
  user_id          uuid        NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,

  -- 'delta' is a third role beside user/assistant: an auto-generated
  -- "here's what changed while you were gone" report, authored by no one's
  -- question. It renders differently and is excluded from LLM history replay
  -- (the underlying facts get re-derived anyway, so replaying an old delta
  -- would just feed the model stale change-reports).
  role             text        NOT NULL CHECK (role IN ('user', 'assistant', 'delta')),

  content          text        NOT NULL,

  -- Per-answer grounding. The thread-level cited_ids is the union of these.
  cited_ids        uuid[]      NOT NULL DEFAULT '{}',
  themes           text[]      NOT NULL DEFAULT '{}',
  gaps             text,
  has_contradictions boolean   NOT NULL DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT NOW()
);

-- Thread list: newest activity first.
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON hub.conversations (user_id, updated_at DESC);

-- Message fetch for one thread, in order.
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
  ON hub.conversation_messages (conversation_id, created_at);

-- Resume path: "which objects changed state since this thread last looked".
-- state_updated_at came from migration 008 and had no index; the delta query
-- filters on exactly (user_id, state_updated_at) for a handful of ids.
CREATE INDEX IF NOT EXISTS idx_ao_state_updated
  ON hub.atomic_objects (user_id, state_updated_at)
  WHERE deleted_at IS NULL;
