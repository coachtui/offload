/**
 * Arrival-trigger detection
 *
 * Decides whether a parsed note should have its place names resolved into
 * place links / geofences. Extracted from voice.ts so the rules are testable —
 * they had been silently wrong in production with no coverage.
 *
 * The parser sets location_hints.geofence_candidate, but it keys off arrival
 * phrasing and returns FALSE for the most natural way to dictate an errand:
 *
 *   "Go to Costco to buy chicken and soda"      → true
 *   "I need chicken and soda from Costco"       → FALSE  ← same intent, dropped
 *
 * These deterministic rules are the safety net under that.
 */

// Explicit arrival phrasing. Kept as-is — this is the original net.
const ARRIVAL_PATTERNS = [
  /when\s+(?:i\s+)?(?:get|arrive|am|reach|go)\s+(?:to|at)\b/i,
  /remind(?:er)?\s+(?:me\s+)?.+\bat\b\s+\w/i,
  /at\s+(?:the\s+)?(?:costco|walmart|target|longs|safeway|home\s+depot|lowes|cvs|walgreens|sam['']?s|whole\s+foods|trader\s+joe['']?s|aldi|costco|ross|tj\s+maxx|marshalls|kohls?)\b/i,
];

// Verbs that make a note an errand — something you DO upon arriving somewhere.
// Deliberately excludes communication verbs (call, email, text): "call the
// Florida office" names a place but is not triggered by going there.
const ERRAND_VERBS =
  /\b(?:buy|purchase|grab|get|pick\s*up|pickup|drop\s*off|dropoff|order|return|collect|need|bring|take)\b/i;

export function textHasArrivalTrigger(text: string): boolean {
  return ARRIVAL_PATTERNS.some(p => p.test(text));
}

/**
 * True when the note is an errand AND names one of its places as a destination.
 *
 * Both halves matter. The verb alone sweeps in notes that merely mention place
 * names ("Need a feature to add places like homework, dad's house"); the
 * destination alone sweeps in "Cancel gym membership". Requiring the place to
 * directly follow from/at/to keeps "call the Florida office" out.
 *
 * Known limitation: an errand whose place came from surrounding context rather
 * than this sentence ("Order a McChicken value meal", place inferred as
 * McDonald's) is not matched, since the place never appears as a destination.
 */
export function isPlaceErrand(text: string, places: string[]): boolean {
  if (!places.length || !ERRAND_VERBS.test(text)) return false;

  return places.some(place => {
    const escaped = place.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return false;
    // "from Costco", "at the ammunitions project", "to Safeway"
    return new RegExp(`\\b(?:from|at|to|by)\\s+(?:the\\s+)?${escaped}\\b`, 'i').test(text);
  });
}

/**
 * Single decision point for whether to run place resolution on a note.
 * Parser flag wins; the deterministic rules only ever ADD candidates.
 */
export function shouldResolvePlaces(
  text: string,
  places: string[],
  parserFlag: boolean | undefined
): boolean {
  return Boolean(parserFlag) || textHasArrivalTrigger(text) || isPlaceErrand(text, places);
}

/**
 * Extract store names from raw text using the deterministic store pattern.
 * Used only in the ML-fallback path where the parser isn't available.
 */
export function extractPlacesFromText(text: string): string[] {
  const storePattern =
    /at\s+(?:the\s+)?(?:costco|walmart|target|longs(?:\s+drugs)?|safeway|home\s+depot|lowes|cvs|walgreens|sam['']?s(?:\s+club)?|whole\s+foods|trader\s+joe['']?s|aldi|ross|tj\s+maxx|marshalls|kohl['']?s?)\b/gi;
  const matches = Array.from(text.matchAll(storePattern));
  const places = matches
    .map(m => m[0].replace(/^at\s+(?:the\s+)?/i, '').trim())
    .filter(Boolean);
  return [...new Set(places)]; // dedupe
}
