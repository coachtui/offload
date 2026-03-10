"""
Layer B: Transcript cleanup and local name correction.

Performs two passes:
  1. Exact alias matching — replaces known alternate/misheard forms of place names
     and construction terms with their canonical spellings.
  2. Fuzzy single-word matching — catches phonetic variants above a confidence
     threshold to handle ASR substitutions (e.g. "pooholly" → "Puʻuhale").

Corrections are logged for audit and returned alongside the cleaned transcript
so downstream stages can include them as context.
"""

import json
import logging
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Tuple

logger = logging.getLogger(__name__)

VOCAB_PATH = Path(__file__).parent.parent / "data" / "vocabulary.json"

# Minimum word length to attempt fuzzy matching (avoids false positives on short tokens)
FUZZY_MIN_LEN = 6
# Minimum similarity ratio to accept a fuzzy correction
FUZZY_THRESHOLD = 0.88


class Correction(NamedTuple):
    original: str
    corrected: str
    matched_entry: str
    confidence: float
    reason: str  # "exact_alias" | "fuzzy_match(0.91)"


class TranscriptCleaner:
    """
    Corrects local proper nouns and domain-specific terms in raw ASR transcripts.

    Loaded once at module level via get_cleaner(); safe to call from multiple
    async request handlers.
    """

    def __init__(self, vocab_path: Path = VOCAB_PATH) -> None:
        try:
            with open(vocab_path, encoding="utf-8") as f:
                vocab = json.load(f)
        except FileNotFoundError:
            logger.warning("[TranscriptCleaner] vocabulary.json not found at %s — cleaner disabled", vocab_path)
            vocab = {"places": [], "construction_terms": []}
        except json.JSONDecodeError as exc:
            logger.error("[TranscriptCleaner] vocabulary.json is invalid JSON: %s", exc)
            vocab = {"places": [], "construction_terms": []}

        # Build two lookup structures:
        #   multi_word_aliases: sorted by token-count desc for greedy matching
        #   single_word_aliases: for exact + fuzzy single-token matching
        self._multi_word_aliases: List[Tuple[str, str]] = []   # (normalized_phrase, canonical)
        self._single_word_aliases: Dict[str, str] = {}          # normalized_token -> canonical

        for entry in vocab.get("places", []) + vocab.get("construction_terms", []):
            canonical = entry["canonical"]
            for alias in entry.get("aliases", []):
                norm = self._normalize(alias)
                tokens = norm.split()
                if len(tokens) == 1:
                    self._single_word_aliases[norm] = canonical
                else:
                    self._multi_word_aliases.append((norm, canonical))

        # Sort multi-word aliases longest-first so we always prefer the longest match
        self._multi_word_aliases.sort(key=lambda x: len(x[0].split()), reverse=True)

        # Derive Deepgram keyword strings — used by the API layer for Layer A biasing
        self._deepgram_keywords: List[str] = []
        seen: set = set()
        for place in vocab.get("places", []):
            kw = place.get("asr_keyword", "")
            boost = place.get("keyword_boost", 2)
            if kw and kw not in seen:
                self._deepgram_keywords.append(f"{kw}:{boost}")
                seen.add(kw)
        for term in vocab.get("construction_terms", []):
            canonical = term["canonical"]
            boost = term.get("keyword_boost", 1)
            if canonical not in seen:
                self._deepgram_keywords.append(f"{canonical}:{boost}")
                seen.add(canonical)

        logger.info(
            "[TranscriptCleaner] loaded %d single-word aliases, %d multi-word aliases, %d deepgram keywords",
            len(self._single_word_aliases),
            len(self._multi_word_aliases),
            len(self._deepgram_keywords),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def clean(self, transcript: str) -> Tuple[str, List[Correction]]:
        """
        Return (cleaned_transcript, corrections).

        cleaned_transcript — whitespace-normalized with known local terms corrected.
        corrections — list of Correction named-tuples for audit/logging.
        """
        if not transcript or not transcript.strip():
            return transcript, []

        # Step 1: collapse whitespace
        text = re.sub(r"\s+", " ", transcript).strip()

        # Step 2: multi-word exact phrase replacement
        text, corrections = self._apply_multi_word(text)

        # Step 3: single-word exact + fuzzy replacement on remaining tokens
        text, single_corrections = self._apply_single_word(text)
        corrections.extend(single_corrections)

        if corrections:
            for c in corrections:
                logger.info(
                    "[TranscriptCleaner] '%s' → '%s' (entry: %s, confidence: %.2f, reason: %s)",
                    c.original, c.corrected, c.matched_entry, c.confidence, c.reason,
                )

        return text, corrections

    @property
    def deepgram_keywords(self) -> List[str]:
        """Return list of 'keyword:boost' strings for Deepgram URL param injection."""
        return list(self._deepgram_keywords)

    # ------------------------------------------------------------------
    # Internal passes
    # ------------------------------------------------------------------

    def _apply_multi_word(self, text: str) -> Tuple[str, List[Correction]]:
        """
        Scan text for multi-word alias phrases and replace with canonical form.
        Processes from longest alias to shortest to prefer maximal matches.
        """
        corrections: List[Correction] = []

        for norm_phrase, canonical in self._multi_word_aliases:
            # Build a case-insensitive regex that matches the alias as a word-boundary phrase
            # We replace the normalized form (no special chars) against a normalized copy of text
            pattern = self._phrase_to_pattern(norm_phrase)
            norm_text = self._normalize(text)

            for m in re.finditer(pattern, norm_text):
                original_slice = text[m.start():m.end()]
                if self._normalize(original_slice) == norm_phrase:
                    text = text[:m.start()] + canonical + text[m.end():]
                    corrections.append(Correction(
                        original=original_slice,
                        corrected=canonical,
                        matched_entry=canonical,
                        confidence=1.0,
                        reason="exact_alias",
                    ))
                    # Re-normalize after replacement and restart to avoid index drift
                    break

        return text, corrections

    def _apply_single_word(self, text: str) -> Tuple[str, List[Correction]]:
        """
        Token-by-token exact and fuzzy matching for single-word aliases.
        """
        corrections: List[Correction] = []
        tokens = text.split()
        result: List[str] = []

        for token in tokens:
            norm = self._normalize(token)

            # Exact single-word match
            if norm in self._single_word_aliases:
                canonical = self._single_word_aliases[norm]
                if canonical != token:  # only log if actually changed
                    corrections.append(Correction(
                        original=token,
                        corrected=canonical,
                        matched_entry=canonical,
                        confidence=1.0,
                        reason="exact_alias",
                    ))
                result.append(canonical)
                continue

            # Fuzzy match — only for tokens long enough to be meaningful
            if len(norm) >= FUZZY_MIN_LEN:
                best_key, best_score = self._best_fuzzy_match(norm)
                if best_key and best_score >= FUZZY_THRESHOLD:
                    canonical = self._single_word_aliases[best_key]
                    corrections.append(Correction(
                        original=token,
                        corrected=canonical,
                        matched_entry=canonical,
                        confidence=best_score,
                        reason=f"fuzzy_match({best_score:.2f})",
                    ))
                    result.append(canonical)
                    continue

            result.append(token)

        return " ".join(result), corrections

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize(text: str) -> str:
        """
        Lowercase, strip okina/apostrophes and non-alphanumeric chars,
        collapse whitespace. Used for alias key comparison only — not
        applied to output text.
        """
        text = text.lower()
        text = text.replace("ʻ", "").replace("'", "").replace("'", "")
        text = re.sub(r"[^a-z0-9\s]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def _phrase_to_pattern(normalized_phrase: str) -> str:
        """Build a word-boundary regex pattern from a normalized phrase."""
        escaped = re.escape(normalized_phrase)
        return r"(?<!\w)" + escaped + r"(?!\w)"

    def _best_fuzzy_match(self, norm_token: str) -> Tuple[Optional[str], float]:
        """
        Find the closest single-word alias entry by SequenceMatcher ratio.
        Only considers aliases within ±3 characters of the token length.
        """
        best_key: Optional[str] = None
        best_score: float = 0.0

        for alias in self._single_word_aliases:
            if abs(len(alias) - len(norm_token)) > 3:
                continue
            score = SequenceMatcher(None, norm_token, alias).ratio()
            if score > best_score:
                best_score = score
                best_key = alias

        return best_key, best_score


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_cleaner_instance: Optional[TranscriptCleaner] = None


def get_cleaner() -> TranscriptCleaner:
    """Return the module-level TranscriptCleaner singleton (lazy-initialized)."""
    global _cleaner_instance
    if _cleaner_instance is None:
        _cleaner_instance = TranscriptCleaner()
    return _cleaner_instance
