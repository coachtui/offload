# Meaningful Notes — Smarter Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make notes generated from voice recordings meaningful and clean — consolidated (not fragmented), free of trivial junk, always titled, and readable — by rewriting the transcript parser's prompt and few-shot examples.

**Architecture:** All changes live in the ML service's parser prompt module. The parser is a single GPT/Claude call that turns a transcript into rich atomic objects. The behavior is governed by (a) the system prompt prose rules and (b) the few-shot example outputs. We change both. The few-shot example outputs double as the deterministic test fixtures — they ARE the spec-by-example — so unit tests assert the new invariants directly on them. A gated integration test exercises a real LLM call.

**Tech Stack:** Python 3, Pydantic, pytest, FastAPI (ML service). LLM via OpenAI (`gpt-4o`) or Anthropic, selected by `LLM_MODEL` env var.

## Global Constraints

- Primary file: `backend/ml-service/app/prompts/transcript_parser.py`. Do NOT change the AtomicObject schema (`app/models/transcript.py`), `objectService.ts`, the mobile UI, or any transcription stage.
- `raw_text` MUST stay verbatim — exact spoken words, place names, and field shorthand preserved. Readability changes go in `cleaned_text` and `title` only.
- Local place names and construction shorthand (drainage inlet, vac truck, Godwin pump, Puʻuhale, Middle Street, Sand Island, Kapālama, etc.) MUST appear unchanged in `cleaned_text`.
- Location reminders ("...when I get to Costco") MUST still produce `type="reminder"` with `location_hints.geofence_candidate=true` — no regression on the place-reminders feature.
- The significance gate filters on **meaning, not length**: a 3-word real task ("call the supplier") is kept.
- Run all tests from `backend/ml-service/`. Tests put the package on the path via `sys.path.insert(0, str(Path(__file__).parent.parent))`, matching `tests/test_transcript_cleaner.py`.
- Test runner: `python -m pytest tests/test_transcript_parser.py -v` (pytest auto-adds `--cov` from `pytest.ini`).

---

## File Structure

- **Modify:** `backend/ml-service/app/prompts/transcript_parser.py`
  - `SYSTEM_PROMPT` — segmentation rule, new significance-gate section, always-title rule, readable `cleaned_text` rule.
  - `EXAMPLE_1_OUTPUT`, `EXAMPLE_2_OUTPUT`, `EXAMPLE_3_OUTPUT` — give every object a non-empty `title`.
  - Add `EXAMPLE_4_INPUT/OUTPUT` (consolidation) and `EXAMPLE_5_INPUT/OUTPUT` (junk-drop).
  - `create_few_shot_examples()` — wire in examples 4 and 5.
- **Create:** `backend/ml-service/tests/test_transcript_parser.py` — deterministic invariant tests over the few-shot examples, plus one gated integration test.
- **Create:** `backend/ml-service/scripts/parse_demo.py` — manual before/after demo runner (verification).

No schema change: `title` stays `Optional[str]` in the model so a stray omission from the live LLM never crashes validation. The prompt mandates a title; the examples enforce it; the model stays lenient as a safety net.

---

### Task 1: Always-title invariant + title-fix existing examples

Every note must carry a short meaningful title, because the notes list headline is `title || content` and a null title falls back to raw spoken words. Today the examples set `title: null` for short notes and the prompt only titles text >15 words.

**Files:**
- Create: `backend/ml-service/tests/test_transcript_parser.py`
- Modify: `backend/ml-service/app/prompts/transcript_parser.py` (SYSTEM_PROMPT title rule; EXAMPLE_1/2/3 outputs)

**Interfaces:**
- Consumes: `EXAMPLE_1_OUTPUT`, `EXAMPLE_2_OUTPUT`, `EXAMPLE_3_OUTPUT` (module-level JSON strings) from `app.prompts.transcript_parser`; `AtomicObjectParsed` from `app.models.transcript`.
- Produces: a reusable test helper `iter_example_objects()` that yields every parsed object across all few-shot examples — later tasks add their examples to its source list.

- [ ] **Step 1: Write the failing test**

Create `backend/ml-service/tests/test_transcript_parser.py`:

```python
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
from pathlib import Path
import sys

import pytest

# Ensure the app package is importable when running from the tests/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.transcript import AtomicObjectParsed
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py::test_every_example_object_has_non_empty_title -v`
Expected: FAIL — current EXAMPLE_1/2/3 contain objects with `"title": null` (e.g. the "pick up Marcus" and "Need traffic control" objects).

