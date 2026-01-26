"""
Transcript parser service using LLM
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


class TranscriptParser:
    """Parser for converting transcripts into atomic objects"""

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.model = os.getenv("LLM_MODEL", "gpt-4-turbo")
        self.use_anthropic = self.model.startswith("claude")

        if not self.openai_api_key and not self.anthropic_api_key:
            raise ValueError("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be set")

    async def parse_transcript(
        self,
        request: TranscriptParseRequest
    ) -> tuple[List[AtomicObjectParsed], str]:
        """
        Parse transcript into atomic objects

        Returns:
            tuple: (list of parsed objects, model used)
        """
        start_time = time.time()

        # Use Anthropic Claude or OpenAI GPT
        if self.use_anthropic:
            atomic_objects = await self._parse_with_claude(request)
        else:
            atomic_objects = await self._parse_with_openai(request)

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

        # Build messages
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        # Add few-shot examples
        messages.extend(create_few_shot_examples())

        # Add user request
        user_prompt = create_user_prompt(
            request.transcript,
            request.context
        )
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,  # Lower temperature for more consistent parsing
            "response_format": {"type": "json_object"} if self.model == "gpt-4-turbo" else None
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                result = response.json()
                content = result["choices"][0]["message"]["content"]

                # Parse JSON response
                parsed_data = json.loads(content)

                # Handle both direct array and wrapped response
                if isinstance(parsed_data, list):
                    objects_data = parsed_data
                elif isinstance(parsed_data, dict) and "atomic_objects" in parsed_data:
                    objects_data = parsed_data["atomic_objects"]
                else:
                    raise ValueError(f"Unexpected response format: {parsed_data}")

                # Convert to Pydantic models
                atomic_objects = [
                    AtomicObjectParsed(**obj)
                    for obj in objects_data
                ]

                return atomic_objects

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

        # Build user prompt with system context
        user_prompt = f"{SYSTEM_PROMPT}\n\n{create_user_prompt(request.transcript, request.context)}"

        # Add few-shot examples
        examples = create_few_shot_examples()
        for example in examples:
            if example["role"] == "user":
                user_prompt += f"\n\nExample input:\n{example['content']}"
            elif example["role"] == "assistant":
                user_prompt += f"\n\nExample output:\n{example['content']}"

        payload = {
            "model": self.model,
            "max_tokens": 4096,
            "temperature": 0.3,
            "messages": [
                {"role": "user", "content": user_prompt}
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                result = response.json()
                content = result["content"][0]["text"]

                # Parse JSON response
                # Claude might wrap in markdown, so strip that
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

                parsed_data = json.loads(content)

                # Handle both direct array and wrapped response
                if isinstance(parsed_data, list):
                    objects_data = parsed_data
                elif isinstance(parsed_data, dict) and "atomic_objects" in parsed_data:
                    objects_data = parsed_data["atomic_objects"]
                else:
                    raise ValueError(f"Unexpected response format: {parsed_data}")

                # Convert to Pydantic models
                atomic_objects = [
                    AtomicObjectParsed(**obj)
                    for obj in objects_data
                ]

                return atomic_objects

        except Exception as e:
            print(f"Error parsing with Claude: {e}")
            raise RuntimeError(f"Failed to parse transcript with Claude: {str(e)}")


# Singleton instance
_parser_instance: Optional[TranscriptParser] = None


def get_parser() -> TranscriptParser:
    """Get or create parser instance"""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = TranscriptParser()
    return _parser_instance
