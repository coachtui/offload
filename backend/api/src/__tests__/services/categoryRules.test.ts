// backend/api/src/__tests__/services/categoryRules.test.ts
import { matchCategoryForText } from '../../services/categoryService';

describe('matchCategoryForText', () => {
  const cats = [
    { id: 'fit', keywords: ['gym', 'run'] },
    { id: 'work', keywords: ['invoice'] },
  ];

  it('matches case-insensitively on substring', () => {
    expect(matchCategoryForText(cats, 'Hit the GYM at 6')).toBe('fit');
  });

  it('returns the first category in order on multiple matches', () => {
    expect(matchCategoryForText(cats, 'gym then send invoice')).toBe('fit');
  });

  it('returns null when nothing matches', () => {
    expect(matchCategoryForText(cats, 'buy milk')).toBeNull();
  });

  it('ignores empty keyword lists', () => {
    expect(matchCategoryForText([{ id: 'x', keywords: [] }], 'anything')).toBeNull();
  });
});
