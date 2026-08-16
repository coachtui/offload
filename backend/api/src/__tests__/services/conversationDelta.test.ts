/**
 * computeDelta — the resume diff.
 *
 * This is the one place in Ask Offload that makes factual claims about the
 * user's own progress ("you closed that", "that's new since"). Every claim has
 * to come from the database, and the buckets have to be *narrow*: the failure
 * mode nobody catches is a delta that re-reports the same resolution on every
 * open, or calls a note the user has had for months "new", and quietly trains
 * them to stop reading the report.
 *
 * So the properties pinned here are all about the watermark:
 *   - resolved counts only if it closed AFTER the watermark
 *   - new counts only if it was created AFTER the watermark
 *   - still-open is state, not timing, and always reports
 *   - a dead vector store loses the "new" half, not the whole diff
 */

import { computeDelta, describeDeltaPlainly } from '../../services/conversationService';
import * as queries from '../../db/queries';
import * as vectorService from '../../services/vectorService';
import type { Conversation } from '../../models/Conversation';

jest.mock('../../db/queries');
jest.mock('../../services/vectorService');

const mockQueries = queries as jest.Mocked<typeof queries>;
const mockVector = vectorService as jest.Mocked<typeof vectorService>;

const USER_ID = 'u-1';
const WATERMARK = new Date('2026-08-01T00:00:00Z');

const BEFORE = new Date('2026-07-20T00:00:00Z');
const AFTER = new Date('2026-08-10T00:00:00Z');

function buildConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-1',
    title: 'Justin',
    openingQuery: 'what did I need to talk to Justin about',
    citedIds: [],
    lastCheckedAt: WATERMARK,
    summary: null,
    createdAt: BEFORE,
    updatedAt: BEFORE,
    ...overrides,
  };
}

function objectRow(overrides: Record<string, any> = {}) {
  return {
    id: 'o-1',
    title: 'Ask Justin about the invoice',
    cleaned_text: null,
    content: null,
    object_type: 'task',
    state: 'open',
    state_updated_at: null,
    created_at: BEFORE,
    metadata: { entities: [{ type: 'person', value: 'Justin' }] },
    actionability: { isActionable: true, nextAction: 'send the invoice' },
    ...overrides,
  };
}

const NOW = new Date('2026-08-15T00:00:00Z');

/**
 * computeDelta issues the database-clock read first, then at most two more
 * queryMany calls: cited objects, then the fresh-sweep hydration. Queue the
 * responses for those two in order; the clock read is handled here.
 */
function queueRows(...batches: any[][]) {
  mockQueries.queryMany.mockReset();
  mockQueries.queryMany.mockResolvedValueOnce([{ now: NOW }] as any);
  for (const batch of batches) {
    mockQueries.queryMany.mockResolvedValueOnce(batch as any);
  }
  mockQueries.queryMany.mockResolvedValue([] as any);
}

/** Data queries only — drops the leading database-clock read. */
function dataCalls() {
  return mockQueries.queryMany.mock.calls.slice(1);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVector.semanticSearch.mockResolvedValue([] as any);
  queueRows([]);
});

