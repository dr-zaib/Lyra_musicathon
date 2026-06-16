"""
Lyra — shared engine <-> agent contract.

Source of truth for the contract between the trajectory engine (Axel) and the
agent layer / frontend (Alberto). Draft based on Axel's build doc.

Wire format note: the HTTP JSON uses these exact snake_case names (no camelCase
conversion). The TS frontend in `web/src/lib/types.ts` mirrors these fields, so
Pydantic's `model_dump()` drops straight into the frontend with no conversion layer.

Contest rule: no Musixmatch content is persisted. These objects live in memory
per session and are wiped at session end.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# The macro-nodes (our fixed taxonomy). See web/src/lib/taxonomy.ts for the
# coordinates and colors used by the graph view.
MacroNode = Literal[
    "Melancholia",
    "Reflection",
    "Solitude",
    "Nostalgia",
    "Tenderness",
    "Hope",
    "Joy",
    "Awe",
    "Anxiety",
    "Anger",
    "Defiance",
    "Empowerment",
]

TrajectoryShape = Literal["deepen", "evolve", "escalate"]


class NodeDistribution(BaseModel):
    """Weight distribution over the macro-nodes (normalized, sums to 1)."""

    weights: dict[str, float] = Field(default_factory=dict)


class TrackCandidate(BaseModel):
    track_id: int
    artist: str
    title: str
    isrc: str | None = None
    spotify_id: str | None = None
    distribution: NodeDistribution
    has_richsync: bool = False
    track_rating: int = 0  # popularity proxy
    similarity_score: float | None = None  # from track.lyrics.analysis.search

    # Runtime enrichment (NOT from the engine — added by the frontend via iTunes).
    # Included in the contract only to document the final shape of the object.
    preview_url: str | None = None
    artwork_url: str | None = None


class TrajectoryStep(BaseModel):
    target_distribution: NodeDistribution
    selected_track: TrackCandidate
    transition_reason: str  # natural language, the agent's voice
    citable_verse: str | None = None  # from track.richsync.get
    timestamp_in_song: float | None = None  # seconds, for the richsync jump


class Trajectory(BaseModel):
    shape: TrajectoryShape
    start_distribution: NodeDistribution
    steps: list[TrajectoryStep]