- [ ] **Step 3: Update the SYSTEM_PROMPT title rule**

In `app/prompts/transcript_parser.py`, replace the title rule line (currently `- title: only set if cleaned_text is longer than ~15 words; otherwise null`) with:

```
- title: ALWAYS set a short, meaningful title (max 8 words) for every object — never null. It is the headline shown in the notes list. Make it specific: "Call pump supplier about pricing", not "Phone call". Title the thought, not the words.
```

Also update the OUTPUT FORMAT comment for `title` (currently `"Short title max 8 words — or null if cleaned_text is already short"`) to:

```
      "title": "Short, specific title — max 8 words — ALWAYS set, never null",
```

- [ ] **Step 4: Give every existing example object a title**

In `EXAMPLE_1_OUTPUT`, `EXAMPLE_2_OUTPUT`, `EXAMPLE_3_OUTPUT`, replace every `"title": null` with a concrete title. Required edits:

- EXAMPLE_1, "pick up Marcus" object: `"title": "Pick up Marcus from school Thursday",`
- EXAMPLE_2, "Need traffic control" object: `"title": "Arrange traffic control on Middle Street",`
- EXAMPLE_2, "punch list walk" object: `"title": "Punch list walk at Kapālama Friday",`
- EXAMPLE_3, "paper towels" object: `"title": "Buy paper towels at Costco",`
- EXAMPLE_3, "case of water" object: `"title": "Buy a case of water at Costco",`

Leave objects that already have a non-null title unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py -v`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add backend/ml-service/tests/test_transcript_parser.py backend/ml-service/app/prompts/transcript_parser.py
git commit -m "feat(parser): always set a note title; fix few-shot examples

Notes list headline is title||content; a null title fell back to raw
speech. Mandate a title in the prompt and title every few-shot object."
```

---

### Task 2: Significance gate — drop trivial junk

The parser has no filter today: every clause becomes a note, so filler and throwaway asides ("anyway", "let me think", "that's about it") get saved. Add an explicit significance gate and a few-shot example that demonstrates dropping junk while keeping the one real item.

**Files:**
- Modify: `backend/ml-service/app/prompts/transcript_parser.py` (SYSTEM_PROMPT significance section; add EXAMPLE_5; wire into `create_few_shot_examples()`)
- Modify: `backend/ml-service/tests/test_transcript_parser.py` (add junk-drop test)

**Interfaces:**
- Consumes: `iter_example_objects()` and `_load()` from Task 1's test module.
- Produces: `EXAMPLE_5_INPUT`, `EXAMPLE_5_OUTPUT` module constants; `create_few_shot_examples()` now returns 5 user/assistant pairs.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_transcript_parser.py`:

```python
# Filler tokens that must never appear verbatim as a saved note.
_FILLER = {"anyway", "um", "uh", "let me think", "that's about it",
           "yeah", "so", "okay", "i guess"}


def test_junk_example_drops_filler():
    objs = _load(tp.EXAMPLE_5_OUTPUT)
    # Exactly one real item survives in the junk example.
    assert len(objs) == 1, f"expected 1 surviving note, got {len(objs)}"
    surviving = objs[0]
    # The surviving note is the real reminder, not a filler fragment.
    text = (surviving.cleaned_text or "").strip().lower()
    assert text not in _FILLER
    assert surviving.title and surviving.title.strip()


def test_few_shot_examples_include_junk_and_consolidation():
    # create_few_shot_examples() must wire in the new examples (5 pairs total
    # after Task 3: examples 1,2,3,4,5 -> 5 user + 5 assistant messages).
    msgs = tp.create_few_shot_examples()
    assert len(msgs) >= 8  # at least 4 examples wired (8 messages); 10 after Task 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py::test_junk_example_drops_filler -v`
Expected: FAIL with `AttributeError: module ... has no attribute 'EXAMPLE_5_OUTPUT'`.

- [ ] **Step 3: Add the significance-gate section to SYSTEM_PROMPT**

In `app/prompts/transcript_parser.py`, immediately after the `SEGMENTATION RULES:` block, insert:

```
SIGNIFICANCE GATE — what deserves to be a note:
- Emit an object ONLY if it carries standalone meaning: a task, reminder, idea,
  observation, question, decision, reference, or a genuine personal reflection.
- DROP entirely (produce NO object for): filler and conversational glue ("um",
  "okay so", "anyway", "yeah"), false starts, thinking-out-loud ("let me think"),
  and sign-offs ("that's about it", "I guess that's everything").
- The test is MEANING, not length. "Call the supplier" is 3 words and is a real
  task — keep it. "Anyway, where was I" is filler — drop it.
- If a recording is entirely filler, return {"atomic_objects": []}.
```

