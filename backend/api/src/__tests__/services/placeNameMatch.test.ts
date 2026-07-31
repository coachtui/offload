import { matchPlaceName, tokenize } from '../../services/placeNameMatch';

const label = (name: string) => ({ name });
const labels = (...names: string[]) => names.map(label);
const match = (phrase: string, ...names: string[]) =>
  matchPlaceName(phrase, labels(...names), c => c.name);

describe('tokenize', () => {
  it('drops filler and possessives, keeps Hawaiian diacritics', () => {
    expect(tokenize('the ammunitions project')).toEqual(['ammunitions']);
    expect(tokenize("Trader Joe's")).toEqual(['trader', 'joe']);
    expect(tokenize('Puʻuhale')).toEqual(['puʻuhale']);
    expect(tokenize('Kapālama')).toEqual(['kapālama']);
  });
});

describe('matchPlaceName', () => {
  it('matches exactly as before (regression guard)', () => {
    expect(match('ammunitions', 'Ammunitions')).toMatchObject({ reason: 'exact' });
    expect(match('home', 'Home')).toMatchObject({ reason: 'exact' });
  });

  // The production bug: "the ammunitions project" never matched "Ammunitions",
  // so the note fell through to Nominatim, resolved to nothing, and was dropped.
  it('matches a spoken phrase that reduces to the label', () => {
    expect(match('ammunitions project', 'Ammunitions')).toMatchObject({
      reason: 'reduced_exact',
    });
    expect(match('the ammunitions project', 'Ammunitions')).toMatchObject({
      reason: 'reduced_exact',
    });
    expect(match('the gym', 'Gym')).toMatchObject({ reason: 'reduced_exact' });
  });

  it('matches a distinctive label inside a longer phrase', () => {
    expect(match('ammunitions road work', 'Ammunitions')).toMatchObject({
      reason: 'distinctive_subset',
    });
    expect(match('sand island yard', 'Sand Island')).toMatchObject({
      reason: 'distinctive_subset',
    });
  });

  // The guardrail that makes loosening safe at all.
  it('does NOT match a generic label inside a longer phrase', () => {
    expect(match('home depot', 'Home')).toBeNull();
    expect(match('the home depot', 'Home')).toBeNull();
    expect(match('work truck', 'Work')).toBeNull();
    expect(match('school supplies store', 'School')).toBeNull();
  });

  it('returns null when nothing relates', () => {
    expect(match('costco', 'Ammunitions', 'Home')).toBeNull();
    expect(match('', 'Home')).toBeNull();
  });

  it('prefers the more specific label when several match', () => {
    const best = match('ammunitions yard road work', 'Ammunitions', 'Ammunitions Yard');
    expect(best?.candidate.name).toBe('Ammunitions Yard');
  });

  it('prefers an exact match over a looser one', () => {
    const best = match('ammunitions', 'Ammunitions Yard', 'Ammunitions');
    expect(best?.candidate.name).toBe('Ammunitions');
    expect(best?.reason).toBe('exact');
  });

  it('ignores blank labels', () => {
    expect(match('ammunitions project', '')).toBeNull();
  });
});
