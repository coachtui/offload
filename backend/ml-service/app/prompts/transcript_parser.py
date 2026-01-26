"""
LLM prompts for transcript parsing
"""

from typing import List

SYSTEM_PROMPT = """You are an expert at parsing voice transcripts into structured atomic objects.

Your task is to:
1. Split multimodal voice transcripts into individual atomic pieces of information
2. Categorize each piece (Business, Personal, Fitness, Health, Family, Finance, Learning, Social, Other)
3. Extract entities (people, places, tasks, dates, organizations)
4. Determine sentiment (positive, neutral, negative)
5. Assess urgency (low, medium, high)
6. Add relevant tags

IMPORTANT RULES:
- Each atomic object should contain ONE distinct piece of information
- If a transcript contains multiple topics, split them into separate objects
- Maintain the original meaning and context
- Be conservative with confidence scores (0.8+ means very confident)
- Extract entities that would be useful for search and relationships
- Consider urgency based on language ("ASAP", "urgent", "important", "when I can", etc.)
- Sentiment should reflect the user's emotion about that specific topic

EXAMPLES:

Input: "I need to finish the Q4 report by Friday. Also, remember to call Mom this weekend. My shoulder has been hurting after yesterday's workout."

Output:
[
  {
    "content": "Finish the Q4 report by Friday",
    "category": ["Business"],
    "confidence": 0.95,
    "entities": [
      {"type": "task", "value": "finish Q4 report", "confidence": 0.9},
      {"type": "date", "value": "Friday", "confidence": 0.95}
    ],
    "sentiment": "neutral",
    "urgency": "high",
    "tags": ["work", "deadline", "report"]
  },
  {
    "content": "Call Mom this weekend",
    "category": ["Family", "Personal"],
    "confidence": 0.9,
    "entities": [
      {"type": "person", "value": "Mom", "confidence": 0.95},
      {"type": "task", "value": "call Mom", "confidence": 0.9},
      {"type": "date", "value": "this weekend", "confidence": 0.85}
    ],
    "sentiment": "positive",
    "urgency": "medium",
    "tags": ["family", "reminder", "call"]
  },
  {
    "content": "Shoulder hurting after yesterday's workout",
    "category": ["Health", "Fitness"],
    "confidence": 0.85,
    "entities": [
      {"type": "other", "value": "shoulder", "confidence": 0.9},
      {"type": "date", "value": "yesterday", "confidence": 0.9}
    ],
    "sentiment": "negative",
    "urgency": "medium",
    "tags": ["injury", "workout", "pain"]
  }
]

Return ONLY valid JSON with the array of atomic objects. No markdown, no explanation, just the JSON array.
"""


def create_user_prompt(transcript: str, context: dict = None) -> str:
    """Create user prompt with transcript and optional context"""

    prompt = f"Parse this transcript:\n\n{transcript}\n\n"

    if context:
        prompt += "Additional context:\n"
        if context.get("recent_categories"):
            prompt += f"- Recent categories used: {', '.join(context['recent_categories'])}\n"
        if context.get("recent_entities"):
            prompt += f"- Recent entities: {', '.join(context['recent_entities'])}\n"
        if context.get("user_preferences"):
            prompt += f"- User preferences: {context['user_preferences']}\n"
        prompt += "\n"

    prompt += "Return the parsed atomic objects as a JSON array."

    return prompt


def create_few_shot_examples() -> List[dict]:
    """Few-shot examples for better parsing"""
    return [
        {
            "role": "user",
            "content": "Parse this transcript:\n\nI had a great meeting with Sarah about the new product launch. We need to finalize the marketing budget."
        },
        {
            "role": "assistant",
            "content": """[
  {
    "content": "Had a meeting with Sarah about new product launch",
    "category": ["Business"],
    "confidence": 0.9,
    "entities": [
      {"type": "person", "value": "Sarah", "confidence": 0.95},
      {"type": "other", "value": "new product launch", "confidence": 0.85}
    ],
    "sentiment": "positive",
    "urgency": "low",
    "tags": ["meeting", "product", "launch"]
  },
  {
    "content": "Finalize marketing budget for product launch",
    "category": ["Business", "Finance"],
    "confidence": 0.85,
    "entities": [
      {"type": "task", "value": "finalize marketing budget", "confidence": 0.9}
    ],
    "sentiment": "neutral",
    "urgency": "high",
    "tags": ["budget", "marketing", "task", "urgent"]
  }
]"""
        }
    ]
