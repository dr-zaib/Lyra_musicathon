"""
Lyra backend — FastAPI.

Runtime seam: the Next frontend calls the backend; engine (data) + agent
(narration) compose the response. The engine is now the REAL trajectory engine
(`engine/`, via engine_bridge); the agent is still a stub for `message` /
`confidence` (the real datapizza agent lands once ANTHROPIC_API_KEY is set).

Two routes:
- POST /recommend  {seed_mood, shape}  -> Trajectory      (legacy / click-a-node)
- POST /turn       AgentTurnRequest     -> AgentTurn        (conversational seam)

Run (env managed by uv, Python 3.12):
    cd backend
    uv sync
    uv run uvicorn app:app --reload --port 8010
"""

import sys
from pathlib import Path

# make shared/schema.py importable (the contract)
sys.path.insert(0, str(Path(__file__).parent.parent / "shared"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from schema import (  # noqa: E402
    AgentTurn,
    AgentTurnRequest,
    EntryRequest,
    EntryResponse,
    JourneyRequest,
    NodeDistribution,
    RefillRequest,
    TrackCandidate,
    Trajectory,
)

# SWAP DONE: real engine (engine/) via the bridge, instead of mock_engine
from engine_bridge import build_trajectory, entry_candidates, refill_candidates, warm  # noqa: E402
import agent  # noqa: E402  (real datapizza+Claude agent: interpret + narrate)

app = FastAPI(title="Lyra backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

N_STEPS = 4  # trajectory length for the demo (each step = 1 analysis.search call)


class RecommendRequest(AgentTurnRequest):
    """Legacy click-a-node request — seed_mood/shape are inherited (optional)."""

    seed_mood: str = "Melancholia"
    shape: str = "deepen"


def _engine_trajectory(seed_mood: str, shape: str, end_mood: str | None = None,
                       shuffle: float = 0.0,
                       seed_distribution: dict | None = None) -> Trajectory:
    """Real engine → validated Trajectory, then the agent voices transition_reason.
    `shuffle` = the serendipity fraction (go-to ∪ discovery) from the intent.
    `seed_distribution` = the full ≤3-node weighted read → the journey's start."""
    traj = Trajectory(**build_trajectory(seed_mood, shape, n_steps=N_STEPS,
                                         end_node=end_mood, shuffle=shuffle,
                                         seed_distribution=seed_distribution))
    return agent.narrate(traj)


@app.on_event("startup")
def _startup():
    """Pre-load the embedding model so the first real request is fast."""
    try:
        warm()
    except Exception as exc:  # never block startup on warmup
        import logging
        logging.getLogger("lyra.backend").warning("warmup skipped: %s", exc)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/recommend", response_model=Trajectory)
def recommend(req: RecommendRequest) -> Trajectory:
    return _engine_trajectory(req.seed_mood, req.shape)


@app.post("/turn", response_model=AgentTurn)
def turn(req: AgentTurnRequest) -> AgentTurn:
    """One conversational turn. Intent from a click (seed_mood) or from the text
    via the agent (LLM); the engine then builds the journey."""
    if req.seed_mood:
        seed, shape = req.seed_mood, (req.shape or "deepen")
        sd = req.seed_distribution.weights if req.seed_distribution else None
        distribution, shuffle, confidence, message = (sd or {seed: 1.0}), 0.0, 1.0, ""
        end_mood = None
    else:
        intent = agent.interpret(req.message or "")
        seed = intent["seed_mood"]
        shape = req.shape or intent["shape"]
        distribution = intent["distribution"]
        shuffle, confidence, message = intent["shuffle"], intent["confidence"], intent["message"]
        end_mood = intent.get("end_mood")

    # start the journey from the full weighted read (≤3 nodes), not just the dominant;
    # a single-node read (e.g. a lone click) → None → the engine's fuzzy soft-start.
    seed_dist = distribution if (distribution and len(distribution) > 1) else None
    trajectory = _engine_trajectory(seed, shape, end_mood, shuffle, seed_dist)

    return AgentTurn(
        message=message,
        confidence=confidence,
        distribution=NodeDistribution(weights=distribution),
        shuffle=shuffle,
        trajectory=trajectory,
    )


# ---- playback flow: split seam (instant first audio, then the journey) --------
@app.post("/entry", response_model=EntryResponse)
def entry(req: EntryRequest) -> EntryResponse:
    """Read the mood and return a skippable list of entry candidates. The player
    starts candidate[0] immediately; the journey is built later via /journey."""
    if req.seed_distribution and req.seed_distribution.weights:
        # the full ≤3-node weighted read → entry candidates matched to the whole mix
        distribution, shuffle, confidence = req.seed_distribution.weights, 0.0, 1.0
    elif req.seed_mood:
        distribution, shuffle, confidence = {req.seed_mood: 1.0}, 0.0, 1.0
    else:
        intent = agent.interpret(req.message or "")
        distribution = intent["distribution"]
        shuffle, confidence = intent["shuffle"], intent["confidence"]

    cands = entry_candidates(distribution=distribution, n=req.n, known_new=req.known_new)
    return EntryResponse(
        confidence=confidence,
        distribution=NodeDistribution(weights=distribution),
        shuffle=shuffle,
        entry_candidates=[TrackCandidate(**c) for c in cands],
    )


@app.post("/journey", response_model=Trajectory)
def journey(req: JourneyRequest) -> Trajectory:
    """Build the playlist for the chosen shape, excluding what already played
    (entry track + skips). Queue it behind the entry track on the player."""
    seed_dist = req.seed_distribution.weights if req.seed_distribution else None
    traj = Trajectory(**build_trajectory(
        req.seed_mood, req.shape, n_steps=N_STEPS,
        end_node=req.end_mood, exclude_isrcs=req.exclude_isrcs,
        seed_distribution=seed_dist))
    return agent.narrate(traj)


@app.post("/refill", response_model=list[TrackCandidate])
def refill(req: RefillRequest) -> list[TrackCandidate]:
    """More candidates seeded on the centroid of what's left in the queue."""
    remaining = [c.model_dump() for c in req.remaining]
    cands = refill_candidates(remaining, exclude_isrcs=req.exclude_isrcs,
                              n=req.n, known_new=req.known_new)
    return [TrackCandidate(**c) for c in cands]
