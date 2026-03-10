"""
Tests for transcript_cleaner — Layer B local name correction and vocabulary matching.

Validates:
  1. Hawaiian / local street names are corrected
  2. Construction / field vocabulary is corrected
  3. Mixed local + construction speech works end-to-end
  4. Ambiguous phrases are NOT over-corrected
  5. Clean transcripts are returned unchanged (no spurious corrections)
  6. Deepgram keyword list is populated
"""

import pytest
from pathlib import Path
import sys

# Ensure the app package is importable when running from the tests/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.transcript_cleaner import TranscriptCleaner, VOCAB_PATH


@pytest.fixture(scope="module")
def cleaner():
    return TranscriptCleaner(VOCAB_PATH)


# ---------------------------------------------------------------------------
# 1. Hawaiian / local place names
# ---------------------------------------------------------------------------

class TestLocalPlaceNames:

    def test_puuhale_exact_alias(self, cleaner):
        text, corrections = cleaner.clean("We need to work on Puuhale today.")
        assert "Puʻuhale" in text
        assert any(c.matched_entry == "Puʻuhale" for c in corrections)

    def test_puuhale_split_form(self, cleaner):
        text, corrections = cleaner.clean("work on pu uhale road")
        assert "Puʻuhale" in text

    def test_waiakamilo_split_form(self, cleaner):
        text, corrections = cleaner.clean("traffic control by dillingham and why a kamilo")
        assert "Waiakamilo" in text
        assert "Dillingham" in text

    def test_waikamilo_alias(self, cleaner):
        text, corrections = cleaner.clean("check the drainage on waikamilo road")
        assert "Waiakamilo" in text

    def test_dillingham_split(self, cleaner):
        text, corrections = cleaner.clean("set up by dilling ham boulevard")
        assert "Dillingham" in text

    def test_middle_street_preserved(self, cleaner):
        # Already correct — no spurious correction, output unchanged
        text, corrections = cleaner.clean("Clear drains on Middle Street today.")
        assert "Middle Street" in text

    def test_kapalama_no_macron(self, cleaner):
        # ASR strips macrons — "Kapalama" should normalize to canonical "Kapālama"
        text, corrections = cleaner.clean("punch list walk at Kapalama Friday")
        assert "Kapālama" in text

    def test_sand_island_phrase(self, cleaner):
        text, corrections = cleaner.clean("vac truck is at sand island access road")
        assert "Sand Island" in text

    def test_honolulu_harbor(self, cleaner):
        text, corrections = cleaner.clean("deliver materials to honolulu harbor by noon")
        assert "Honolulu Harbor" in text

    def test_multiple_places_one_transcript(self, cleaner):
        text, corrections = cleaner.clean(
            "Set up crew from middle street to puuhale. "
            "Need traffic control near dillingham and waikamilo."
        )
        assert "Middle Street" in text
        assert "Puʻuhale" in text
        assert "Dillingham" in text
        assert "Waiakamilo" in text

    def test_kalihi_side(self, cleaner):
        text, corrections = cleaner.clean("check manhole by kalihi side")
        assert "Kalihi" in text


# ---------------------------------------------------------------------------
# 2. Construction / field vocabulary
# ---------------------------------------------------------------------------

class TestConstructionVocabulary:

    def test_drainage_inlet_singular(self, cleaner):
        text, corrections = cleaner.clean("need to clear the draining let on the corner")
        assert "drainage inlet" in text

    def test_drainage_inlet_plural_alias(self, cleaner):
        text, corrections = cleaner.clean("clear all draining lets on middle street")
        assert "drainage inlet" in text

    def test_trench_plate_alias(self, cleaner):
        text, corrections = cleaner.clean("put down french plates over the excavation")
        assert "trench plate" in text

    def test_vac_truck_misspelled(self, cleaner):
        text, corrections = cleaner.clean("bring the vack truck for dewatering")
        assert "vac truck" in text
        assert "dewatering" in text

    def test_punch_list(self, cleaner):
        text, corrections = cleaner.clean("punchlist walk is scheduled for friday")
        assert "punch list" in text

    def test_turnover_split(self, cleaner):
        text, corrections = cleaner.clean("submit the turn over package by end of week")
        assert "turnover" in text

    def test_submittal_misspelled(self, cleaner):
        text, corrections = cleaner.clean("send the submittle to the engineer")
        assert "submittal" in text

    def test_dewatering_already_correct(self, cleaner):
        text, corrections = cleaner.clean("start dewatering at 6am")
        assert "dewatering" in text
        # Should not create a spurious correction if already correct
        dew_corrections = [c for c in corrections if "dewatering" in c.corrected.lower()]
        assert len(dew_corrections) == 0  # no correction needed


# ---------------------------------------------------------------------------
# 3. Mixed local + construction speech
# ---------------------------------------------------------------------------

