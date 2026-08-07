"""
Transcript parser service using LLM — v2 rich schema
"""

import asyncio
import json
import re
import time
import os
from typing import List, Optional
import httpx
from ..models.transcript import AtomicObjectParsed, TranscriptParseRequest
from ..prompts.transcript_parser import (
    SYSTEM_PROMPT,
    create_user_prompt,
    create_few_shot_examples
)
from .transcript_cleaner import get_cleaner

# The parse emits one full object (raw/cleaned text, title, why-it-matters,
# entities, tags, hints) per idea in the note, so generation time scales with how
# much the user said — a 90-second note costs several times a 15-second one. At
# 60s long notes timed out, which the API surfaced as an outright save failure.
# The API's own budget for this service must stay above this value.
LLM_TIMEOUT_SECONDS = 90.0

# Transcripts longer than this are split and parsed concurrently.
#
# One call for a five-minute note is slow (output tokens scale with the number
# of objects, and generation is serial) and risks truncation — a truncated JSON
# body fails to parse, which reads as a total failure rather than a partial one.
# ~1200 characters is roughly 45-60 seconds of speech, which parses well inside
# the budget and keeps each response comfortably short.
CHUNK_CHAR_THRESHOLD = 1200
MAX_PARALLEL_CHUNKS = 4

# Claude's output cap. 4096 truncated long notes mid-JSON; chunking makes a large
# value unnecessary, but the headroom removes the failure mode entirely.
CLAUDE_MAX_TOKENS = 8192


def split_transcript(text: str, max_chars: int = CHUNK_CHAR_THRESHOLD) -> List[str]:
    """
    Split on sentence boundaries into chunks of at most `max_chars`.

    Splitting mid-sentence would hand the parser a fragment with no verb or no
    subject, and it would either drop it or invent context. Sentence boundaries
    keep each chunk independently meaningful. A single sentence longer than
    max_chars is left intact rather than cut — an oversized chunk is a much
    smaller problem than a mangled one.
    """
    stripped = text.strip()
    if len(stripped) <= max_chars:
        return [stripped] if stripped else []

    sentences = re.split(r'(?<=[.!?])\s+', stripped)

    chunks: List[str] = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        if current and len(current) + 1 + len(sentence) > max_chars:
            chunks.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip() if current else sentence

    if current:
        chunks.append(current)

    return chunks


