import request from 'supertest';
import express from 'express';
import voiceRouter from '../../routes/voice';
import * as processing from '../../services/transcriptProcessingService';
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
jest.mock('../../services/transcriptProcessingService');
jest.mock('../../models/Session');

const mockProcessing = processing as jest.Mocked<typeof processing>;
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

/** Let the setImmediate the route schedules actually run. */
const flushImmediates = () => new Promise((resolve) => setImmediate(resolve));

describe('POST /api/v1/voice/save-transcript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockSession.create.mockResolvedValue({ id: 's-1', metadata: {} } as any);
    mockProcessing.processSessionInBackground.mockResolvedValue(undefined);
  });

  it('returns 202 immediately with a processing status', async () => {
    const res = await post({ transcript: 'ramble for a while' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ sessionId: 's-1', status: 'processing' });
  });

  // The whole point of the async rework: the transcript is durable before any
  // LLM work starts, so nothing downstream can lose the user's words.
  it('persists the transcript on the session before responding', async () => {
    await post({ transcript: 'buy milk and call mum' });

    expect(MockSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        transcript: 'buy milk and call mum',
        status: 'processing',
      })
    );
  });

  it('schedules background processing for the created session', async () => {
    await post({ transcript: 'sort this out later' });
    await flushImmediates();

    expect(mockProcessing.processSessionInBackground).toHaveBeenCalledTimes(1);
    expect(mockProcessing.processSessionInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's-1' })
    );
  });

  // Old clients (the March production build, on a different runtime version)
  // read these fields unconditionally. Absent keys would break their parsing.
  it('keeps the legacy response fields present and empty', async () => {
    const res = await post({ transcript: 'hello' });

    expect(res.body.objectIds).toEqual([]);
    expect(res.body.objectCount).toBe(0);
    expect(res.body.hasGeofenceCandidates).toBe(false);
    expect(res.body.placeNames).toEqual([]);
  });

  it('does not wait on background processing before responding', async () => {
    let release: () => void = () => {};
    mockProcessing.processSessionInBackground.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; })
    );

    // Resolves despite processing never settling — a hung parse must not hang
    // the request, which was the original failure mode.
    const res = await post({ transcript: 'a very long note' });
    expect(res.status).toBe(202);

    release();
  });

  it('500s when the transcript cannot be persisted', async () => {
    MockSession.create.mockRejectedValue(new Error('postgres is unreachable'));

    const res = await post({ transcript: 'cannot store this' });

    expect(res.status).toBe(500);
    expect(mockProcessing.processSessionInBackground).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await post({ transcript: 'hello' }, null);
    expect(res.status).toBe(401);
    expect(MockSession.create).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty transcript', async () => {
    const res = await post({ transcript: '' });
    expect(res.status).toBe(400);
    expect(MockSession.create).not.toHaveBeenCalled();
  });
});
