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

## Docs
- `docs/HOW_IT_WORKS.md` — end-to-end walkthrough (engine + agent, the live turn, the richsync/listening model).
- `engine/README.md` — engine modules, setup, backend wire.

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
- ✅ **Engine built & validated (Axel, `engine/`)**: Spotify seed (303 tracks, 100% ISRC) → Musixmatch **WS-E gate PASSED** (`analysis.get` moods/themes/meaning; **`analysis.search` cracked** → candidates+analysis+ranking over the whole catalog) → soft-map (mpnet + Claude fallback) → trajectory engine (deepen/evolve/escalate) emitting the contract `Trajectory` with citable verses + richsync **karaoke timestamps**. **Strada B (analysis.search-primary)**.
- ✅ **Backend wired to the real engine + real agent** (branch `engine-backend-wire`): `POST /turn` `AgentTurnRequest → AgentTurn` (the conversational seam) and `POST /recommend → Trajectory` (legacy/click) both run the real engine. **Agent = datapizza + Claude `claude-sonnet-4-6`**: `interpret` (text → ≤3 weighted nodes + `shuffle` + `confidence` + `shape` + `end_mood` + a language-matched reply) and `narrate` (each step's `transition_reason`, citing the verse). Validated end-to-end (e.g. "grato ma mi manca qualcuno" → Tenderness→Hope with cited lines).
- ⏳ To do: **frontend → `/turn`** (Alberto), merge `engine-backend-wire` → `main`, deploy, pitch/cover/video. Perf: ~14s/turn (parallelized + warmup); progressive response (show message+wheel first, tracks after) is a possible UX win.

## How we work
- Work on `main` (light process, no PR ceremony). Short branches only if needed.
- Keep `main` always demoable.
- **Update this file** when something is decided or the state changes.

## Decision log
- **2026-06-16** — Discrete-graph architecture (no vector DB) confirmed; agent role defined (engine=data, agent=narration); frontend scaffold merged to main; audio via iTunes preview.
- **2026-06-16** — FastAPI backend scaffolded with MOCK engine+agent and swap point; Next→backend proxy with fallback; found Python <3.13 constraint for datapizza-ai.
- **2026-06-16** — Fixed/reproducible env adopted via uv (Python 3.12 pinned, uv.lock); datapizza-ai 0.1.0 verified on 3.12. Repo language: English only (app + docs).
- **2026-06-16** — Landing page = dynamic rotating emotional wheel (clockwise orbit, upright labels, comet accent) with the mood/direction questions in the center. The session screen still shows a wheel too (duplicate is OK for now). Aesthetic: violet, kept sober (not too mystical) — Musixmatch-adjacent, not a clone.
- **2026-06-16** — Engine built & validated (Axel). **WS-E gate PASSED**: Musixmatch `analysis.get` returns moods/themes/meaning, and **`analysis.search` works** (POST, params under a `data` key; ONE call → candidates + analysis + ranking over the whole catalog — the build plan's architectural key). Decision: **Strada B — analysis.search-primary + guardrails** (popularity floor via `track_rating`, `lyrics_language`, prefer `has_richsync`); the 303 Spotify seed becomes curated starting points / safety net, NOT the catalog. Soft-map = mpnet (all-mpnet-base-v2) embeddings + Claude fallback for ambiguous themes. Engine emits the contract `Trajectory` (deepen/evolve/escalate) with target-aligned citable verses. Bonus: `track_rating`/`num_favourite` restore the popularity signal Spotify denied (its /tracks endpoint 403s in dev mode). Spotify seed itself was read-only from the user's OWN playlists (dev-mode API limit).
- **2026-06-16** — Intent model + contract DECIDED (w/ Alberto). Intent `distribution` = **top-3 weighted macro-nodes + an explicit `shuffle`/neutral remainder** (no interaction = 100% shuffle = serendipity). Wheel renders the distribution (can be multi-peak); `confidence` controls sharpness/fog, not which emotions. Contract reframed to an **"agent turn"**: one conversational endpoint, `{message}` in → `{message, confidence, distribution, shuffle, trajectory|null}` out; `confidence`/`distribution` top-level; click-a-node = optional `seed_mood`/`shape` shortcut. Dwell-time %-weighting (10s budget per node, claims remaining budget) is a **post-demo extension**. Agent stays **datapizza** (Anthropic SDK fallback) — needs ANTHROPIC_API_KEY; open-source frameworks + commercial LLM APIs are not against the rules.
- **2026-06-17** — Karaoke / richsync framing decided. The engine captures `timestamp_in_song` = the moment the *cited verse* is sung in the FULL song. But the demo plays 30s iTunes previews (a window whose offset iTunes doesn't expose), so word-by-word karaoke synced to the preview is unreliable → **demo: the cited verse is an animated highlight** (emotional anchor), NOT a hard seek into the audio; **production (roadmap): full word-sync via a DSP playback integration** (Spotify/Apple SDK under a partnership), where full song + richsync align — `timestamp_in_song` is exactly what that needs, so it's not wasted. See `docs/HOW_IT_WORKS.md`.
- **2026-06-17** — Backend wired to the real engine + real agent (branch `engine-backend-wire`). Swap done via `backend/engine_bridge.py` (engine on sys.path, self-contained). New `POST /turn` returns `AgentTurn`; `/recommend` now runs the real engine too. Agent built with **datapizza-ai `AnthropicClient` (claude-sonnet-4-6)**, LLM-on-text-only: `interpret` (intent: ≤3 nodes + shuffle + confidence + shape + `end_mood` destination + reply) and `narrate` (transition_reason citing the verse). Added `end_mood` so `evolve` arrives somewhere coherent. Engine hardened against transient network/SSL errors. **Perf**: per-turn ~30-50s → ~14s (parallel `analysis.search` + batch embeddings + startup model warmup; CANDIDATES_PER_STEP 100→60). ANTHROPIC_API_KEY lives in `engine/.env`. NOTE: backend now pulls sentence-transformers/torch → heavier deploy footprint (Replit).
- **2026-06-16** — Input-modality scope fixed. **Demo input = text composer + click-a-node only.** Voice (STT in, ElevenLabs TTS out) and ambient / zero-input "readiness" (implicit feedback from skip/keep reactions + light context priors, e.g. driving) are **pitch/roadmap only — NOT built for the demo.** They are additive layers *upstream* of the same meaning-first pipeline, so they change neither the engine nor the contract. Rationale: "not knowing your exact mood" is already handled by the conversation + confidence (cloud→point) loop; voice/ambient strengthen the pitch (tie to ElevenLabs + the Memory mode) at zero cost to the demo.

## Next moves
- WS-A (agent): ✅ DONE — datapizza + Claude agent (`interpret` + `narrate`) live on `/turn`.
- WS-D (Axel): ✅ DONE — engine built + wired into the backend with karaoke timestamps.
- WS-E (shared): ✅ DONE — `analysis.search` validated, gate passed, Strada B adopted.
- **NEXT — Frontend → `/turn`** (Alberto): point `BACKEND_URL` at the backend; consume `AgentTurn` (drive wheel from `distribution`+`confidence`+`shuffle`, render `trajectory` cards, jump via `timestamp_in_song`). Add a loading state (~14s/turn) or a progressive response.
- **NEXT — Merge** `engine-backend-wire` → `main`; then deploy (backend Replit, frontend Vercel/Replit) + pitch/cover/video by the 21st.
- Deploy: backend on Replit, frontend on Vercel/Replit. Pitch + cover + video by the 21st.

## Open TODOs (design)
- Palette: decide whether to keep the violet aesthetic or move it closer to Musixmatch's brand (adapt, not clone).
- Session screen viz: rework the second-screen visualization — leaning toward a graph style, but the current one is standard and can be improved a lot.

## UX architecture (locked 2026-06-16)
- **Split ~50/50**: left = animated emotional wheel (circumplex), right = agent conversation. The wheel is the persistent emotional map; the agent is the persistent spine.
- **Landing**: single large wheel + a "describe your mood" composer (text to the agent is the primary input; clicking a node is the quick alternative). On start, the wheel **docks to the left** (morph) and the agent panel slides in.
- **Path lives inside the conversation**: each track is a card in the agent thread (no separate path view). Player = persistent bottom bar (synced verse, auto-advance).
- **Wheel in session = interactive map**: click an emotion to tell the agent "take me there".
- **Responsive (mobile-first)**: the product is primarily phone. Base = mobile single column — the wheel is a **hero that collapses into a compact reactive header** (current mood + comprehension %); tap it to **expand full-screen as the interactive map**; the chat is the main surface; composer + comprehension + **mini-player** dock at the bottom. Desktop (`md:`+) = the 50/50 split (wheel left / agent right). Same components, different arrangement. Demo surface (phone vs laptop) TBD.
- **Input modalities**: demo = text composer + click-a-node. Voice (STT → same text pipeline; ElevenLabs as Lyra's voice out) and ambient/hands-free "readiness" (implicit feedback from listening reactions + light context priors) are **roadmap/pitch only** — additive upstream, no architecture/contract change. The point that the user often *can't name* their mood is a feature, not a gap: the conversation + confidence loop is the discovery mechanism.
- **Wheel = distribution, confidence = sharpness (refined 2026-06-16)**: the wheel renders the emotion `distribution` itself, which can be **genuinely multi-peak** — a confident *mix* (e.g. Joy + Nostalgia) shows as two clear points, NOT a fuzzy blob. `confidence` (0–1, from the LLM) controls the **sharpness/fog** of that rendering, not which emotions: low = haze, high = crisp. The comprehension bar shows confidence. It **never gates**.
- **Intent = top-3 weighted moods + neutral/shuffle (decided 2026-06-16)**: the intent `distribution` carries **at most 3 macro-nodes**, weighted in %. Two input modes, same output: (a) **text** → the agent extracts the top-3 moods + their %; (b) **map** → the user picks nodes on the wheel. The unallocated remainder is an explicit **`shuffle`** (neutral) weight: no interaction = 100% shuffle = serendipity/surprise (the great mobile default — do nothing, Lyra still starts). **Extension (post-demo)**: in map mode the % is set by **dwell time** — each node has its own 10s window and claims `(held/10) × remaining_budget` (hold one node 10s = 100%; release early leaves room for shuffle). The same %-weighting applies to the text reading.
- **→ Agent contract (DECIDED 2026-06-16, w/ Alberto)** — the seam is reframed from "request a trajectory" to an **"agent turn"** (one conversational endpoint, message in / turn out). Resolutions:
  1. **`confidence` lives top-level** of the turn (it updates every turn, incl. pure-conversation turns with no trajectory) — not inside `Trajectory`.
  2. **The wheel is driven by the intent `distribution`** (agent's read of the *user's* mood) during conversation; the in-playback step uses its own `target_distribution`. Two sources, by phase.
  3. **One door, a `message` field** (no separate `/interpret`): the agent decides per turn whether to also emit a trajectory.
  Proposed shapes (update `shared/schema.py` ↔ `web/src/lib/types.ts` in lockstep):
  - Request (turn): `{ message: string, session_id? }` (+ optional `seed_mood`/`shape` for the click-a-node shortcut).
  - Response (turn): `{ message, confidence: float, distribution: NodeDistribution, shuffle: float, trajectory: Trajectory | null }`.
- **Trajectory shape stays first-class**: deepen/evolve/escalate may be agent-inferred, but the journey must be *legible* to the user (the agent names it in friendly verbs). Don't let the shapes go invisible in the conversational flow.
- Animation reference: see the chat prototypes (v4 wheel morph + split). Real impl uses Motion; can be pushed further (orbit-out, particles) later.
