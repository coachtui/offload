/**
 * Reinforcement via supersede-on-recapture. When a newly captured note is
 * near-identical (>= SUPERSEDE_MIN_SCORE) to an existing open note of the
 * same type, the NEW note becomes the living version — it inherits the old
 * note's mention_count + 1 and links back via evolved_from_id — and the old
 * note is archived. Repeated captures build one strong note with history
 * instead of fragments. Runs post-save (embedding already stored); never
 * throws — a reinforcement failure must not break note saving.
 */
import { findSimilar } from './vectorService';
import { AtomicObjectModel } from '../models/AtomicObject';
import { query } from '../db/queries';

export const SUPERSEDE_MIN_SCORE = 0.85;
const SUPERSEDE_ELIGIBLE_TYPES = new Set(['task', 'reminder', 'commitment', 'concern']);
const CANDIDATE_LIMIT = 5;

export function shouldSupersede(
  candidate: { id: string; objectType: string | null },
  match: { id: string; objectType: string | null; state: string; score: number }
): boolean {
  if (!candidate.objectType || !SUPERSEDE_ELIGIBLE_TYPES.has(candidate.objectType)) return false;
  if (match.score < SUPERSEDE_MIN_SCORE) return false;
  if (match.objectType !== candidate.objectType) return false;
  if (match.state !== 'open' && match.state !== 'active') return false;
  if (match.id === candidate.id) return false;
  return true;
}

export async function applySupersede(objectId: string, userId: string): Promise<void> {
  try {
    const candidate = await AtomicObjectModel.findById(objectId);
    if (!candidate || candidate.userId !== userId) return;
    if (!candidate.objectType || !SUPERSEDE_ELIGIBLE_TYPES.has(candidate.objectType)) return;

    const similar = await findSimilar(objectId, userId, CANDIDATE_LIMIT);
    const aboveThreshold = similar.filter((s) => s.score >= SUPERSEDE_MIN_SCORE);
    if (aboveThreshold.length === 0) return;

    const hydrated = await AtomicObjectModel.findByIds(aboveThreshold.map((s) => s.objectId));
    const byId = new Map(hydrated.map((m) => [m.id, m]));

    // findSimilar returns results ordered by score desc; take the best qualifier.
    for (const s of aboveThreshold) {
      const m = byId.get(s.objectId);
      if (!m || m.userId !== userId) continue;
      if (
        !shouldSupersede(
          { id: candidate.id, objectType: candidate.objectType },
          { id: m.id, objectType: m.objectType, state: m.state, score: s.score }
        )
      ) {
        continue;
      }

      // Order matters: link + inherit on the NEW note first, so a crash here
      // leaves only an un-archived old note (harmless), never a broken chain.
      await query(
        `UPDATE hub.atomic_objects
         SET evolved_from_id = $1,
             mention_count = (SELECT mention_count + 1 FROM hub.atomic_objects WHERE id = $1)
         WHERE id = $2`,
        [m.id, candidate.id]
      );
      await query(
        `UPDATE hub.atomic_objects
         SET state = 'archived', state_updated_at = NOW()
         WHERE id = $1 AND state IN ('open', 'active')`,
        [m.id]
      );
      console.log(
        `[reinforcement] note ${candidate.id} supersedes ${m.id} (score ${s.score.toFixed(2)})`
      );
      return; // one supersede per capture
    }
  } catch (err) {
    console.warn('[reinforcement] supersede pass failed (swallowed):', err);
  }
}
