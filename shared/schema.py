"""
Lyra — Contratto condiviso motore <-> agente.

Questa è la fonte di verità del contratto fra il trajectory engine (Axel)
e l'agent layer / frontend (Alberto). Bozza basata sul doc di build di Axel.

NB sul wire format: il JSON HTTP usa gli STESSI nomi snake_case di questi
modelli (nessuna trasformazione camelCase). Il frontend TS in `web/src/lib/types.ts`
rispecchia esattamente questi campi, così `model_dump()` di Pydantic finisce
dritto nel frontend senza layer di conversione.

Vincolo regole contest: nessun contenuto Musixmatch viene persistito. Questi
oggetti vivono in memoria per-sessione e si svuotano a fine sessione.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# I macro-nodi (tassonomia nostra, fissa). Vedi web/src/lib/taxonomy.ts per
# coordinate e colori usati dalla graph view.
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
    """Distribuzione di pesi sui macro-nodi (normalizzata, somma = 1)."""

    weights: dict[str, float] = Field(default_factory=dict)


class TrackCandidate(BaseModel):
    track_id: int
    artist: str
    title: str
    isrc: str | None = None
    spotify_id: str | None = None
    distribution: NodeDistribution
    has_richsync: bool = False
    track_rating: int = 0  # proxy popolarità
    similarity_score: float | None = None  # da track.lyrics.analysis.search

    # Arricchimento a runtime (NON dal motore — aggiunto dal frontend via iTunes).
    # Inclusi nel contratto solo per documentare la forma finale dell'oggetto.
    preview_url: str | None = None
    artwork_url: str | None = None


class TrajectoryStep(BaseModel):
    target_distribution: NodeDistribution
    selected_track: TrackCandidate
    transition_reason: str  # linguaggio naturale, la voce dell'agente
    citable_verse: str | None = None  # da track.richsync.get
    timestamp_in_song: float | None = None  # secondi, per il jump richsync


class Trajectory(BaseModel):
    shape: TrajectoryShape
    start_distribution: NodeDistribution
    steps: list[TrajectoryStep]
