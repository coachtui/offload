import { typeEntities, extractPeople } from '../../services/entityTyping';

describe('typeEntities', () => {
  it('types an entity person when it appears in people', () => {
    const result = typeEntities(['Justin', 'Costco'], ['Justin']);
    expect(result).toEqual([
      { type: 'person', value: 'Justin', confidence: 1.0 },
      { type: 'other', value: 'Costco', confidence: 1.0 },
    ]);
  });

  it('matches case-insensitively but preserves the spoken casing', () => {
    const result = typeEntities(['justin'], ['Justin']);
    expect(result).toEqual([{ type: 'person', value: 'justin', confidence: 1.0 }]);
  });

  it('types everything other when people is empty', () => {
    expect(typeEntities(['Justin'], []).every((e) => e.type === 'other')).toBe(true);
  });

  it('ignores people names that are not in entities', () => {
    expect(typeEntities(['Costco'], ['Justin'])).toEqual([
      { type: 'other', value: 'Costco', confidence: 1.0 },
    ]);
  });
});

describe('extractPeople', () => {
  it('returns person entity values only', () => {
    expect(
      extractPeople([
        { type: 'person', value: 'Justin', confidence: 1 },
        { type: 'other', value: 'Costco', confidence: 1 },
      ])
    ).toEqual(['Justin']);
  });

  it('handles undefined/null/empty', () => {
    expect(extractPeople(undefined)).toEqual([]);
    expect(extractPeople(null)).toEqual([]);
    expect(extractPeople([])).toEqual([]);
  });
});
