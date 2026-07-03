import { shouldSupersede, applySupersede, SUPERSEDE_MIN_SCORE } from '../../services/reinforcementService';
import * as vectorService from '../../services/vectorService';
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../services/vectorService');
jest.mock('../../models/AtomicObject');
jest.mock('../../db/queries');
const mockVector = vectorService as jest.Mocked<typeof vectorService>;
const mockModel = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;
const mockQ = queries as jest.Mocked<typeof queries>;

const CAND = { id: 'new-1', objectType: 'task' };
const MATCH = { id: 'old-1', objectType: 'task', state: 'open', score: 0.9 };

describe('shouldSupersede (pure gate)', () => {
  it('passes the happy path', () => {
    expect(shouldSupersede(CAND, MATCH)).toBe(true);
  });
  it('rejects below the score threshold', () => {
    expect(shouldSupersede(CAND, { ...MATCH, score: 0.84 })).toBe(false);
    expect(shouldSupersede(CAND, { ...MATCH, score: SUPERSEDE_MIN_SCORE })).toBe(true); // inclusive
  });
  it('rejects cross-type matches', () => {
    expect(shouldSupersede(CAND, { ...MATCH, objectType: 'journal' })).toBe(false);
  });
  it('rejects non-open/active matches', () => {
    expect(shouldSupersede(CAND, { ...MATCH, state: 'resolved' })).toBe(false);
    expect(shouldSupersede(CAND, { ...MATCH, state: 'archived' })).toBe(false);
    expect(shouldSupersede(CAND, { ...MATCH, state: 'active' })).toBe(true);
  });
  it('rejects self-matches', () => {
    expect(shouldSupersede(CAND, { ...MATCH, id: 'new-1' })).toBe(false);
  });
  it('rejects non-eligible candidate types', () => {
    for (const t of ['journal', 'preference', 'decision', 'idea', 'observation', 'question', 'reference', null]) {
      expect(shouldSupersede({ id: 'new-1', objectType: t }, MATCH)).toBe(false);
    }
    for (const t of ['task', 'reminder', 'commitment', 'concern']) {
      expect(shouldSupersede({ id: 'new-1', objectType: t }, { ...MATCH, objectType: t })).toBe(true);
    }
  });
});

describe('applySupersede', () => {
  const candidateModel = { id: 'new-1', userId: 'u1', objectType: 'task' };
  const matchModel = { id: 'old-1', userId: 'u1', objectType: 'task', state: 'open' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockModel.findById.mockResolvedValue(candidateModel as any);
    mockModel.findByIds.mockResolvedValue([matchModel as any]);
    mockQ.query.mockResolvedValue({ rowCount: 1 } as any);
  });

  it('links the new note FIRST, then archives the old (order matters)', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'old-1', content: '', distance: 0.1, score: 0.9 },
    ]);

    await applySupersede('new-1', 'u1');

    expect(mockQ.query).toHaveBeenCalledTimes(2);
    const [firstSql, firstParams] = mockQ.query.mock.calls[0];
    const [secondSql, secondParams] = mockQ.query.mock.calls[1];
    expect(firstSql).toContain('SET evolved_from_id');
    expect(firstSql).toContain('mention_count');
    expect(firstParams).toEqual(['old-1', 'new-1']);
    expect(secondSql).toContain("SET state = 'archived'");
    expect(secondParams).toEqual(['old-1']);
  });

  it('supersedes only the top-scoring qualifying match', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'best', content: '', distance: 0.05, score: 0.95 },
      { objectId: 'old-1', content: '', distance: 0.1, score: 0.9 },
    ]);
    mockModel.findByIds.mockResolvedValue([
      { id: 'best', userId: 'u1', objectType: 'journal', state: 'open' } as any, // fails gate (type)
      matchModel as any,
    ]);

    await applySupersede('new-1', 'u1');

    const [, firstParams] = mockQ.query.mock.calls[0];
    expect(firstParams).toEqual(['old-1', 'new-1']); // fell through to next-best qualifying
  });

  it('does nothing when no match clears the gate', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'old-1', content: '', distance: 0.3, score: 0.7 },
    ]);
    await applySupersede('new-1', 'u1');
    expect(mockQ.query).not.toHaveBeenCalled();
  });

  it('never throws — vector failure is swallowed with a warn', async () => {
    mockVector.findSimilar.mockRejectedValue(new Error('weaviate down'));
    await expect(applySupersede('new-1', 'u1')).resolves.toBeUndefined();
    expect(mockQ.query).not.toHaveBeenCalled();
  });

  it('skips matches belonging to another user', async () => {
    mockVector.findSimilar.mockResolvedValue([
      { objectId: 'old-1', content: '', distance: 0.1, score: 0.9 },
    ]);
    mockModel.findByIds.mockResolvedValue([{ ...matchModel, userId: 'u2' } as any]);
    await applySupersede('new-1', 'u1');
    expect(mockQ.query).not.toHaveBeenCalled();
  });
});