class TranscriptParser:
    """Parser for converting transcripts into rich atomic objects"""

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.model = os.getenv("LLM_MODEL", "gpt-4o")
        self.use_anthropic = self.model.startswith("claude")

        if not self.openai_api_key and not self.anthropic_api_key:
            raise ValueError("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be set")

    async def parse_transcript(
        self,
        request: TranscriptParseRequest
    ) -> tuple[List[AtomicObjectParsed], str, float]:
        """
        Parse transcript into rich atomic objects.
        Returns: (list of parsed objects, model used, processing time in seconds)
        """
        start_time = time.time()

        # Layer B: clean transcript before sending to LLM
        cleaner = get_cleaner()
        cleaned_transcript, corrections = cleaner.clean(request.transcript)

        # Build a modified request with the cleaned transcript and correction context
        context = dict(request.context or {})
        if corrections:
            context["transcript_corrections"] = [
                {
                    "original": c.original,
                    "corrected": c.corrected,
                    "confidence": round(c.confidence, 2),
                }
                for c in corrections
            ]

        parse_request = TranscriptParseRequest(
            transcript=cleaned_transcript,
            user_id=request.user_id,
            session_id=request.session_id,
            timestamp=request.timestamp,
            location=request.location,
            context=context if context else None,
        )

        atomic_objects = await self._parse_chunked(parse_request)

        # Flag low-confidence objects for user review
        for obj in atomic_objects:
            if obj.confidence < 0.75:
                obj.needs_review = True

        processing_time = time.time() - start_time
        return atomic_objects, self.model, processing_time, request.transcript

    async def _parse_chunked(
        self,
        request: TranscriptParseRequest
    ) -> List[AtomicObjectParsed]:
        """
        Parse a transcript, splitting long ones into concurrent calls.

        Short transcripts take the single-call path unchanged. Long ones are cut
        on sentence boundaries and parsed in parallel, so wall-clock tracks the
        slowest chunk rather than the sum — which is what makes a five-minute
        note cost about the same as a one-minute one.
        """
        chunks = split_transcript(request.transcript)

        if len(chunks) <= 1:
            return await self._parse_one(request)

        print(f"Parsing {len(chunks)} chunks concurrently ({len(request.transcript)} chars)")
        semaphore = asyncio.Semaphore(MAX_PARALLEL_CHUNKS)

        async def parse_chunk(chunk: str) -> List[AtomicObjectParsed]:
            async with semaphore:
                chunk_request = request.model_copy(update={"transcript": chunk})
                return await self._parse_one(chunk_request)

        results = await asyncio.gather(
            *(parse_chunk(chunk) for chunk in chunks),
            return_exceptions=True,
        )

        # One failed chunk must not discard the rest — losing a quarter of a note
        # beats losing all of it. A total failure still raises, so the caller's
        # unparsed-save fallback takes over.
        atomic_objects: List[AtomicObjectParsed] = []
        failures = 0
        for index, result in enumerate(results):
            if isinstance(result, BaseException):
                failures += 1
                print(f"Chunk {index} failed: {result}")
                continue
            atomic_objects.extend(result)

        if failures == len(chunks):
            raise RuntimeError(f"All {failures} transcript chunks failed to parse")
        if failures:
            print(f"Recovered {len(chunks) - failures}/{len(chunks)} chunks")

        # sequence_index is assigned per-chunk, so it restarts at 0 on every
        # chunk. Renumber across the whole transcript to restore spoken order.
        for position, obj in enumerate(atomic_objects):
            obj.sequence_index = position

        return atomic_objects

    async def _parse_one(
        self,
        request: TranscriptParseRequest
    ) -> List[AtomicObjectParsed]:
        """Single LLM call for one transcript (or one chunk of one)."""
        if self.use_anthropic:
            return await self._parse_with_claude(request)
        return await self._parse_with_openai(request)

    async def _parse_with_openai(
        self,
        request: TranscriptParseRequest
    ) -> List[AtomicObjectParsed]:
        """Parse using OpenAI GPT"""

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json"
        }

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(create_few_shot_examples())
        messages.append({
            "role": "user",
            "content": create_user_prompt(request.transcript, request.context)
        })

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        try:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                result = response.json()
                content = result["choices"][0]["message"]["content"]
                return self._parse_json_response(content)

        except Exception as e:
            print(f"Error parsing with OpenAI: {e}")
            raise RuntimeError(f"Failed to parse transcript with OpenAI: {str(e)}")

    async def _parse_with_claude(
        self,
        request: TranscriptParseRequest
    ) -> List[AtomicObjectParsed]:
        """Parse using Anthropic Claude"""

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.anthropic_api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }

        user_prompt = create_user_prompt(request.transcript, request.context)

        # Build messages with few-shot examples
        messages = []
        for ex in create_few_shot_examples():
            messages.append(ex)
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "model": self.model,
            "max_tokens": CLAUDE_MAX_TOKENS,
            "temperature": 0.2,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }

        try:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                result = response.json()
                content = result["content"][0]["text"]
                return self._parse_json_response(content)

        except Exception as e:
            print(f"Error parsing with Claude: {e}")
            raise RuntimeError(f"Failed to parse transcript with Claude: {str(e)}")

    def _parse_json_response(self, content: str) -> List[AtomicObjectParsed]:
        """Parse JSON response string into AtomicObjectParsed list, set sequence_index."""
        content = content.strip()
        # Strip markdown fences if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        parsed_data = json.loads(content)

        # Accept both {"atomic_objects": [...]} and plain [...]
        if isinstance(parsed_data, list):
            objects_data = parsed_data
        elif isinstance(parsed_data, dict) and "atomic_objects" in parsed_data:
            objects_data = parsed_data["atomic_objects"]
        else:
            raise ValueError(f"Unexpected response format: {type(parsed_data)}")

        # Convert to Pydantic models; assign sequence_index from position
        atomic_objects = []
        for i, obj_data in enumerate(objects_data):
            obj_data["sequence_index"] = i
            atomic_objects.append(AtomicObjectParsed(**obj_data))

        return atomic_objects


# Singleton instance
_parser_instance: Optional[TranscriptParser] = None


def get_parser() -> TranscriptParser:
    """Get or create parser instance"""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = TranscriptParser()
    return _parser_instance
