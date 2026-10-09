from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ChangeType(str, Enum):
    added = "added"
    removed = "removed"
    moved = "moved"
    unchanged = "unchanged"
    unclear = "unclear"


class Status(str, Enum):
    supported = "supported"
    uncertain = "uncertain"
    not_verifiable = "not_verifiable"


class Box(BaseModel):
    """Normalised 0-1000 coordinates, image = index within its set."""
    image: int = Field(ge=0, le=2)
    ymin: float
    xmin: float
    ymax: float
    xmax: float


# ---- What the vision model must return (a proposal, not a verdict) ----
class ProposedObject(BaseModel):
    name: str
    before: Optional[Box] = None
    after: Optional[Box] = None
    proposed_change: ChangeType
    match_confidence: float = Field(ge=0, le=1)
    # Does the OTHER view show the place where the object is/was, from a comparable angle?
    other_view_covers_location: bool
    note: str = ""


class LLMResult(BaseModel):
    objects: list[ProposedObject]


# ---- What the app reports ----
class EvidencePair(BaseModel):
    before_b64: Optional[str] = None  # JPEG, base64
    after_b64: Optional[str] = None


class Finding(BaseModel):
    name: str
    change: ChangeType
    status: Status
    reason: str
    extra_angle_request: Optional[str] = None
    evidence: Optional[EvidencePair] = None


class Report(BaseModel):
    supported: list[Finding]
    uncertain: list[Finding]
    not_verifiable: list[Finding]
    unchanged: list[Finding]
    metrics: dict