- [ ] **Step 4: Add EXAMPLE_5 (junk-drop) constants**

Add near the other examples in `app/prompts/transcript_parser.py`:

```python
# ---------------------------------------------------------------------------
# Few-shot example 5 — Significance gate (drop filler, keep the one real item)
# ---------------------------------------------------------------------------

EXAMPLE_5_INPUT = """Um, okay. Let me think. Yeah so. Where was I. Oh — remind me to email the inspector about the Sand Island permit. Yeah. That's about it I guess."""

EXAMPLE_5_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "remind me to email the inspector about the Sand Island permit",
      "cleaned_text": "Email the inspector about the Sand Island permit",
      "title": "Email inspector re: Sand Island permit",
      "type": "reminder",
      "domain": "work",
      "tags": ["email", "inspector", "permit", "Sand Island"],
      "entities": ["Sand Island"],
      "confidence": 0.95,
      "temporal_hints": {
        "has_date": false,
        "date_text": null,
        "urgency": "medium"
      },
      "location_hints": {
        "places": ["Sand Island"],
        "geofence_candidate": false
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Email the inspector about the Sand Island permit"
      },
      "context_inherited_from": null
    }
  ]
}"""
```

- [ ] **Step 5: Wire EXAMPLE_5 into `create_few_shot_examples()`**

In `create_few_shot_examples()`, append two entries to the returned list (after the EXAMPLE_3 assistant entry):

```python
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_5_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_5_OUTPUT
        },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py -v`
