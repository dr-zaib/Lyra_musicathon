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
    NodeDistribution,
    Trajectory,
)

# SWAP DONE: real engine (engine/) via the bridge, instead of mock_engine
from engine_bridge import build_trajectory, warm  # noqa: E402
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


def _engine_trajectory(seed_mood: str, shape: str, end_mood: str | None = None) -> Trajectory:
    """Real engine → validated Trajectory, then the agent voices transition_reason."""
    traj = Trajectory(**build_trajectory(seed_mood, shape, n_steps=N_STEPS, end_node=end_mood))
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
        distribution, shuffle, confidence, message = {seed: 1.0}, 0.0, 1.0, ""
        end_mood = None
    else:
        intent = agent.interpret(req.message or "")
        seed = intent["seed_mood"]
        shape = req.shape or intent["shape"]
        distribution = intent["distribution"]
        shuffle, confidence, message = intent["shuffle"], intent["confidence"], intent["message"]
        end_mood = intent.get("end_mood")

    trajectory = _engine_trajectory(seed, shape, end_mood)

    return AgentTurn(
        message=message,
        confidence=confidence,
        distribution=NodeDistribution(weights=distribution),
        shuffle=shuffle,
        trajectory=trajectory,
    )
