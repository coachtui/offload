"""
Tests for long-transcript chunking.

A five-minute note is one LLM call producing dozens of objects: slow, and close
enough to the output cap that a truncated JSON body — which fails to parse
entirely — is a real outcome. Splitting on sentence boundaries and parsing
concurrently bounds both. These tests pin the splitting contract and the
chunk-failure behaviour, since a bug in either silently costs the user words.
"""

import asyncio
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.parser import (
    CHUNK_CHAR_THRESHOLD,
    TranscriptParser,
    split_transcript,
)
from app.models.transcript import AtomicObjectParsed, TranscriptParseRequest


def _sentences(n, filler="word"):
    """n sentences of ~50 chars each."""
    return " ".join(f"This is sentence number {i} about {filler} things." for i in range(n))


class TestSplitTranscript:
    def test_short_transcript_is_one_chunk(self):
        assert split_transcript("Buy milk. Call mum.") == ["Buy milk. Call mum."]

    def test_empty_transcript_yields_no_chunks(self):
        assert split_transcript("") == []
        assert split_transcript("   ") == []

    def test_long_transcript_splits(self):
        text = _sentences(80)
        chunks = split_transcript(text)
        assert len(chunks) > 1

    def test_every_chunk_respects_the_cap(self):
        chunks = split_transcript(_sentences(120))
        assert all(len(c) <= CHUNK_CHAR_THRESHOLD for c in chunks)

    def test_no_words_are_lost(self):
        # The whole point: chunking must be lossless. Rejoining restores the text.
        text = _sentences(100)
        assert " ".join(split_transcript(text)) == text

    def test_splits_only_on_sentence_boundaries(self):
        # A chunk starting mid-sentence would hand the parser a fragment with no
        # subject, which it either drops or invents context for.
        for chunk in split_transcript(_sentences(100)):
            assert chunk.startswith("This is sentence")
            assert chunk.endswith(".")

    def test_oversized_single_sentence_is_kept_intact(self):
        # Better one oversized chunk than a mangled one.
        giant = "word " * (CHUNK_CHAR_THRESHOLD // 2)
        chunks = split_transcript(giant.strip() + ".")
        assert len(chunks) == 1


def _obj(seq, text="thing"):
    return AtomicObjectParsed(
        raw_text=text,
        cleaned_text=text,
        title=text,
        type="task",
        domain="personal",
        tags=[],
        entities=[],
        people=[],
        confidence=0.9,
        temporal_hints={"has_date": False, "date_text": None, "urgency": None},
        location_hints={"places": [], "geofence_candidate": False},
        actionability={"is_actionable": True, "next_action": None},
        sequence_index=seq,
        why_it_matters=None,
    )


def _request(transcript):
    return TranscriptParseRequest(transcript=transcript, user_id="u-1", session_id="s-1")


class TestChunkedParsing:
    def _parser(self):
        parser = TranscriptParser.__new__(TranscriptParser)  # skip __init__ key checks
        parser.model = "gpt-4o"
        parser.use_anthropic = False
        return parser

    def test_sequence_index_is_renumbered_across_chunks(self):
        # Each chunk numbers from 0, so without renumbering a three-chunk note
        # yields three objects all claiming index 0 and spoken order is lost.
        parser = self._parser()

        async def fake_parse_one(request):
            return [_obj(0), _obj(1)]

        parser._parse_one = fake_parse_one
        result = asyncio.get_event_loop().run_until_complete(
            parser._parse_chunked(_request(_sentences(100)))
        )
        assert [o.sequence_index for o in result] == list(range(len(result)))

    def test_one_failing_chunk_does_not_discard_the_rest(self):
        parser = self._parser()
        calls = {"n": 0}

        async def flaky_parse_one(request):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("chunk blew up")
            return [_obj(0)]

        parser._parse_one = flaky_parse_one
        result = asyncio.get_event_loop().run_until_complete(
            parser._parse_chunked(_request(_sentences(100)))
        )
        assert len(result) > 0

    def test_total_failure_raises_so_caller_can_fall_back(self):
        # The API's unparsed-save fallback only fires on an exception; swallowing
        # this would report a successful save that wrote nothing.
        parser = self._parser()

        async def always_fails(request):
            raise RuntimeError("nope")

        parser._parse_one = always_fails
        with pytest.raises(RuntimeError):
            asyncio.get_event_loop().run_until_complete(
                parser._parse_chunked(_request(_sentences(100)))
            )

    def test_short_transcript_makes_a_single_call(self):
        parser = self._parser()
        calls = {"n": 0}

        async def counting_parse_one(request):
            calls["n"] += 1
            return [_obj(0)]

        parser._parse_one = counting_parse_one
        asyncio.get_event_loop().run_until_complete(
            parser._parse_chunked(_request("Buy milk."))
        )
        assert calls["n"] == 1
