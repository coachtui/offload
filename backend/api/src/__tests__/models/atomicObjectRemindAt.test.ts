import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

function rowFrom(params: any[]) {
  return {
    id: 'o1', user_id: 'u1', content: params[1], category: [],
    confidence: 0.5,
    source_type: 'voice' as const,
    source_timestamp: new Date(),
    created_at: new Date(), updated_at: new Date(),
    object_type: params[21],
    remind_at: params[36] ?? null,
  };
}

describe('AtomicObjectModel.create — remind_at derivation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists a derived remind_at for an actionable note with a date ($37)', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    const obj = await AtomicObjectModel.create('u1', {
      content: 'call the dentist tomorrow at 2pm',
      source: { type: 'voice' },
      objectType: 'reminder',
      temporalHints: { hasDate: true, dateText: 'tomorrow at 2pm', urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[36]).toBeInstanceOf(Date);           // $37 remind_at
    expect((params[36] as Date).getTime()).toBeGreaterThan(Date.now());
    expect(obj.remindAt).toBeInstanceOf(Date);
  });

  it('persists null remind_at for a journal note with a date', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    await AtomicObjectModel.create('u1', {
      content: 'nice dinner last Friday',
      source: { type: 'voice' },
      objectType: 'journal',
      temporalHints: { hasDate: true, dateText: 'Friday', urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[36]).toBeNull();
  });

  it('persists null remind_at when there is no dateText', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    await AtomicObjectModel.create('u1', {
      content: 'buy milk',
      source: { type: 'voice' },
      objectType: 'task',
      temporalHints: { hasDate: false, dateText: null, urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[36]).toBeNull();
  });
});
