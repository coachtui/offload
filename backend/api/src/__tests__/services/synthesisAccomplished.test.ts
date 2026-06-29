import axios from 'axios';
import { generateWeeklySynthesis } from '../../services/synthesisService';
import { AtomicObjectModel } from '../../models/AtomicObject';
import { Session } from '../../models/Session';

jest.mock('axios');
jest.mock('../../models/AtomicObject');
jest.mock('../../models/Session');
jest.mock('../../db/connection', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockObj = AtomicObjectModel as jest.Mocked<typeof AtomicObjectModel>;
const mockSession = Session as jest.Mocked<typeof Session>;

const ORIGINAL_ENV = process.env;

function resolvedModel(title: string) {
  return { toAtomicObject: () => ({ id: title, title, content: title, state: 'resolved' }) } as any;
}

describe('generateWeeklySynthesis — accomplished section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, ANTHROPIC_API_KEY: 'test-key' };

    mockSession.findSyntheses.mockResolvedValue([]);
    mockObj.findByUserId.mockResolvedValue({ objects: [], total: 0 } as any);
    mockObj.findResolvedInPeriod.mockResolvedValue([
      resolvedModel('Bought milk'),
      resolvedModel('Picked up package'),
    ]);

    mockedAxios.post.mockResolvedValue({
      data: { content: [{ text: JSON.stringify({
        narrative: 'You had a productive week.',
        patterns: [], open_threads: [], contradictions: [], actionable_insights: [], cited_refs: [],
      }) }] },
    });

    const fakeSession = { id: 's1', update: jest.fn().mockResolvedValue(undefined) };
    mockSession.create.mockResolvedValue(fakeSession as any);
  });

  afterEach(() => { process.env = ORIGINAL_ENV; });

  it('lists resolved-this-period notes as accomplished, independent of the corpus', async () => {
    const result = await generateWeeklySynthesis('u1', 7, true);
    expect(result.accomplished).toEqual(['Bought milk', 'Picked up package']);
    expect(result.accomplishedCount).toBe(2);
    expect(mockObj.findResolvedInPeriod).toHaveBeenCalledWith('u1', expect.any(Date), expect.any(Date));
  });

  it('populates accomplished even when no notes were created this week', async () => {
    const result = await generateWeeklySynthesis('u1', 7, true);
    expect(result.objectCount).toBe(0);
    expect(result.accomplishedCount).toBe(2);
  });
});
