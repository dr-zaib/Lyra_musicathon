# CLAUDE.md — Lyra (shared brain)

> Living document read by **both Claude Code agents** on the team (Alberto + Axel).
> Update it whenever we make a decision or the state changes, so the two agents
> share the same mental model without passing MD files around by hand.
> **Everything in this repo — app and docs — is written in English** (accessibility).

## What Lyra is
A lyrics-first music agent for the **Musixmatch Musicathon** (Jun 15–21, 2026).
The user moves through an **atlas of emotions** (mood/theme macro-nodes); Lyra
walks them from one feeling to the next along a **trajectory** and cites the
**line** (richsync) that marks each passage. Single contest mode: **Discover**.
(Learn/Memory are only mentioned in the pitch.)

## Team & ownership (folder boundaries → no git conflicts)
- **Alberto** → `web/` (Next.js frontend) + agent layer (narration) + frontend deploy.
- **Axel** → `engine/` (trajectories, ML, soft-mapping, richsync align) + seed dataset + Python backend.
- **Shared** → `shared/` (the contract) and this file.

## Runtime architecture (target)
```
Next (web/, Alberto) ──HTTP──> Python backend (FastAPI) ──> Musixmatch API
                                ├─ agent/  (datapizza-ai, narration)  ← co-build
                                └─ engine/ (trajectories, Axel)
```
Two seams: `web → backend` (HTTP, same JSON) and `agent ↔ engine` (`shared/`).
The `backend/` is up (FastAPI, `POST /recommend`) with **MOCK engine and agent**
(`backend/mock_engine.py`, `backend/agent.py`). Swap point in `app.py`: tonight
`mock_engine` → real `engine/` (Axel), `agent` → datapizza-ai.
`web/src/app/api/trajectory` proxies the backend via `BACKEND_URL` and **falls
back to the local mock** (`web/src/lib/mockData.ts`) if the backend is down → the
demo never dies.

## Python environment (fixed / reproducible)
Managed with **uv**. Python is pinned to **3.12** (`.python-version`) because
datapizza-ai requires `>=3.10,<3.13` (the dev machine has 3.14). The exact set of
packages is locked in `uv.lock`; `requirements.txt` is an exported pinned fallback.
- Setup (both machines): `cd backend && uv sync` — uv downloads Python 3.12 and
  installs the locked deps. Identical environment for everyone.
- Run: `uv run uvicorn app:app --reload --port 8010`.
- Add a package: `uv add <pkg>` (updates `pyproject.toml` + `uv.lock`), then
  `uv export --no-hashes --no-dev -o requirements.txt` to refresh the fallback.
- datapizza-ai 0.1.0 is verified to install on 3.12.

## The contract
`shared/schema.py` (Pydantic, Axel side) ↔ `web/src/lib/types.ts` (Alberto side),
**field-for-field identical, snake_case**. Pydantic's `model_dump()` drops straight
into the frontend with no conversion. If you change a field, change it in both.

## Agent decision (datapizza-ai)
Young framework (v0.x) → keep it in a **low-risk role**:
- **Engine (deterministic)** produces the structured `Trajectory` data.
- **Agent (LLM, claude-sonnet-4-6)** does language only: intent → `seed_mood`+`shape`,
  and generates `transition_reason` citing `citable_verse`. It does NOT emit the Trajectory.
- Fallback if datapizza fights us: the Anthropic SDK directly (low switch cost).
- The agent is a **co-build (Alberto+Axel)** in a dedicated session.

## Contest rules (do NOT violate)
- **No persistent storage of Musixmatch content** (lyrics/richsync/analysis):
  fetch real-time per session, wipe at session end. No lyrics vector DB.
  Only our own artifacts are persistable (e.g. macro-node name embeddings).
  Audio is iTunes/Deezer (NOT Musixmatch) → outside the constraint.
