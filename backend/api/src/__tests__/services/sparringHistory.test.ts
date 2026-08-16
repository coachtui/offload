/**
 * sanitizeTurns — the guard between stored threads and the LLM APIs.
 *
 * Both Anthropic and OpenAI reject a message list that starts on assistant or
 * has consecutive same-role turns, and the history we replay comes out of a
 * database that can genuinely contain both. Two real cases:
 *
 *   - runTurn persists the user's question BEFORE calling the LLM, so that a
 *     timeout doesn't swallow what they typed. A thread whose last turn died
 *     that way ends on a dangling user message; the next turn appends another
 *     user message right behind it.
 *   - 'delta' reports are filtered out of history, and a thread reopened after
 *     time away can have one as its earliest replayable neighbour, leaving an
 *     assistant turn in first position.
 *
 * Neither is exotic, and both turn into a hard 400 from the provider — an
 * error the user sees as "Ask Offload is broken", with nothing in the thread
 * explaining why. Hence pinning the shape here rather than trusting the
 * write path to stay balanced.
 */

import { sanitizeTurns, type ChatTurn } from '../../services/sparringService';

const u = (content: string): ChatTurn => ({ role: 'user', content });
const a = (content: string): ChatTurn => ({ role: 'assistant', content });

describe('sanitizeTurns', () => {
  it('leaves a well-formed alternating thread untouched', () => {
    const turns = [u('one'), a('two'), u('three')];
    expect(sanitizeTurns(turns)).toEqual(turns);
  });

  it('drops a leading assistant turn', () => {
    expect(sanitizeTurns([a('orphan'), u('one'), a('two'), u('three')])).toEqual([
      u('one'),
      a('two'),
      u('three'),
    ]);
  });

  it('drops a trailing assistant turn so the sequence ends on the user', () => {
    expect(sanitizeTurns([u('one'), a('two')])).toEqual([u('one')]);
  });

  it('collapses consecutive user turns from an interrupted request', () => {
    expect(sanitizeTurns([u('first ask'), u('asking again')])).toEqual([
      u('first ask\n\nasking again'),
    ]);
  });

  it('collapses consecutive assistant turns', () => {
    expect(sanitizeTurns([u('q'), a('part one'), a('part two'), u('follow up')])).toEqual([
      u('q'),
      a('part one\n\npart two'),
      u('follow up'),
    ]);
  });

  it('drops empty and whitespace-only turns without breaking alternation', () => {
    expect(sanitizeTurns([u('q'), a('   '), u('still asking')])).toEqual([
      u('q\n\nstill asking'),
    ]);
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeTurns([u('  padded  ')])).toEqual([u('padded')]);
  });

  it('returns empty for a thread with nothing replayable', () => {
    expect(sanitizeTurns([])).toEqual([]);
    expect(sanitizeTurns([a('only an answer')])).toEqual([]);
  });

  it('never returns a sequence that would be rejected by a provider', () => {
    // Property check over the messy shapes a stored thread can take.
    const messy: ChatTurn[][] = [
      [a('x'), a('y'), u('z'), u('w'), a('v')],
      [u(''), a(''), u('real')],
      [a('a'), a('b')],
      [u('a'), a('b'), a('c'), u('d'), u('e')],
    ];

    for (const turns of messy) {
      const out = sanitizeTurns(turns);
      if (out.length === 0) continue;
      expect(out[0].role).toBe('user');
      expect(out[out.length - 1].role).toBe('user');
      for (let i = 1; i < out.length; i++) {
        expect(out[i].role).not.toBe(out[i - 1].role);
      }
      expect(out.every((t) => t.content.trim().length > 0)).toBe(true);
    }
  });

  it('does not mutate the caller\'s array', () => {
    const turns = [u('one'), u('two')];
    const snapshot = JSON.parse(JSON.stringify(turns));
    sanitizeTurns(turns);
    expect(turns).toEqual(snapshot);
  });
});