describe('computeDelta — resolution bucket', () => {
  it('reports a cited note that closed after the watermark', async () => {
    queueRows([objectRow({ state: 'resolved', state_updated_at: AFTER })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.resolved.map((o) => o.objectId)).toEqual(['o-1']);
    expect(delta.stillOpen).toHaveLength(0);
    expect(delta.hasChanges).toBe(true);
  });

  it('does NOT re-report a note that was already resolved at the last visit', async () => {
    // The whole point of the watermark. Without this the same "you closed the
    // invoice question" line reappears on every single open, forever.
    queueRows([objectRow({ state: 'resolved', state_updated_at: BEFORE })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.resolved).toHaveLength(0);
    expect(delta.stillOpen).toHaveLength(0);
    expect(delta.hasChanges).toBe(false);
  });

  it('treats archived the same as resolved', async () => {
    queueRows([objectRow({ state: 'archived', state_updated_at: AFTER })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.resolved).toHaveLength(1);
  });

  it('reports a closed note with no state_updated_at as neither resolved nor open', async () => {
    // Legacy rows predating migration 008's timestamp. Claiming "you just
    // closed this" about an unknown date is worse than staying quiet.
    queueRows([objectRow({ state: 'resolved', state_updated_at: null })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.resolved).toHaveLength(0);
    expect(delta.stillOpen).toHaveLength(0);
  });
});

describe('computeDelta — still-open bucket', () => {
  it('always reports open cited notes regardless of the watermark', async () => {
    queueRows([
      objectRow({ id: 'o-1', state: 'open' }),
      objectRow({ id: 'o-2', state: 'active' }),
    ]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1', 'o-2'] }));

    expect(delta.stillOpen.map((o) => o.objectId).sort()).toEqual(['o-1', 'o-2']);
  });

  it('still-open alone does not count as a change worth reporting', async () => {
    // Reopening a thread where nothing moved should not manufacture a report.
    queueRows([objectRow({ state: 'open' })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.hasChanges).toBe(false);
    expect(delta.stillOpen).toHaveLength(1);
  });
});

describe('computeDelta — deleted bucket', () => {
  it('reports cited ids that no longer exist', async () => {
    queueRows([objectRow({ id: 'o-1' })]);

    const delta = await computeDelta(
      USER_ID,
      buildConversation({ citedIds: ['o-1', 'o-2', 'o-3'] })
    );

    expect(delta.gone.sort()).toEqual(['o-2', 'o-3']);
    expect(delta.hasChanges).toBe(true);
  });
});

describe('computeDelta — fresh sweep', () => {
  it('reports a relevant note captured after the watermark', async () => {
    mockVector.semanticSearch.mockResolvedValue([{ objectId: 'o-new', score: 0.8 }] as any);
    // No cited ids, so the cited query is skipped and the sweep hydration is
    // the *first* queryMany call.
    queueRows([objectRow({ id: 'o-new', created_at: AFTER })]);

    const delta = await computeDelta(USER_ID, buildConversation());

    expect(delta.newlyMentioned.map((o) => o.objectId)).toEqual(['o-new']);
    expect(delta.hasChanges).toBe(true);
  });

  it('sweeps the OPENING query, not the thread title or latest message', async () => {
    // A thread that wandered still resumes on the question the user came back
    // for. Getting this wrong makes the delta drift off-topic over time.
    mockVector.semanticSearch.mockResolvedValue([] as any);
    queueRows([]);

    await computeDelta(
      USER_ID,
      buildConversation({ title: 'Something else entirely', openingQuery: 'the Justin question' })
    );

    expect(mockVector.semanticSearch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, query: 'the Justin question' })
    );
  });

  it('excludes already-cited objects from the sweep hydration', async () => {
    mockVector.semanticSearch.mockResolvedValue([
      { objectId: 'o-1', score: 0.9 },
      { objectId: 'o-new', score: 0.7 },
    ] as any);
    queueRows([objectRow({ id: 'o-1' })], [objectRow({ id: 'o-new', created_at: AFTER })]);

    await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    // Second queryMany is the sweep hydration; its id array must not contain o-1,
    // whose state is already covered by the cited buckets.
    const sweepCall = dataCalls()[1];
    expect(sweepCall[1]![0]).toEqual(['o-new']);
  });

  it('survives a dead vector store with the resolution half intact', async () => {
    mockVector.semanticSearch.mockRejectedValue(new Error('weaviate down'));
    queueRows([objectRow({ state: 'resolved', state_updated_at: AFTER })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.resolved).toHaveLength(1);
    expect(delta.newlyMentioned).toHaveLength(0);
    expect(delta.hasChanges).toBe(true);
  });

  it('skips the sweep query entirely when every hit is already cited', async () => {
    mockVector.semanticSearch.mockResolvedValue([{ objectId: 'o-1', score: 0.9 }] as any);
    queueRows([objectRow({ id: 'o-1' })]);

    await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(dataCalls()).toHaveLength(1);
  });
});

describe('computeDelta — scoping and shape', () => {
  it('scopes the cited lookup to the calling user', async () => {
    queueRows([]);

    await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(dataCalls()[0][1]).toEqual([['o-1'], USER_ID]);
  });

  it('skips the cited query when the thread has never cited anything', async () => {
    mockVector.semanticSearch.mockResolvedValue([] as any);
    queueRows([]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: [] }));

    expect(dataCalls()).toHaveLength(0);
    expect(delta.hasChanges).toBe(false);
  });

  it('carries people through so the narration can name them', async () => {
    queueRows([objectRow({ state: 'open' })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.stillOpen[0].people).toEqual(['Justin']);
  });

  it('truncates long titles rather than pushing the whole note into the prompt', async () => {
    queueRows([objectRow({ title: null, cleaned_text: 'x'.repeat(500), state: 'open' })]);

    const delta = await computeDelta(USER_ID, buildConversation({ citedIds: ['o-1'] }));

    expect(delta.stillOpen[0].title.length).toBeLessThanOrEqual(140);
    expect(delta.stillOpen[0].title.endsWith('…')).toBe(true);
  });
});

describe('describeDeltaPlainly — the no-LLM fallback', () => {
  const base = {
    resolved: [],
    stillOpen: [],
    gone: [],
    newlyMentioned: [],
    daysSince: 5,
    checkedAt: AFTER,
  };

  it('states plainly that nothing changed', () => {
    expect(describeDeltaPlainly({ ...base, hasChanges: false })).toMatch(/nothing has changed/i);
  });

  it('mentions how many are still open when nothing changed', () => {
    const text = describeDeltaPlainly({
      ...base,
      hasChanges: false,
      stillOpen: [{ objectId: 'o-1', title: 'a', type: 'task', state: 'open', createdAt: '', stateUpdatedAt: null, nextAction: null, people: [] }],
    });
    expect(text).toMatch(/1 item is still open/i);
  });

  it('lists resolved items when there are changes', () => {
    const text = describeDeltaPlainly({
      ...base,
      hasChanges: true,
      resolved: [{ objectId: 'o-1', title: 'the invoice question', type: 'task', state: 'resolved', createdAt: '', stateUpdatedAt: null, nextAction: null, people: [] }],
    });
    expect(text).toContain('1 resolved');
    expect(text).toContain('the invoice question');
  });
});
