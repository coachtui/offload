"""
Tests for the transcript parser contract — enforced via the few-shot examples.

The few-shot example OUTPUTS are the spec-by-example for the parser. These tests
assert the meaningful-notes invariants directly on those examples:
  1. Every object has a non-empty title.
  2. Every example output validates against the AtomicObjectParsed schema.
  3. Junk/filler is dropped (Task 2).
  4. Rambly fragments consolidate; place names + shorthand preserved (Task 3).
"""

import json
import os
import asyncio
from pathlib import Path
import sys

import pytest

# Ensure the app package is importable when running from the tests/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.transcript import AtomicObjectParsed, TranscriptParseRequest
from app.prompts import transcript_parser as tp


def _load(output_str):
    """Parse a few-shot OUTPUT string into a list of AtomicObjectParsed."""
    data = json.loads(output_str)
    return [AtomicObjectParsed(**obj) for obj in data["atomic_objects"]]


# All few-shot example OUTPUT constants currently defined on the module.
def _example_output_strings():
    names = [n for n in dir(tp) if n.startswith("EXAMPLE_") and n.endswith("_OUTPUT")]
    return [getattr(tp, n) for n in sorted(names)]


def iter_example_objects():
    for out in _example_output_strings():
        for obj in _load(out):
            yield obj


def test_every_example_object_has_non_empty_title():
    objs = list(iter_example_objects())
    assert objs, "expected at least one example object"
    missing = [o.cleaned_text for o in objs if not (o.title and o.title.strip())]
    assert not missing, f"objects missing a title: {missing}"


def test_every_example_output_validates():
    # _load raises pydantic ValidationError if any example is malformed
    objs = list(iter_example_objects())
    assert len(objs) >= 3


def test_junk_example_drops_filler():
    objs = _load(tp.EXAMPLE_5_OUTPUT)
    # Exactly one real item survives in the junk example.
    assert len(objs) == 1, f"expected 1 surviving note, got {len(objs)}"
    surviving = objs[0]
    # The surviving note is the real reminder content, not filler.
    text = (surviving.cleaned_text or "").strip().lower()
    assert "inspector" in text and "permit" in text, text
    assert surviving.title and surviving.title.strip()


def test_few_shot_examples_include_junk_and_consolidation():
    # The junk-drop (EXAMPLE_5) and consolidation (EXAMPLE_4) demonstrations must
    # actually be wired into the prompt sent to the LLM — not merely defined as
    # constants. Verify by content, so an un-wired example fails loudly.
    blob = " ".join(m["content"] for m in tp.create_few_shot_examples())
    assert tp.EXAMPLE_4_INPUT in blob, "consolidation example not wired into prompt"
    assert tp.EXAMPLE_5_INPUT in blob, "junk-drop example not wired into prompt"


def test_consolidation_example_is_single_note():
    # A rambly, fragmented thought about ONE topic becomes ONE note.
    objs = _load(tp.EXAMPLE_4_OUTPUT)
    assert len(objs) == 1, f"expected rambly fragments to consolidate, got {len(objs)}"
    note = objs[0]
    # cleaned_text is rephrased (not a verbatim copy of the rambly raw_text).
    assert note.cleaned_text.strip() != note.raw_text.strip()
    # cleaned_text reads clean: no stray filler tokens.
    lowered = note.cleaned_text.lower()
    for f in ("um", "uh", "like", "yeah", "kinda"):
        assert f" {f} " not in f" {lowered} ", f"filler '{f}' leaked into cleaned_text"
    assert note.title and note.title.strip()


def test_segmentation_example_note_counts():
    # Pin the note count of each segmentation example so a regression that
    # collapses or shatters an example is caught (the aggregate validate test
    # cannot detect a single example merging/splitting).
    assert len(_load(tp.EXAMPLE_1_OUTPUT)) == 3   # distinct topics stay separate
    assert len(_load(tp.EXAMPLE_2_OUTPUT)) == 4   # distinct jobsite actions
    assert len(_load(tp.EXAMPLE_3_OUTPUT)) == 2
    assert len(_load(tp.EXAMPLE_4_OUTPUT)) == 1   # rambly single thread consolidates
    assert len(_load(tp.EXAMPLE_5_OUTPUT)) == 1   # junk dropped, one survivor


def test_place_names_preserved_in_cleaned_text():
    # Jobsite example must keep local place names verbatim in cleaned_text.
    objs = _load(tp.EXAMPLE_2_OUTPUT)
    joined = " ".join(o.cleaned_text for o in objs)
    for place in ("Puʻuhale", "Middle Street", "Sand Island", "Kapālama"):
        assert place in joined, f"place name '{place}' was lost from cleaned_text"


def test_location_reminder_example_is_geofence_reminder():
    # Binding constraint: location reminders ("...when I get to X") must stay a
    # reminder with a geofence trigger. EXAMPLE_3 is the Costco location reminder;
    # pin its first object so a prompt/example regression on the place-reminders
    # feature fails deterministically (the live integration check skips without a key).
    objs = _load(tp.EXAMPLE_3_OUTPUT)
    reminder = objs[0]
    assert reminder.type == "reminder", reminder.type
    assert reminder.location_hints.geofence_candidate is True
    assert "Costco" in reminder.location_hints.places


def test_full_few_shot_set_has_five_examples():
    msgs = tp.create_few_shot_examples()
    assert len(msgs) == 10, f"expected 5 example pairs (10 messages), got {len(msgs)}"


# ---------------------------------------------------------------------------
# Gated integration test — auto-skips without a live LLM API key
# ---------------------------------------------------------------------------

_MESSY = (
    "Um okay so. Yeah. I need to call the pump supplier tomorrow, their quote at "
    "Puʻuhale was way too high. Anyway. Set up traffic control on Middle Street too. "
    "Let me think. That's about it I guess. Oh and remind me to grab coffee filters "
    "when I get to Costco."
)


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")),
    reason="requires a live LLM API key",
)
def test_live_parse_is_meaningful():
    from app.services.parser import get_parser

    req = TranscriptParseRequest(
        transcript=_MESSY, user_id="test-user", session_id="test-session"
    )
    objs, _model, _t, _raw = asyncio.run(get_parser().parse_transcript(req))

    # Every note has a real title (the headline fix).
    assert all(o.title and o.title.strip() for o in objs), \
        [o.cleaned_text for o in objs]
    # Junk dropped: no note is pure filler.
    for o in objs:
        assert o.cleaned_text.strip().lower() not in {"anyway", "yeah", "okay", "that's about it"}
    # Place name preserved somewhere.
    assert any("Puʻuhale" in o.cleaned_text or "Middle Street" in o.cleaned_text for o in objs)
    # Location reminder survived as a geofence reminder.
    assert any(
        o.type == "reminder" and o.location_hints.geofence_candidate for o in objs
    ), "Costco location reminder was lost"
    # Consolidated, not shattered: a messy 4-thread dump should not explode.
    assert len(objs) <= 6, f"too many notes ({len(objs)}): {[o.title for o in objs]}"
