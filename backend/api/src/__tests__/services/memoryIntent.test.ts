import { retentionPolicyFor, triggerContextFor } from '../../services/memoryIntent';

describe('retentionPolicyFor', () => {
  it.each([
    ['task', 'until_done'], ['reminder', 'until_done'], ['commitment', 'until_done'],
    ['preference', 'long_term'], ['decision', 'long_term'],
    ['concern', 'decay'], ['journal', 'decay'], ['observation', 'decay'],
    ['idea', 'temporary'], ['question', 'temporary'], ['reference', 'temporary'],
  ])('%s -> %s', (type, expected) => {
    expect(retentionPolicyFor(type)).toBe(expected);
  });
  it('null/unknown -> temporary', () => {
    expect(retentionPolicyFor(null)).toBe('temporary');
    expect(retentionPolicyFor('weird')).toBe('temporary');
  });
});

describe('triggerContextFor', () => {
  it('non-empty places -> place', () => {
    expect(triggerContextFor({ places: ['Costco'] })).toBe('place');
  });
  it('geofenceCandidate -> place', () => {
    expect(triggerContextFor({ geofenceCandidate: true })).toBe('place');
  });
  it('hasDate (no place) -> time', () => {
    expect(triggerContextFor({ hasDate: true })).toBe('time');
  });
  it('place wins over time', () => {
    expect(triggerContextFor({ places: ['Costco'], hasDate: true })).toBe('place');
  });
  it('nothing -> none', () => {
    expect(triggerContextFor({})).toBe('none');
    expect(triggerContextFor({ places: [], geofenceCandidate: false, hasDate: false })).toBe('none');
  });
});
