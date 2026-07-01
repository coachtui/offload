import { mapParsedObject } from '../../services/mlService';

describe('mlService why_it_matters mapping', () => {
  it('maps snake_case why_it_matters to whyItMatters', () => {
    const out = mapParsedObject(
      { content: 'x', type: 'commitment', why_it_matters: 'promised to Justin' } as any,
      0
    );
    expect(out.whyItMatters).toBe('promised to Justin');
  });

  it('defaults missing why_it_matters to null', () => {
    const out = mapParsedObject({ content: 'x', type: 'task' } as any, 0);
    expect(out.whyItMatters).toBeNull();
  });

  it('passes through a new type', () => {
    const out = mapParsedObject({ content: 'x', type: 'preference' } as any, 0);
    expect(out.type).toBe('preference');
  });
});
