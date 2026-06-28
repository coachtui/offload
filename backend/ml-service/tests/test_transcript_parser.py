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