- **Must use ≥1 Musixmatch API surface** in a meaningful way.
- **Judging**: Originality 25% · Craft 25% · Use of Musixmatch API 25% · Impact 25%.
- **Submission deadline: Jun 21, 2026, 23:59 CEST** (rules contradict themselves on the 22nd → treat the 21st as the wall).
- **Submission**: public repo + (demo URL *or* 90s video) + cover image + title/one-liner/description.

## Current state
- ✅ `web/` scaffold (Next 16 + TS + Tailwind v4) on `main`.
- ✅ Working Discover skeleton: MoodPicker → circumplex wheel → step card (cited line) → player with auto-advance. **Real iTunes audio**, mock trajectory.
- ✅ Contract `shared/schema.py` + `web/src/lib/types.ts`.
- ✅ FastAPI backend (`backend/`) with MOCK engine+agent; Next→backend seam verified end-to-end.
- ✅ Interactive emotional wheel + "karaoke" line synced to audio (Motion).
- ✅ Fixed Python env via uv (3.12 + uv.lock); datapizza-ai install validated.
- ⏳ Real agent (datapizza) + engine: to build (agent tonight, co-build).

## How we work
- Work on `main` (light process, no PR ceremony). Short branches only if needed.
- Keep `main` always demoable.
- **Update this file** when something is decided or the state changes.

## Decision log
- **2026-06-16** — Discrete-graph architecture (no vector DB) confirmed; agent role defined (engine=data, agent=narration); frontend scaffold merged to main; audio via iTunes preview.
- **2026-06-16** — FastAPI backend scaffolded with MOCK engine+agent and swap point; Next→backend proxy with fallback; found Python <3.13 constraint for datapizza-ai.
- **2026-06-16** — Fixed/reproducible env adopted via uv (Python 3.12 pinned, uv.lock); datapizza-ai 0.1.0 verified on 3.12. Repo language: English only (app + docs).
- **2026-06-16** — Landing page = dynamic rotating emotional wheel (clockwise orbit, upright labels, comet accent) with the mood/direction questions in the center. The session screen still shows a wheel too (duplicate is OK for now). Aesthetic: violet, kept sober (not too mystical) — Musixmatch-adjacent, not a clone.

## Next moves
- WS-A (Alberto+Axel, session): build the datapizza-ai agent.
- WS-D (Axel): real engine filling the contract.
- WS-E (shared, post-key): validate `track.lyrics.analysis.search` as a blocking gate.
- Deploy: backend on Replit, frontend on Vercel/Replit. Pitch + cover + video by the 21st.

## Open TODOs (design)
- Palette: decide whether to keep the violet aesthetic or move it closer to Musixmatch's brand (adapt, not clone).
- Session screen viz: rework the second-screen visualization — leaning toward a graph style, but the current one is standard and can be improved a lot.

## UX architecture (locked 2026-06-16)
- **Split ~50/50**: left = animated emotional wheel (circumplex), right = agent conversation. The wheel is the persistent emotional map; the agent is the persistent spine.
- **Landing**: single large wheel + a "describe your mood" composer (text to the agent is the primary input; clicking a node is the quick alternative). On start, the wheel **docks to the left** (morph) and the agent panel slides in.
- **Path lives inside the conversation**: each track is a card in the agent thread (no separate path view). Player = persistent bottom bar (synced verse, auto-advance).
- **Wheel in session = interactive map**: click an emotion to tell the agent "take me there".
- **Comprehension bar** (bottom of the agent panel): the % is the **agent's own confidence** (the LLM returns `confidence` 0–1), NOT a turn counter. As confidence rises, the wheel collapses from a multi-emotion **cloud → a single sharp point**. It **never gates** — you can always proceed.
- **→ Agent contract addition (for Axel)**: the agent / `/recommend` response should include `confidence: float (0..1)` and the emotion `distribution`, so the frontend can drive the comprehension bar + wheel reaction.
- Animation reference: see the chat prototypes (v4 wheel morph + split). Real impl uses Motion; can be pushed further (orbit-out, particles) later.
