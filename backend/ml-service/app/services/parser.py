"""
Transcript parser service using LLM — v2 rich schema
"""

import json
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

        if self.use_anthropic:
            atomic_objects = await self._parse_with_claude(parse_request)
        else:
            atomic_objects = await self._parse_with_openai(parse_request)

        processing_time = time.time() - start_time
        return atomic_objects, self.model, processing_time

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
            async with httpx.AsyncClient(timeout=60.0) as client:
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
            "max_tokens": 4096,
            "temperature": 0.2,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
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