Expected: PASS. `test_every_example_object_has_non_empty_title` still passes (EXAMPLE_5's one object has a title). `test_few_shot_examples_include_junk_and_consolidation` passes at the `>= 8` floor.

- [ ] **Step 7: Commit**

```bash
git add backend/ml-service/app/prompts/transcript_parser.py backend/ml-service/tests/test_transcript_parser.py
git commit -m "feat(parser): add significance gate to drop trivial filler

New prompt section + few-shot example: filler, false starts, and sign-offs
produce no note; only standalone-meaningful thoughts are saved."
```

---

### Task 3: Consolidation + readable cleaned_text

Change segmentation from "split on every topic/intent change" to "one meaningful thread = one note", and allow `cleaned_text` to be lightly rephrased into one readable line while preserving exact place names and shorthand. Add a consolidation example (rambly fragments → one clean note).

**Files:**
- Modify: `backend/ml-service/app/prompts/transcript_parser.py` (SEGMENTATION RULES, cleaned_text rule; add EXAMPLE_4; wire into `create_few_shot_examples()`)
- Modify: `backend/ml-service/tests/test_transcript_parser.py` (consolidation + preservation tests)

**Interfaces:**
- Consumes: `_load()`, `tp` from Task 1's test module; `EXAMPLE_2_OUTPUT` (place-name preservation check).
- Produces: `EXAMPLE_4_INPUT`, `EXAMPLE_4_OUTPUT`; `create_few_shot_examples()` returns 5 example pairs (10 messages).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_transcript_parser.py`:

```python
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


def test_place_names_preserved_in_cleaned_text():
    # Jobsite example must keep local place names verbatim in cleaned_text.
    objs = _load(tp.EXAMPLE_2_OUTPUT)
    joined = " ".join(o.cleaned_text for o in objs)
    for place in ("Puʻuhale", "Middle Street", "Sand Island", "Kapālama"):
        assert place in joined, f"place name '{place}' was lost from cleaned_text"


def test_full_few_shot_set_has_five_examples():
    msgs = tp.create_few_shot_examples()
    assert len(msgs) == 10, f"expected 5 example pairs (10 messages), got {len(msgs)}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py::test_consolidation_example_is_single_note tests/test_transcript_parser.py::test_full_few_shot_set_has_five_examples -v`
Expected: FAIL — `EXAMPLE_4_OUTPUT` does not exist yet, and `create_few_shot_examples()` returns 8 messages (only 4 examples wired).

- [ ] **Step 3: Rewrite the SEGMENTATION RULES**

In `app/prompts/transcript_parser.py`, replace the entire `SEGMENTATION RULES:` block (the five `-` lines starting `Split when the topic OR intent changes`) with:

```
SEGMENTATION RULES — one meaningful thread = one note:
- Group everything about a single thread (a task and its directly-related context,
  reason, place, and timing) into ONE object. Do NOT shatter one thread into pieces.
- Start a NEW object only when the speaker genuinely moves to an UNRELATED thread.
  "Call Dave about the quote, and separately, book the hotel for the trip" → 2 objects.
- Trailing fragments ("...out there too", "...and that thing as well") belong to the
  thread they extend — fold them in; never make them their own note.
- When unsure whether two adjacent thoughts are one thread or two, prefer ONE
  consolidated note over two fragments.
```

- [ ] **Step 4: Rewrite the cleaned_text rule**

Replace the `cleaned_text:` rule line under `FIELD RULES:` (the long STRICT-RULES line) with:

```
- cleaned_text: rewrite the thread into ONE clear, readable line a person would want
  to see in a notes list. Fix grammar, drop false starts/repetition/filler, and
  merge the thread's fragments into a coherent sentence. BUT: (1) preserve every
  local place name verbatim (Puʻuhale, Middle Street, Sand Island, Kapālama, etc.);
  (2) preserve field/construction shorthand exactly (drainage inlet, vac truck,
  Godwin pump, dewatering, punch list, RFI, change order); (3) do NOT invent facts,
  numbers, names, or commitments the speaker did not say. The verbatim words live in
  raw_text; readability lives here.
```

- [ ] **Step 5: Add EXAMPLE_4 (consolidation) constants**

Add near the other examples:

```python
# ---------------------------------------------------------------------------
# Few-shot example 4 — Consolidation (rambly fragments about ONE topic → 1 note)
# ---------------------------------------------------------------------------

EXAMPLE_4_INPUT = """Okay so the pump, the pump quote, yeah it came in like way over, way too high, and I gotta, I need to call the supplier about that tomorrow and get it sorted out."""

EXAMPLE_4_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "the pump quote came in way over, way too high, and I need to call the supplier about that tomorrow and get it sorted out",
      "cleaned_text": "Call the supplier tomorrow about the pump quote — it came in way too high",
      "title": "Call supplier about high pump quote",
      "type": "task",
      "domain": "work",
      "tags": ["supplier", "pump", "quote", "pricing"],
      "entities": ["supplier"],
      "confidence": 0.93,
      "temporal_hints": {
        "has_date": true,
        "date_text": "tomorrow",
        "urgency": "high"
      },
      "location_hints": {
        "places": [],
        "geofence_candidate": false
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Call the supplier tomorrow to renegotiate the pump quote"
      },
      "context_inherited_from": null
    }
  ]
}"""
```

- [ ] **Step 6: Wire EXAMPLE_4 into `create_few_shot_examples()`**

In `create_few_shot_examples()`, insert two entries for EXAMPLE_4 **between** the EXAMPLE_3 assistant entry and the EXAMPLE_5 user entry (so order is 1,2,3,4,5):

```python
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_4_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_4_OUTPUT
        },
```

- [ ] **Step 7: Run the full test file to verify all pass**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py -v`
Expected: PASS — all tests green, including `test_full_few_shot_set_has_five_examples` (10 messages) and `test_place_names_preserved_in_cleaned_text`.

- [ ] **Step 8: Commit**

```bash
git add backend/ml-service/app/prompts/transcript_parser.py backend/ml-service/tests/test_transcript_parser.py
git commit -m "feat(parser): consolidate threads and make cleaned_text readable

One meaningful thread = one note (no more fragment-per-clause). cleaned_text
is rephrased into a clean readable line while preserving place names and
field shorthand verbatim. Adds consolidation few-shot example."
```

---

### Task 4: Behavioral verification (gated integration test + manual demo)

Unit tests pin the examples; this task verifies the live LLM actually behaves on real transcripts (the spec's Verification section). The integration test is skipped automatically when no API key is present, so it never breaks CI.

**Files:**
- Modify: `backend/ml-service/tests/test_transcript_parser.py` (gated integration test)
- Create: `backend/ml-service/scripts/parse_demo.py` (manual before/after runner)

**Interfaces:**
- Consumes: `app.services.parser.get_parser`, `app.models.transcript.TranscriptParseRequest`.
- Produces: nothing other tasks depend on (final task).

- [ ] **Step 1: Add the gated integration test**

Add to `tests/test_transcript_parser.py`:

```python
import os
import asyncio

from app.services.parser import get_parser
from app.models.transcript import TranscriptParseRequest

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
```

- [ ] **Step 2: Run unit tests (integration auto-skips)**

Run: `cd backend/ml-service && python -m pytest tests/test_transcript_parser.py -v`
Expected: PASS for all unit tests; `test_live_parse_is_meaningful` shows SKIPPED (no API key in this shell).

- [ ] **Step 3: Create the manual demo runner**

Create `backend/ml-service/scripts/parse_demo.py`:

```python
"""
Manual before/after demo for the transcript parser.

Usage (from backend/ml-service/, with OPENAI_API_KEY or ANTHROPIC_API_KEY set):
    python scripts/parse_demo.py

Prints the notes produced for a set of representative transcripts so you can
eyeball consolidation, junk-dropping, titles, and place-name preservation.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.parser import get_parser
from app.models.transcript import TranscriptParseRequest

SAMPLES = {
    "multi-topic brain dump": (
        "I need to call the pump supplier tomorrow about pricing, their quote was "
        "way too high. Also the app dashboard feels too cluttered, maybe simplify "
        "the main view. And remember to pick up Marcus from school at 3pm Thursday."
    ),
    "Honolulu jobsite dump": (
        "Set up crew to clear drainage inlets from Middle Street to Puʻuhale today, "
        "need traffic control out there too. Check the vac truck at Sand Island for "
        "dewatering tomorrow. Punch list walk at Kapālama Friday."
    ),
    "filler-heavy": (
        "Um, okay, let me think. Yeah so. Where was I. Oh remind me to email the "
        "inspector about the Sand Island permit. Yeah. That's about it I guess."
    ),
    "location reminder": (
        "Remind me to get paper towels when I get to Costco, also need a case of water."
    ),
}


async def main():
    parser = get_parser()
    for name, transcript in SAMPLES.items():
        req = TranscriptParseRequest(
            transcript=transcript, user_id="demo", session_id="demo"
        )
        objs, model, secs, _raw = await parser.parse_transcript(req)
        print(f"\n=== {name} ({len(objs)} notes, {model}, {secs:.1f}s) ===")
        for o in objs:
            print(f"  • [{o.type}/{o.domain}] {o.title}")
            print(f"      {o.cleaned_text}")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Run the manual demo and eyeball output**

Run (requires a live key): `cd backend/ml-service && python scripts/parse_demo.py`
Expected, per the spec's pass criteria:
- multi-topic → 3 distinct titled notes;
- jobsite → titled notes with `Puʻuhale` / `Middle Street` / `Sand Island` / `Kapālama` intact and shorthand (drainage inlet, vac truck) preserved;
- filler-heavy → exactly 1 note (the inspector email);
- location reminder → a `reminder` note for Costco.
If any sample is wrong, iterate on the prompt/examples and re-run before committing.

- [ ] **Step 5: Commit**

```bash
git add backend/ml-service/tests/test_transcript_parser.py backend/ml-service/scripts/parse_demo.py
git commit -m "test(parser): gated live integration test + manual parse demo

Behavioral verification for the meaningful-notes parser: titles, junk-drop,
consolidation, and place-name/location-reminder preservation on a real call."
```

---

## Self-Review

**Spec coverage:**
- "Too fragmented" → Task 3 (consolidation rule + example, `test_consolidation_example_is_single_note`, integration `len(objs) <= 6`). ✓
- "Trivial junk" → Task 2 (significance gate + example, `test_junk_example_drops_filler`, integration filler check). ✓
- "Raw text / always title" → Task 1 (title rule + example fixes, `test_every_example_object_has_non_empty_title`) and Task 3 (readable cleaned_text). ✓
- "No hierarchy" → delivered by titles (Task 1) + existing type/domain rendering; no UI change needed per spec. ✓
- "raw_text stays verbatim" → Task 3 cleaned_text rule keeps raw_text separate; `test_consolidation_example_is_single_note` asserts cleaned_text != raw_text. ✓
- "place names + shorthand preserved" → Task 3 `test_place_names_preserved_in_cleaned_text` + integration check. ✓
- "location reminders survive" → Task 4 integration test geofence assertion. ✓
- "Verification cases" (4 transcripts) → Task 4 demo runner covers all four. ✓
- Out of scope (two-stage pipeline, recording-grouping UI, reprocessing history, transcription stages) → untouched. ✓

**Placeholder scan:** No TBD/TODO; every code/prompt step shows exact content. ✓

**Type consistency:** `iter_example_objects()`, `_load()`, `_example_output_strings()` defined in Task 1 and reused in Tasks 2–4. `EXAMPLE_4_*`/`EXAMPLE_5_*` constant names match between definition and `create_few_shot_examples()` wiring. `parse_transcript()` is awaited and unpacks the 4-tuple `(objects, model, processing_time, raw_transcript)` exactly as defined in `parser.py:77`. ✓
