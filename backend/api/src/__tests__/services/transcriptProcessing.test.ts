import {
  processTranscript,
  processSessionInBackground,
  completionMessage,
  completionTarget,
} from '../../services/transcriptProcessingService';
import * as mlService from '../../services/mlService';
import * as objectService from '../../services/objectService';
import * as pushService from '../../services/pushService';

jest.mock('../../services/mlService');
jest.mock('../../services/objectService');
jest.mock('../../services/pushService');
jest.mock('../../services/placeService', () => ({
  resolveObjectPlaces: jest.fn().mockResolvedValue(undefined),
}));

const mockMl = mlService as jest.Mocked<typeof mlService>;
const mockObjects = objectService as jest.Mocked<typeof objectService>;
const mockPush = pushService as jest.Mocked<typeof pushService>;

function parsed(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    rawText: `item ${i}`,
    cleanedText: `item ${i}`,
    entities: [],
    people: [],
    tags: [],
    temporalHints: {},
    locationHints: {},
    sequenceIndex: i,
  }));
}

describe('processTranscript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let n = 0;
    mockObjects.createObject.mockImplementation(async () => ({ id: `o-${++n}` }) as any);
    mockPush.sendToUser.mockResolvedValue(true);
  });

  it('creates one object per parsed item', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockResolvedValue({ atomicObjects: parsed(3) } as any);

    const result = await processTranscript({
      userId: 'u-1', sessionId: 's-1', transcript: 'three things',
    });

    expect(result.objectIds).toHaveLength(3);
    expect(result.degraded).toBe(false);
  });

  // Writes run concurrently now, but objectIds must still reflect spoken order —
  // a concurrent map that returns in completion order would scramble the note.
  it('preserves parse order despite concurrent writes', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockResolvedValue({ atomicObjects: parsed(8) } as any);

    // Later items resolve first, so completion order is the reverse of input.
    mockObjects.createObject.mockImplementation(async (_userId, input: any) => {
      const index = Number(input.rawText.split(' ')[1]);
      await new Promise((r) => setTimeout(r, (8 - index) * 2));
      return { id: `o-${index}` } as any;
    });

    const result = await processTranscript({
      userId: 'u-1', sessionId: 's-1', transcript: 'eight things',
    });

    expect(result.objectIds).toEqual(['o-0', 'o-1', 'o-2', 'o-3', 'o-4', 'o-5', 'o-6', 'o-7']);
  });

  it('writes concurrently rather than one at a time', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockResolvedValue({ atomicObjects: parsed(5) } as any);

    let inFlight = 0;
    let peak = 0;
    mockObjects.createObject.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { id: 'o-x' } as any;
    });

    await processTranscript({ userId: 'u-1', sessionId: 's-1', transcript: 'five things' });

    expect(peak).toBeGreaterThan(1);
  });

  // The regression that started all of this: a parse that throws on a healthy
  // service used to lose the note outright.
  it('falls back to an unparsed save when the parse fails', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockRejectedValue(new Error('timeout'));

    const result = await processTranscript({
      userId: 'u-1', sessionId: 's-1', transcript: 'a long note',
    });

    expect(result.degraded).toBe(true);
    expect(result.objectIds).toHaveLength(1);
    expect(mockObjects.createObject).toHaveBeenCalledWith(
      'u-1', expect.objectContaining({ content: 'a long note' })
    );
  });

  it('falls back when the ML service is down', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(false);

    const result = await processTranscript({
      userId: 'u-1', sessionId: 's-1', transcript: 'service down',
    });

    expect(result.degraded).toBe(true);
    expect(mockMl.parseTranscript).not.toHaveBeenCalled();
  });

  // An empty parse reported as success is how a note vanishes quietly: the user
  // is told "Saved" and nothing was written.
  it('falls back when the parse returns no objects', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockResolvedValue({ atomicObjects: [] } as any);

    const result = await processTranscript({
      userId: 'u-1', sessionId: 's-1', transcript: 'nothing extracted',
    });

    expect(result.degraded).toBe(true);
    expect(result.objectIds).toHaveLength(1);
  });
});

describe('processSessionInBackground', () => {
  function fakeSession(overrides: any = {}) {
    return {
      id: 's-1',
      userId: 'u-1',
      metadata: {},
      transcript: 'buy milk',
      location: undefined,
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockObjects.createObject.mockResolvedValue({ id: 'o-1' } as any);
    mockPush.sendToUser.mockResolvedValue(true);
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockResolvedValue({ atomicObjects: parsed(2) } as any);
  });

  it('marks the session completed and pushes the result', async () => {
    const session = fakeSession();

    await processSessionInBackground(session);

    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
    expect(mockPush.sendToUser).toHaveBeenCalledWith('u-1', expect.objectContaining({
      title: expect.stringContaining('sorted'),
    }));
  });

  it('marks the session failed and still notifies when processing throws', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(false);
    mockObjects.createObject.mockRejectedValue(new Error('postgres is unreachable'));
    const session = fakeSession();

    await processSessionInBackground(session);

    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      metadata: expect.objectContaining({ processingError: 'postgres is unreachable' }),
    }));
    expect(mockPush.sendToUser).toHaveBeenCalledWith('u-1', expect.objectContaining({
      body: expect.stringContaining('saved'),
    }));
  });

  // Called from setImmediate and from the recovery sweep — a rejection here has
  // nowhere to go and would take the process down.
  it('never rejects, even when the session update itself fails', async () => {
    const session = fakeSession({
      update: jest.fn().mockRejectedValue(new Error('db gone')),
    });

    await expect(processSessionInBackground(session)).resolves.toBeUndefined();
  });

  it('marks sessions with no transcript failed rather than processing them', async () => {
    const session = fakeSession({ transcript: undefined });

    await processSessionInBackground(session);

    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(mockMl.parseTranscript).not.toHaveBeenCalled();
  });
});

describe('completionMessage', () => {
  const base = { objectIds: [], hasGeofenceCandidates: false, placeNames: [], degraded: false };

  it('pluralises correctly', () => {
    expect(completionMessage({ ...base, objectIds: ['a'] }).body).toBe('Saved as 1 note');
    expect(completionMessage({ ...base, objectIds: ['a', 'b'] }).body).toBe('Sorted into 2 notes');
  });

  // A degraded save is still a save; the wording must not imply data loss.
  it('reassures rather than alarms when the note could not be split', () => {
    const msg = completionMessage({ ...base, objectIds: ['a'], degraded: true });
    expect(msg.title).toContain('saved');
    expect(msg.body).toContain('safe');
  });
});

describe('completionTarget', () => {
  it('opens the note itself when the recording made exactly one', () => {
    expect(completionTarget('s1', ['a'])).toEqual({
      screen: 'Objects',
      objectId: 'a',
      sessionId: 's1',
    });
  });

  // Picking one of several arbitrarily is worse than showing all of them.
  it('opens the list scoped to the recording when it made several', () => {
    expect(completionTarget('s1', ['a', 'b', 'c'])).toEqual({
      screen: 'Objects',
      sessionId: 's1',
    });
  });

  it('falls back to Home when there is no note to open', () => {
    expect(completionTarget('s1', [])).toEqual({ screen: 'Home', sessionId: 's1' });
  });
});
