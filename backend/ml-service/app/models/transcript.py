"""
Transcript parsing models — v2 rich atomic object schema
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class TemporalHints(BaseModel):
    has_date: bool = False
    date_text: Optional[str] = None
    urgency: Optional[Literal["low", "medium", "high"]] = None


class LocationHints(BaseModel):
    places: List[str] = Field(default_factory=list)
    geofence_candidate: bool = False


class Actionability(BaseModel):
    is_actionable: bool = False
    next_action: Optional[str] = None


class AtomicObjectParsed(BaseModel):
    """Rich atomic object parsed from a transcript"""
    raw_text: str = Field(..., description="Verbatim or near-verbatim excerpt from transcript")
    cleaned_text: str = Field(..., description="Cleaned, normalized version suitable for display")
    title: Optional[str] = Field(None, description="Short title max 8 words, or null if text is already concise")
    # Keep this Literal in sync with: TS ObjectType union (backend/api shared-types)
    # and the DB object_type CHECK constraint (migration 014).
    type: Literal[
        "task", "reminder", "idea", "observation",
        "question", "decision", "journal", "reference",
        "commitment", "preference", "concern"
    ] = Field(..., description="Type of thought unit")
    domain: Literal[
        "work", "personal", "health", "family",
        "finance", "project", "misc", "unknown"
    ] = Field("unknown", description="Life domain this thought belongs to")
    tags: List[str] = Field(default_factory=list, description="2-5 lowercase tags for search")
    entities: List[str] = Field(
        default_factory=list,
        description="Named entities as strings: people, places, orgs, products"
    )
    confidence: float = Field(ge=0, le=1, description="Parser confidence 0-1")
    temporal_hints: TemporalHints = Field(default_factory=TemporalHints)
    location_hints: LocationHints = Field(default_factory=LocationHints)
    actionability: Actionability = Field(default_factory=Actionability)
    sequence_index: int = Field(0, description="Position in transcript (set by parser after parsing)")
    context_inherited_from: Optional[int] = Field(
        None,
        description="sequence_index of the adjacent object whose context was inherited, or null if self-contained"
    )
    why_it_matters: Optional[str] = Field(None, description="Why this is worth remembering / when it'd be useful again; null if transient")
    needs_review: bool = Field(False, description="True when confidence < 0.75 — flagged for user review")


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


class CorrectionFeedback(BaseModel):
    """User correction for a parsed atomic object"""
    session_id: str = Field(..., description="Voice session ID the object came from")
    sequence_index: int = Field(..., description="sequence_index of the object being corrected")
    field: Literal["type", "domain", "cleaned_text", "title", "tags", "actionability", "other"] = Field(
        ..., description="Which field was wrong"
    )
    original_value: str = Field(..., description="What the parser produced")
    corrected_value: str = Field(..., description="What the user says it should be")
    note: Optional[str] = Field(None, description="Optional free-text comment from user")
    user_id: str = Field(..., description="User who submitted the correction")
    submitted_at: datetime = Field(default_factory=datetime.utcnow)


class TranscriptParseResponse(BaseModel):
    """Response from transcript parsing"""
    atomic_objects: List[AtomicObjectParsed] = Field(..., description="Parsed atomic objects")
    summary: Optional[str] = Field(None, description="Overall summary of the transcript")
    processing_time: float = Field(..., description="Processing time in seconds")
    model_used: str = Field(..., description="LLM model used for parsing")
    raw_transcript: Optional[str] = Field(None, description="Original transcript before cleaning")
    needs_review_count: int = Field(0, description="Number of objects flagged for user review")
