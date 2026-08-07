import { recoverStuckTranscripts } from '../../jobs/transcriptRecoveryJob';
import { Session } from '../../models/Session';
import * as processing from '../../services/transcriptProcessingService';

jest.mock('../../models/Session');
jest.mock('../../services/transcriptProcessingService');

const MockSession = Session as jest.Mocked<typeof Session>;
const mockProcessing = processing as jest.Mocked<typeof processing>;

function session(id: string) {
  return { id, userId: 'u-1', transcript: 'stranded', metadata: {}, update: jest.fn() } as any;
}

describe('recoverStuckTranscripts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessing.processSessionInBackground.mockResolvedValue(undefined);
  });

  it('does nothing when there is nothing stranded', async () => {
    MockSession.claimStuckProcessing.mockResolvedValue(null);

    const result = await recoverStuckTranscripts();

    expect(result).toEqual({ found: 0, recovered: 0 });
    expect(mockProcessing.processSessionInBackground).not.toHaveBeenCalled();
  });

  // The loop is bounded by BATCH_SIZE, so an empty claim has to break out of it
  // rather than keep asking — otherwise every idle tick issues 20 queries.
  it('stops claiming as soon as the queue drains', async () => {
    MockSession.claimStuckProcessing
      .mockResolvedValueOnce(session('s-1'))
      .mockResolvedValueOnce(session('s-2'))
      .mockResolvedValue(null);

    const result = await recoverStuckTranscripts();

    expect(result).toEqual({ found: 2, recovered: 2 });
    expect(MockSession.claimStuckProcessing).toHaveBeenCalledTimes(3);
  });

  it('keeps going when one session fails to process', async () => {
    MockSession.claimStuckProcessing
      .mockResolvedValueOnce(session('s-1'))
      .mockResolvedValueOnce(session('s-2'))
      .mockResolvedValue(null);
    mockProcessing.processSessionInBackground
      .mockRejectedValueOnce(new Error('still broken'))
      .mockResolvedValue(undefined);

    const result = await recoverStuckTranscripts();

    expect(result).toEqual({ found: 2, recovered: 1 });
  });

  // A runaway backlog must not let one tick monopolise the process.
  it('caps how many it takes in a single sweep', async () => {
    MockSession.claimStuckProcessing.mockImplementation(async () => session('s-x'));

    const result = await recoverStuckTranscripts();

    expect(result.found).toBeLessThanOrEqual(20);
    expect(MockSession.claimStuckProcessing.mock.calls.length).toBeLessThanOrEqual(20);
  });
});
