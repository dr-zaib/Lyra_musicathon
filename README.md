# Lyra

Discover music by what it actually says. A lyrics-first agent that moves you
through an **atlas of emotions** (mood/theme macro-nodes) and walks you from one
feeling to the next, citing the **line** that marks each passage.

## Structure (folder monorepo)

```
shared/        Engine <-> agent contract (cross-team source of truth)
  schema.py      Pydantic models — Axel side
web/           Next.js frontend + agent layer — Alberto side
  src/lib/types.ts   TS mirror of the contract (same snake_case names)
  src/app/api/       SEAM: engine mock + iTunes audio proxy
backend/       FastAPI service: mock engine + mock agent (swap points in app.py)
engine/        (Axel) real trajectory engine — to build
```

Folder boundaries = no git conflicts between the two.

## Run the frontend

```bash
cd web
npm install
npm run dev      # http://localhost:3000
```

Runs **on its own, without an API key**: audio is real (public iTunes previews),
the trajectory is mock (fallback when the backend is down).

## Run the backend

Python env is managed with **uv** (fixed/reproducible). Python is pinned to 3.12
because datapizza-ai needs `>=3.10,<3.13`.

```bash
cd backend
uv sync                                  # downloads Python 3.12 + installs locked deps
uv run uvicorn app:app --reload --port 8010
```

Then set `BACKEND_URL=http://localhost:8010` in `web/.env.local`. Engine and agent
are MOCK (`mock_engine.py`, `agent.py`); swap points are in `app.py`.

No uv? Fallback with plain pip (needs Python 3.12 installed):
```bash
py -3.12 -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## The seam (mock -> real engine)

Today `web/src/app/api/trajectory/route.ts` proxies the backend and falls back to
mock data (`web/src/lib/mockData.ts`) that respects the `/shared` contract. When
the real engine is ready, the backend swaps its import — **same JSON shape, the
frontend doesn't change**.

## Contest rule (important)

No Musixmatch content may be persisted: lyrics/richsync/analysis are fetched
**real-time per session** and wiped at session end. Only our own artifacts are
persistable (macro-node name embeddings). Audio is NOT Musixmatch content
(iTunes), so it's outside the constraint.
