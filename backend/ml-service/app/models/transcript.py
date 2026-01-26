"""
Transcript parsing models
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class Entity(BaseModel):
    """Extracted entity from text"""
    type: Literal["person", "place", "organization", "task", "date", "other"]
    value: str
    confidence: float = Field(ge=0, le=1)


class AtomicObjectParsed(BaseModel):
    """Parsed atomic object from transcript"""
    content: str = Field(..., description="The atomic piece of information")
    category: List[Literal["Business", "Personal", "Fitness", "Health", "Family", "Finance", "Learning", "Social", "Other"]] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1, description="Parser confidence in this object")
    entities: List[Entity] = Field(default_factory=list)
    sentiment: Optional[Literal["positive", "neutral", "negative"]] = None
    urgency: Optional[Literal["low", "medium", "high"]] = None
    tags: List[str] = Field(default_factory=list)


class TranscriptParseRequest(BaseModel):
    """Request to parse a transcript"""
    transcript: str = Field(..., description="The transcript text to parse")
    user_id: str = Field(..., description="User ID for context")
    session_id: str = Field(..., description="Voice session ID")
    timestamp: Optional[datetime] = None
    location: Optional[dict] = None
    context: Optional[dict] = Field(
        default=None,
        description="Optional context (recent objects, user preferences, etc.)"
    )


class TranscriptParseResponse(BaseModel):
    """Response from transcript parsing"""
    atomic_objects: List[AtomicObjectParsed] = Field(..., description="Parsed atomic objects")
    summary: Optional[str] = Field(None, description="Overall summary of the transcript")
    processing_time: float = Field(..., description="Processing time in seconds")
    model_used: str = Field(..., description="LLM model used for parsing")
