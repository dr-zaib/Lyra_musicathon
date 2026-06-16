"""
Lyra backend — FastAPI.

Runtime seam: the Next frontend calls POST /recommend; here engine (data) + agent
(narration) compose the Trajectory. Today engine/agent are MOCK; tonight they're
swapped for the real engine (Axel) + datapizza-ai agent without touching the
routes or the frontend.

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
from pydantic import BaseModel  # noqa: E402

from schema import Trajectory  # noqa: E402

# SWAP POINT: mock today -> `from engine import build_trajectory` tonight
from mock_engine import build_trajectory  # noqa: E402
from agent import narrate  # noqa: E402

app = FastAPI(title="Lyra backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    seed_mood: str = "Melancholia"
    shape: str = "deepen"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/recommend", response_model=Trajectory)
def recommend(req: RecommendRequest) -> Trajectory:
    trajectory = build_trajectory(req.seed_mood, req.shape)  # engine: data
    trajectory = narrate(trajectory)  # agent: narration
    return trajectory
