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
    """Weight distribution over the macro-nodes. As an *intent* distribution it
    carries at most 3 non-zero nodes and its weights sum to (1 - shuffle); as a
    step/track distribution it sums to 1."""

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


# --- conversational seam: one endpoint, "message in → agent turn out" ---------
class AgentTurnRequest(BaseModel):
    """One conversational turn from the user → the agent (the single endpoint).
    `message` is the free-text input; `seed_mood`/`shape` are the optional
    click-a-node shortcut (bypass text interpretation). At least one of
    `message` or `seed_mood` should be set."""

    message: str | None = None
    session_id: str | None = None
    seed_mood: MacroNode | None = None
    shape: TrajectoryShape | None = None
    # the full weighted mood read (≤3 nodes) — the engine starts the journey from
    # this instead of collapsing to `seed_mood` alone. `seed_mood` stays the
    # dominant (back-compat). None → fall back to `seed_mood`.
    seed_distribution: NodeDistribution | None = None


class AgentTurn(BaseModel):
    """The agent's response for one turn. `confidence` and `distribution` update
    on EVERY turn — including pure-conversation turns where `trajectory` is None
    (the wheel + comprehension bar react before any journey is built)."""

    message: str                       # the agent's voice
    confidence: float = 0.0            # 0..1 — wheel sharpness/fog, NOT which emotions
    # intent: the user's mood read (≤3 non-zero nodes)
    distribution: NodeDistribution = Field(default_factory=NodeDistribution)
    shuffle: float = 0.0               # neutral remainder; sum(distribution.weights) + shuffle == 1
    trajectory: Trajectory | None = None


# --- playback flow: split seam (instant first audio, then the journey) ---------
# The flow (see docs/FRONTEND_HANDOFF.md): /entry gives the mood read + a list of
# entry candidates → the player starts candidate[0] immediately and lets the user
# skip; /journey builds the playlist for a chosen shape (queued behind the entry
# track); /refill tops the candidate queue up. known_new = fraction of NEW
# (discovery) tracks vs KNOWN (the user's go-to); the engine floors it at ~0.15.

class EntryRequest(BaseModel):
    message: str | None = None
    session_id: str | None = None
    seed_mood: MacroNode | None = None        # click-a-node shortcut (dominant)
    seed_distribution: NodeDistribution | None = None  # full ≤3-node weighted read
    n: int = 6                                 # how many entry candidates
    known_new: float | None = None            # % new (discovery); None → default


class EntryResponse(BaseModel):
    """Mood read + a skippable list of entry candidates (none chosen yet)."""

    confidence: float = 0.0
    distribution: NodeDistribution = Field(default_factory=NodeDistribution)
    shuffle: float = 0.0
    entry_candidates: list[TrackCandidate] = Field(default_factory=list)


class JourneyRequest(BaseModel):
    """Build the playlist for a chosen shape, from the entry mood/track outward."""

    seed_mood: MacroNode                                    # dominant (back-compat)
    seed_distribution: NodeDistribution | None = None       # full ≤3-node weighted read → journey start
    shape: TrajectoryShape
    end_mood: MacroNode | None = None
    exclude_isrcs: list[str] = Field(default_factory=list)   # already played (entry/skips)
    known_new: float | None = None
    session_id: str | None = None


class RefillRequest(BaseModel):
    """More candidates seeded on the centroid of what's left in the queue."""

    remaining: list[TrackCandidate] = Field(default_factory=list)
    exclude_isrcs: list[str] = Field(default_factory=list)
    n: int = 6
    known_new: float | None = None
    session_id: str | None = None
