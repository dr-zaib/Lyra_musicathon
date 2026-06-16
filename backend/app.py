"""
Lyra backend — FastAPI.

Cucitura runtime: il frontend Next chiama POST /recommend; qui engine (dati) +
agent (narrazione) compongono la Trajectory. Oggi engine/agent sono MOCK; stasera
si sostituiscono con engine reale (Axel) + agente datapizza-ai senza toccare le
route né il frontend.

Avvio:
    cd backend
    python -m venv .venv && .venv\\Scripts\\activate   (Windows)
    pip install -r requirements.txt
    uvicorn app:app --reload --port 8000

NB: l'agente reale (datapizza-ai) richiede Python >=3.10,<3.13. Usare un venv 3.12.
"""

import sys
from pathlib import Path

# rende importabile shared/schema.py (il contratto)
sys.path.insert(0, str(Path(__file__).parent.parent / "shared"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from schema import Trajectory  # noqa: E402

# SWAP POINT: oggi mock, stasera -> from engine import build_trajectory
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
    trajectory = build_trajectory(req.seed_mood, req.shape)  # engine: dati
    trajectory = narrate(trajectory)  # agent: narrazione
    return trajectory