class TestMixedSpeech:

    def test_jobsite_task(self, cleaner):
        text, corrections = cleaner.clean(
            "Set up crew to clear draining lets from middle street to puuhale today"
        )
        assert "drainage inlet" in text
        assert "Middle Street" in text
        assert "Puʻuhale" in text

    def test_equipment_and_place(self, cleaner):
        text, corrections = cleaner.clean(
            "Bring vac truck and dewatering pump to sand island for the morning shift"
        )
        assert "vac truck" in text
        assert "dewatering" in text
        assert "Sand Island" in text

    def test_traffic_control_at_intersection(self, cleaner):
        text, corrections = cleaner.clean(
            "Need traffic control by dillingham and why a kamilo"
        )
        assert "traffic control" in text
        assert "Dillingham" in text
        assert "Waiakamilo" in text

    def test_punch_list_at_place(self, cleaner):
        text, corrections = cleaner.clean(
            "Reminder for punch list walk at kapalama that's friday"
        )
        assert "punch list" in text
        assert "Kapālama" in text

    def test_manhole_at_local_street(self, cleaner):
        text, corrections = cleaner.clean("check man hole by kalihi side near the nimitz")
        assert "manhole" in text
        assert "Kalihi" in text
        assert "Nimitz" in text


# ---------------------------------------------------------------------------
# 4. No over-correction of ambiguous/ordinary phrases
# ---------------------------------------------------------------------------

class TestNoOverCorrection:

    def test_ordinary_words_unchanged(self, cleaner):
        text, corrections = cleaner.clean("We had lunch and discussed the plan.")
        assert text == "We had lunch and discussed the plan."
        assert len(corrections) == 0

    def test_short_common_words_not_fuzzy_matched(self, cleaner):
        # "sand" alone should NOT become "Sand Island"
        text, corrections = cleaner.clean("put sand in the bucket")
        assert "Sand Island" not in text

    def test_middle_alone_not_corrected(self, cleaner):
        # "middle" alone without "street" should NOT become "Middle Street"
        text, corrections = cleaner.clean("meet in the middle of the road")
        middle_corrections = [c for c in corrections if "Middle Street" in c.corrected]
        assert len(middle_corrections) == 0

    def test_empty_transcript(self, cleaner):
        text, corrections = cleaner.clean("")
        assert text == ""
        assert corrections == []

    def test_whitespace_only(self, cleaner):
        text, corrections = cleaner.clean("   ")
        assert corrections == []

    def test_unrelated_content_unchanged(self, cleaner):
        text, corrections = cleaner.clean("Buy milk and eggs tomorrow morning.")
        assert text == "Buy milk and eggs tomorrow morning."
        assert len(corrections) == 0


# ---------------------------------------------------------------------------
# 5. Whitespace normalization
# ---------------------------------------------------------------------------

class TestWhitespaceNormalization:

    def test_extra_spaces_collapsed(self, cleaner):
        text, _ = cleaner.clean("check  the  drainage   inlet")
        assert "  " not in text

    def test_leading_trailing_stripped(self, cleaner):
        text, _ = cleaner.clean("  drainage inlet check  ")
        assert text == text.strip()


# ---------------------------------------------------------------------------
# 6. Deepgram keywords populated
# ---------------------------------------------------------------------------

class TestDeepgramKeywords:

    def test_keywords_list_nonempty(self, cleaner):
        kws = cleaner.deepgram_keywords
        assert len(kws) > 10

    def test_keywords_format(self, cleaner):
        for kw in cleaner.deepgram_keywords:
            assert ":" in kw, f"Keyword '{kw}' missing boost suffix"
            parts = kw.rsplit(":", 1)
            assert len(parts) == 2
            assert parts[1].isdigit(), f"Boost is not an integer in '{kw}'"

    def test_place_keywords_present(self, cleaner):
        kws = " ".join(cleaner.deepgram_keywords)
        assert "Puuhale" in kws
        assert "Waiakamilo" in kws
        assert "Kapalama" in kws
        assert "Dillingham" in kws

    def test_construction_keywords_present(self, cleaner):
        kws = " ".join(cleaner.deepgram_keywords)
        assert "dewatering" in kws
        assert "submittal" in kws


# ---------------------------------------------------------------------------
# 7. Before/after transcript quality examples (end-to-end illustration)
# ---------------------------------------------------------------------------

class TestBeforeAfterExamples:
    """
    Documents expected transformations for known difficult utterances.
    These are the key before/after pairs from the product spec.
    """

    CASES = [
        (
            "Set up crew to clear draining lets middle street to puuhale today",
            {"drainage inlet", "Middle Street", "Puʻuhale"},
        ),
        (
            "Need traffic control by dillingham and waikamilo",
            {"traffic control", "Dillingham", "Waiakamilo"},
        ),
        (
            "Check man hole by kalihi side",
            {"manhole", "Kalihi"},
        ),
        (
            "Bring vac truck for dewatering at sand island",
            {"vac truck", "dewatering", "Sand Island"},
        ),
        (
            "Reminder for punchlist walk at kapalama",
            {"punch list", "Kapālama"},
        ),
        (
            "Need to unblock draining let on middle street",
            {"drainage inlet", "Middle Street"},
        ),
    ]

    @pytest.mark.parametrize("input_text,expected_terms", CASES)
    def test_key_terms_present(self, cleaner, input_text, expected_terms):
        text, corrections = cleaner.clean(input_text)
        for term in expected_terms:
            assert term in text, (
                f"Expected '{term}' in cleaned output.\n"
                f"  Input:  {input_text!r}\n"
                f"  Output: {text!r}\n"
                f"  Corrections: {corrections}"
            )
