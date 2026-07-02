import { formatNotesForPrompt, RetrievedNote } from '../../services/sparringService';

function note(overrides: Partial<RetrievedNote>): RetrievedNote {
  return {
    objectId: 'o1',
    score: 0.9,
    title: 'Send Justin the quote',
    cleanedText: 'Send Justin the quote by next week (promised)',
    rawText: null,
    type: 'commitment',
    domain: 'work',
    tags: ['quote'],
    createdAt: '2026-07-01T00:00:00.000Z',
    sourceTranscriptId: null,
    isActionable: true,
    nextAction: null,
    people: [],
    ...overrides,
  } as RetrievedNote;
}

describe('formatNotesForPrompt — people line', () => {
  it('renders a People line when the note has person entities', () => {
    const text = formatNotesForPrompt([note({ people: ['Justin', 'Chris'] })]);
    expect(text).toContain('People: Justin, Chris');
  });

  it('omits the People line when there are none', () => {
    const text = formatNotesForPrompt([note({ people: [] })]);
    expect(text).not.toContain('People:');
  });
});
