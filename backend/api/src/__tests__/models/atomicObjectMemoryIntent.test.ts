import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

// Minimal row the mapper needs; create() returns a model built from this row.
function rowFrom(params: any[]) {
  return {
    id: 'o1', user_id: 'u1', content: params[1], category: [],
    created_at: new Date(), updated_at: new Date(),
    object_type: params[21],
    why_it_matters: params[33], retention_policy: params[34], trigger_context: params[35],
  };
}

describe('AtomicObjectModel.create — memory intent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists whyItMatters and derives retention/trigger for a commitment with a place', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);

    const obj = await AtomicObjectModel.create('u1', {
      content: 'I told Justin I would send the quote',
      source: { type: 'voice' },
      objectType: 'commitment',
      whyItMatters: 'Promised to a client; follow up',
      locationHints: { places: ['office'], geofenceCandidate: false },
      temporalHints: { hasDate: false, dateText: null, urgency: null },
    } as any);

    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    // $22 object_type, $34 why, $35 retention, $36 trigger (1-indexed → array idx 21/33/34/35)
    expect(params[21]).toBe('commitment');
    expect(params[33]).toBe('Promised to a client; follow up');
    expect(params[34]).toBe('until_done');   // commitment
    expect(params[35]).toBe('place');        // has places
    expect(obj.toAtomicObject().whyItMatters).toBe('Promised to a client; follow up');
    expect(obj.toAtomicObject().retentionPolicy).toBe('until_done');
    expect(obj.toAtomicObject().triggerContext).toBe('place');
  });

  it('derives time trigger + temporary retention for an idea with a date', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    await AtomicObjectModel.create('u1', {
      content: 'maybe refactor parser next Friday',
      source: { type: 'voice' },
      objectType: 'idea',
      temporalHints: { hasDate: true, dateText: 'Friday', urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[34]).toBe('temporary'); // idea
    expect(params[35]).toBe('time');      // hasDate, no place
  });
});
