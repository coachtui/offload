/**
 * Deepgram keyword vocabulary for Layer A ASR biasing.
 *
 * Format: "keyword:boost" — boost is an integer (1–5) indicating how strongly
 * Deepgram should prefer this word when the audio is ambiguous.
 *   boost 2 — local place names (commonly mis-transcribed)
 *   boost 1 — construction/field terms (less common in generic speech models)
 *
 * These are injected into the Deepgram WebSocket URL query parameters so the
 * ASR model biases toward recognizing these words during recording.
 *
 * To add a new region or project: append entries here and redeploy the backend.
 * No mobile rebuild is required — keywords are fetched at recording time.
 *
 * Multi-word keywords are supported by Deepgram (Nova-2) and will be URL-encoded
 * by the mobile client before appending to the WebSocket URL.
 */

export const DEEPGRAM_KEYWORDS: string[] = [
  // ── Hawaii / Honolulu place names ─────────────────────────────────────────
  'Puuhale:2',
  'Waiakamilo:2',
  'Dillingham:2',
  'Kamehameha:2',
  'Kalihi:2',
  'Nimitz:2',
  'Moanalua:2',
  'Likelike:2',
  'Kapalama:2',
  'Halawa:2',
  'Sand Island:2',
  'Kunia:2',
  'Middle Street:2',
  'Mapunapuna:2',
  'Iwilei:2',
  'Auld Lane:2',
  'Lagoon Drive:2',
  'Honolulu Harbor:2',

  // ── Construction / field operations vocabulary ────────────────────────────
  'drainage inlet:1',
  'manhole:1',
  'trench plate:1',
  'dewatering:1',
  'vac truck:1',
  'Godwin pump:1',
  'traffic control:1',
  'lane closure:1',
  'utility conflict:1',
  'asphalt patch:1',
  'curb and gutter:1',
  'submittal:1',
  'punch list:1',
  'turnover:1',
  'shoring:1',
  'conduit:1',
  'catch basin:1',
  'storm drain:1',
  'change order:1',
];
