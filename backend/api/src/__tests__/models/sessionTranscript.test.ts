import { Session } from '../../models/Session';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

function row(overrides: any = {}) {
  return {
    id: 's-1',
    user_id: 'u-1',
    device_id: 'mobile-deepgram',
    location_latitude: null,
    location_longitude: null,
    location_accuracy: null,
    location_altitude: null,
    metadata: {},
    status: 'processing',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * The transcript is the durability guarantee behind the async save: it is written
 * before any parsing starts so a parse failure cannot cost the user their words.
 * It lives in `metadata` rather than a dedicated column because migrations on this
 * project are manual and not part of the deploy — a schema change would ship
 * broken. These tests pin that storage location, since a silent regression here
 * would make the recovery sweep blind and lose notes.
 */
describe('Session transcript storage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the transcript into metadata on create', async () => {
    mockQueries.queryOne.mockResolvedValue(row({ metadata: { transcript: 'buy milk' } }) as any);

    await Session.create({
      userId: 'u-1',
      deviceId: 'mobile-deepgram',
      metadata: { duration: 12 },
      transcript: 'buy milk',
      status: 'processing',
    });

    const params = mockQueries.queryOne.mock.calls[0][1] as any[];
    const metadataArg = params[6];
    expect(metadataArg).toEqual({ duration: 12, transcript: 'buy milk' });
    expect(params[7]).toBe('processing');
  });

  it('does not invent a transcript key when none is given', async () => {
    mockQueries.queryOne.mockResolvedValue(row() as any);

    await Session.create({ userId: 'u-1', deviceId: 'd', metadata: { duration: 3 } });

    const params = mockQueries.queryOne.mock.calls[0][1] as any[];
    expect(params[6]).toEqual({ duration: 3 });
    expect(params[7]).toBe('recording');
  });

  it('exposes the stored transcript as a property', () => {
    const session = new Session(row({ metadata: { transcript: 'call mum' } }) as any);
    expect(session.transcript).toBe('call mum');
  });

  it('leaves transcript undefined for rows that predate this', () => {
    const session = new Session(row({ metadata: { duration: 5 } }) as any);
    expect(session.transcript).toBeUndefined();
  });

  it('only finds stuck sessions that still carry a transcript', async () => {
    mockQueries.queryMany.mockResolvedValue([] as any);

    await Session.findStuckProcessing(600000, 20);

    const sql = mockQueries.queryMany.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'processing'");
    expect(sql).toContain("metadata->>'transcript' IS NOT NULL");
  });
});
