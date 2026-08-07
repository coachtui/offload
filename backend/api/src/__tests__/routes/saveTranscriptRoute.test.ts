import request from 'supertest';
import express from 'express';
import voiceRouter from '../../routes/voice';
import * as mlService from '../../services/mlService';
import * as objectService from '../../services/objectService';
import { Session } from '../../models/Session';

jest.mock('../../auth/middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
// transcriptionService constructs an OpenAI client at module scope, so importing
// the voice router for real would demand OPENAI_API_KEY. Nothing here exercises
// the transcribe route.
jest.mock('../../services/transcriptionService', () => ({
  transcribeWithGpt4o: jest.fn(),
}));
jest.mock('../../services/mlService');
jest.mock('../../services/objectService');
jest.mock('../../services/placeService', () => ({
  resolveObjectPlaces: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../models/Session');

const mockMl = mlService as jest.Mocked<typeof mlService>;
const mockObjects = objectService as jest.Mocked<typeof objectService>;
const MockSession = Session as jest.Mocked<typeof Session>;

function appWithUser(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = userId ? { id: userId } : undefined; next(); });
  app.use('/api/v1/voice', voiceRouter);
  return app;
}

function post(body: any, userId: string | null = 'u-1') {
  return request(appWithUser(userId)).post('/api/v1/voice/save-transcript').send(body);
}

describe('POST /api/v1/voice/save-transcript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockSession.create.mockResolvedValue({
      id: 's-1',
      metadata: {},
      update: jest.fn().mockResolvedValue(undefined),
    } as any);
    let n = 0;
    mockObjects.createObject.mockImplementation(async () => ({ id: `o-${++n}` }) as any);
  });

  it('creates one object per parsed item when the parse succeeds', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockResolvedValue({
      atomicObjects: [
        { rawText: 'a', cleanedText: 'a', entities: [], people: [], tags: [], temporalHints: {}, locationHints: {} },
        { rawText: 'b', cleanedText: 'b', entities: [], people: [], tags: [], temporalHints: {}, locationHints: {} },
      ],
      processingTime: 1,
      modelUsed: 'gpt-4o',
    } as any);

    const res = await post({ transcript: 'a. b.' });

    expect(res.status).toBe(200);
    expect(res.body.objectCount).toBe(2);
    expect(mockObjects.createObject).toHaveBeenCalledTimes(2);
  });

  // The regression this guards: the parse used to be trusted to either succeed or
  // mean the service was down. A parse that threw on a *healthy* service — which
  // is what a timeout looks like, and long notes are the ones that time out —
  // propagated out and 500'd, so the user was told "Couldn't save your note" and
  // nothing at all was written. The note must survive a parse failure.
  it('falls back to saving the raw transcript when the parse fails', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(true);
    mockMl.parseTranscript.mockRejectedValue(new Error('timeout of 105000ms exceeded'));

    const res = await post({ transcript: 'a long note that took too long to parse' });

    expect(res.status).toBe(200);
    expect(res.body.objectCount).toBe(1);
    expect(mockObjects.createObject).toHaveBeenCalledTimes(1);
    expect(mockObjects.createObject).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ content: 'a long note that took too long to parse' })
    );
  });

  it('falls back to saving the raw transcript when the ML service is down', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(false);

    const res = await post({ transcript: 'service is down' });

    expect(res.status).toBe(200);
    expect(res.body.objectCount).toBe(1);
    expect(mockMl.parseTranscript).not.toHaveBeenCalled();
  });

  // A write failure is genuinely unrecoverable — there is no degraded path left,
  // so it must still surface rather than reporting a save that didn't happen.
  it('still 500s when the object write itself fails', async () => {
    mockMl.checkMLServiceHealth.mockResolvedValue(false);
    mockObjects.createObject.mockRejectedValue(new Error('postgres is unreachable'));

    const res = await post({ transcript: 'cannot write this' });

    expect(res.status).toBe(500);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await post({ transcript: 'hello' }, null);
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty transcript', async () => {
    const res = await post({ transcript: '' });
    expect(res.status).toBe(400);
  });
});
