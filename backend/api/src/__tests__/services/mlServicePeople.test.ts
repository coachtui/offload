import { mapParsedObject } from '../../services/mlService';

describe('mlService mapping — people field', () => {
  it('maps people through when the parser provides it', () => {
    const mapped = mapParsedObject(
      { cleaned_text: 'Send Justin the quote', type: 'commitment', entities: ['Justin'], people: ['Justin'], confidence: 0.9 },
      0
    );
    expect(mapped.people).toEqual(['Justin']);
  });

  it('defaults people to [] when the parser omits it (old parser tolerance)', () => {
    const mapped = mapParsedObject(
      { cleaned_text: 'buy milk', type: 'task', entities: [], confidence: 0.9 },
      0
    );
    expect(mapped.people).toEqual([]);
  });
});
