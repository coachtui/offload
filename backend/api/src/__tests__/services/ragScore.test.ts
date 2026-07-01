import { applyMinScore } from '../../services/ragScore';

const rows = [{ score: 0.9 }, { score: 0.61 }, { score: 0.6 }, { score: 0.59 }, { score: 0.4 }];

describe('applyMinScore', () => {
  it('defaults to 0.4 (keeps >= 0.4)', () => {
    expect(applyMinScore(rows).map(r => r.score)).toEqual([0.9, 0.61, 0.6, 0.59, 0.4]);
  });
  it('excludes rows below an explicit minScore', () => {
    expect(applyMinScore(rows, 0.6).map(r => r.score)).toEqual([0.9, 0.61, 0.6]);
  });
  it('minScore=0 keeps everything', () => {
    expect(applyMinScore(rows, 0)).toHaveLength(5);
  });
});
