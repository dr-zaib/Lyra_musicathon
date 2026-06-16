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
from engine_bridge import build_trajectory, text_to_intent  # noqa: E402
from agent import narrate  # noqa: E402

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


def _engine_trajectory(seed_mood: str, shape: str) -> Trajectory:
    """Real engine → validated Trajectory, with the stub agent narration."""
    traj = Trajectory(**build_trajectory(seed_mood, shape, n_steps=N_STEPS))
    return narrate(traj)  # stub: fills transition_reason (real agent replaces it)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/recommend", response_model=Trajectory)
def recommend(req: RecommendRequest) -> Trajectory:
    return _engine_trajectory(req.seed_mood, req.shape)


@app.post("/turn", response_model=AgentTurn)
def turn(req: AgentTurnRequest) -> AgentTurn:
    """One conversational turn. STUB agent: intent from a click (seed_mood) or
    from text via the embedding stub; `message` is empty until the LLM agent."""
    if req.seed_mood:
        seed = req.seed_mood
        distribution = {seed: 1.0}
        confidence = 1.0
    else:
        distribution, confidence = text_to_intent(req.message or "")
        seed = max(distribution, key=distribution.get) if distribution else "Melancholia"

    shape = req.shape or "deepen"
    trajectory = _engine_trajectory(seed, shape)

    return AgentTurn(
        message="",  # the agent's voice — filled once the LLM agent is wired
        confidence=confidence,
        distribution=NodeDistribution(weights=distribution),
        shuffle=0.0,  # the real agent derives shuffle; stub leaves none
        trajectory=trajectory,
    )
