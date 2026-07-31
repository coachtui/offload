/**
 * Place-name matching
 *
 * The parser emits place phrases as spoken ("the ammunitions project", "the gym"),
 * while the user's geofences carry short labels ("Ammunitions", "Gym"). Exact
 * equality misses that gap: a note saying "the ammunitions project" never matched
 * the "Ammunitions" geofence, fell through to Nominatim, found nothing (a jobsite
 * isn't in OpenStreetMap) and was silently dropped.
 *
 * Naive substring matching is not safe either — "home depot" contains "home" and
 * would fire the user's Home geofence on a hardware-store errand. So generic
 * labels require the phrase to reduce to exactly the label, while distinctive
 * labels may appear as a subset of a longer phrase.
 */

// Filler that carries no place identity. Stripped from both sides before compare,
// so "the ammunitions project" reduces to "ammunitions".
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'his', 'her', 'their',
  'at', 'to', 'in', 'on', 'of', 'from', 'by',
  'project', 'jobsite', 'job', 'site', 'place', 'location', 'area',
]);

// Labels common enough that appearing inside a longer phrase is more likely a
// different place than the user's ("home" in "home depot", "work" in "work truck").
// These match ONLY when the phrase reduces to exactly the label.
const GENERIC_LABELS = new Set([
  'home', 'house', 'work', 'office', 'school', 'gym', 'shop', 'store',
  'church', 'yard', 'baseyard', 'shed', 'garage', 'town',
]);

/** Lowercase, strip punctuation/possessives, split, drop stopwords. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, '') // "joe's" → "joe"
    .replace(/[^a-z0-9Ā-ſʻ\s]/g, ' ') // keep ʻokina + diacritics (Puʻuhale, Kapālama)
    .split(/\s+/)
    .filter(t => t.length > 0 && !STOPWORDS.has(t));
}

export interface NameMatch<T> {
  candidate: T;
  /** How many label tokens were matched — higher is a more specific match. */
  score: number;
  reason: 'exact' | 'reduced_exact' | 'distinctive_subset';
}

/**
 * Pick the best label match for a spoken place phrase.
 *
 * Match rules, in order of preference:
 *  1. `exact`               — raw case-insensitive equality ("Costco" / "costco")
 *  2. `reduced_exact`       — equal after stopword removal ("the gym" → "Gym",
 *                             "the ammunitions project" → "Ammunitions")
 *  3. `distinctive_subset`  — every label token appears in the phrase AND no label
 *                             token is generic ("ammunitions road work" → "Ammunitions",
 *                             but "home depot" does NOT match "Home")
 *
 * Ties break toward the more specific label (more tokens), then the caller's
 * existing ordering (callers pass geofences newest-first).
 */
export function matchPlaceName<T>(
  phrase: string,
  candidates: T[],
  getLabel: (c: T) => string
): NameMatch<T> | null {
  const phraseRaw = phrase.trim().toLowerCase();
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0 && !phraseRaw) return null;
  const phraseSet = new Set(phraseTokens);

  let best: NameMatch<T> | null = null;

  for (const candidate of candidates) {
    const label = getLabel(candidate);
    if (!label) continue;

    const labelRaw = label.trim().toLowerCase();
    const labelTokens = tokenize(label);
    if (labelTokens.length === 0) continue;

    let reason: NameMatch<T>['reason'] | null = null;

    if (labelRaw === phraseRaw) {
      reason = 'exact';
    } else if (
      labelTokens.length === phraseTokens.length &&
      labelTokens.every(t => phraseSet.has(t))
    ) {
      reason = 'reduced_exact';
    } else if (
      labelTokens.every(t => phraseSet.has(t)) &&
      !labelTokens.every(t => GENERIC_LABELS.has(t))
    ) {
      // Distinctive label fully present inside a longer phrase. A label counts as
      // distinctive when it is not made up *entirely* of generic words: "Home" is
      // rejected ("home depot"), but "Ammunitions Yard" is fine — the distinctive
      // token carries the identity even though "yard" alone would not.
      reason = 'distinctive_subset';
    }

    if (!reason) continue;

    const rank = { exact: 3, reduced_exact: 2, distinctive_subset: 1 } as const;
    const score = labelTokens.length;

    if (
      !best ||
      rank[reason] > rank[best.reason] ||
      (rank[reason] === rank[best.reason] && score > best.score)
    ) {
      best = { candidate, score, reason };
    }
  }

  return best;
}
