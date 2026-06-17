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

**What it IS (positioning, locked 2026-06-17):** an **agentic recsys** — not a chatbot,
not a DSP. Lyra is **Musixmatch's lyrics-intelligence layer** that an existing DSP plugs
in to make its catalog *understood by meaning* (B2B2C) — showcasing the value of
Musixmatch's database, before Musixmatch ever builds its own DSP. The LLM is plumbing
(reads the feeling, narrates the journey); the **engine (the recsys) is the product**.
Flow is single-shot (feeling in → journey out + narration), not a conversation. See the
2026-06-17 decision-log entry for the catalog / go-to / audio model.

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
- `docs/FRONTEND_HANDOFF.md` — **Alberto's task list** to wire the frontend to the real backend without breakage (P0 timeout+`BACKEND_URL`, P1 shuffle/single-shot alignment, P2 verse+voice, P3 redirect).
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
  Audio is Deezer/iTunes 30s previews (NOT Musixmatch) → outside the constraint.
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
- ✅ **Backend wired to the real engine + real agent**: `POST /turn` `AgentTurnRequest → AgentTurn` and `POST /recommend → Trajectory` both run the real engine. **Agent = datapizza + Claude `claude-sonnet-4-6`**: `interpret` (text → ≤3 weighted nodes + `shuffle` + `confidence` + `shape` + `end_mood`; **no conversational reply — `message` is empty, Lyra is a recsys not a chatbot**) and `narrate` (each step's `transition_reason`, citing the verse). Validated end-to-end. ~14s/turn (parallelized + warmup).
- ✅ **Playback flow BUILT & merged (Axel, on `main`)**: split endpoints `POST /entry` (mood → skippable N-candidate list, known/new mix), `POST /journey` (shape + `exclude_isrcs` → narrated playlist), `POST /refill` (centroid-of-remaining → more candidates). Ban-list (`engine/data/user_prefs.json`) + `shuffle` serendipity (go-to ∪ discovery) live. Contract mirrored `schema.py` ↔ `types.ts`. Full flow validated end-to-end with the real agent. `/entry` ≈ 7s warm / 12s cold (matching go-to to the mood needs live analysis).
- ⚠️ **Honest implementation status (vs the design)**: journey length is a **fixed `N_STEPS = 4`** (entry track + 4 = ~5 tracks / ~2.5 min in demo) — **variable "arrive-then-radio" duration is NOT built**. Adaptivity that EXISTS: entry **skip + `/refill`** (refills toward the centroid of un-skipped candidates). Adaptivity that's **engine-ready but NOT wired**: mid-journey re-plan from the current position (`/journey` takes `exclude_isrcs`; needs a frontend trigger). **Roadmap**: variable duration, learning from skip/replay reactions (continuous re-ranking).
- ✅ **Frontend on the agent-turn contract (2026-06-17, Alberto)**: `web` calls `POST /api/agent` (`{message}` → `AgentTurn`), proxying `BACKEND_URL/turn` with a **local mock-agent fallback** (`web/src/lib/mockAgent.ts`) → Axel's `/turn` is plug-and-play, the demo never dies. Cited verse shown in the player. Mobile wheel = an **accumulating angular radar** (first mood strongest → weaker; one cohesive shape, tweened).
- ⚠️ **Contract semantics heads-up**: `mockAgent.ts` sets `shuffle ≈ 1 − confidence`, but the REAL agent sets `shuffle` *independently* (the neutral/serendipity remainder; `sum(distribution.weights) + shuffle == 1`). The frontend should read `shuffle` as a field, not derive it from `confidence`.
- ⏳ To do (frontend, Alberto — see `docs/FRONTEND_HANDOFF.md`): wire the playback flow to `/entry`+`/journey`+`/refill` (skip, three shape buttons incl. **escalate**, queue, auto-gen timer, known/new slider); read `shuffle` as a field; loading state; ElevenLabs voice-out (WS-V); deploy; pitch/cover/video.

## How we work
- Work on `main` (light process, no PR ceremony). Short branches only if needed.
- Keep `main` always demoable.
- **Update this file** when something is decided or the state changes.

## Decision log
- **2026-06-17** — **Audio = ISRC-first via Deezer, text fallback** (`web/src/app/api/preview`). The engine carries `isrc` on every `TrackCandidate`, so `/api/preview` resolves the 30s preview by **Deezer `track/isrc:<ISRC>`** (exact recording — free, no auth, no key; only full streaming is paid, which the host DSP owns in production), falling back to Deezer→iTunes text search. Fixes covers/namesakes + improves niche hit-rate; backwards compatible (works without isrc). Note: iTunes Search has **no** ISRC param — that's why exact match needed Deezer. (`SplitView` passes the isrc; pass `&isrc=` on any new preview calls.)
- **2026-06-17** — **Playback flow BUILT & merged to `main` (Axel)** — the design below is now implemented: `/entry` (skippable mood-coherent N-candidate list, known/new mix, ~7s warm), `/journey` (shape + `exclude_isrcs` → narrated playlist), `/refill` (centroid-of-remaining). Agent's conversational `reply` removed (`message` empty — recsys, not chatbot). **Honest gaps vs the design**: journey length still fixed at `N_STEPS=4`; the auto-gen timer / queue / known-new slider / mid-journey re-plan live on the **frontend** and aren't wired yet (engine supports re-plan via `exclude_isrcs`); variable duration + reaction-learning stay roadmap.
- **2026-06-17** — **Playback flow DESIGNED (Axel, demo target)** — the entry→skip→shape→playlist experience, "no loading screen, ever". (a) The user states a mood → the agent reads it → **an entry track starts playing immediately** (no wait); the agent does NOT pick the shape and does NOT comment (no chat — `message` is empty). (b) From the mood the engine prepares a **list of N entry candidates** so the user can **skip** the entry track without choosing a shape (dislike → next candidate). (c) **While the entry track plays**, the user picks a shape (deep dive / evolution / escalation — all THREE must be選choosable; the UI currently misses escalation): on choice → the engine builds that playlist and **queues it** behind the entry track. (d) If the user **doesn't choose**, when the entry track is `X` seconds from the end (`X` = playlist-gen time + 1s offset), the playlist **auto-generates** mood-coherent (≈ deep dive from the entry track). The entry track **is** the first track of the playlist. **This masks the ~14s latency behind the first preview → solves the "loading" problem.** **known/new ratio**: both the entry list and every playlist are ~50/50 **known** (go-to = the seed/user's tracks) + **new** (discovery = taste-seeded `analysis.search`, niche welcome), exposed as a **settings slider** (% known↔new) with an **automatic floor of 15–20% new** (no filter bubble). **Refill on skip** (demo): the candidate queue never empties — when it drops **below a threshold (e.g. <3)**, append more via `analysis.search` seeded on the **centroid of the remaining candidates' distributions** (similarity; ~free since each `TrackCandidate` already carries its distribution), alternating known/new, de-duped + ban-filtered. **Continuous re-ranking from skips (learning a negative signal) = production/roadmap, NOT demo.** Engine split needed: a fast **entry** call (mood → entry candidates) + a **journey** call (shape + entry → playlist); the player owns the timers/queue/auto-gen (frontend). See `docs/FRONTEND_HANDOFF.md`.
- **2026-06-16** — Discrete-graph architecture (no vector DB) confirmed; agent role defined (engine=data, agent=narration); frontend scaffold merged to main; audio via iTunes preview.
- **2026-06-16** — FastAPI backend scaffolded with MOCK engine+agent and swap point; Next→backend proxy with fallback; found Python <3.13 constraint for datapizza-ai.
- **2026-06-16** — Fixed/reproducible env adopted via uv (Python 3.12 pinned, uv.lock); datapizza-ai 0.1.0 verified on 3.12. Repo language: English only (app + docs).
- **2026-06-16** — Landing page = dynamic rotating emotional wheel (clockwise orbit, upright labels, comet accent) with the mood/direction questions in the center. The session screen still shows a wheel too (duplicate is OK for now). Aesthetic: violet, kept sober (not too mystical) — Musixmatch-adjacent, not a clone.
- **2026-06-16** — Engine built & validated (Axel). **WS-E gate PASSED**: Musixmatch `analysis.get` returns moods/themes/meaning, and **`analysis.search` works** (POST, params under a `data` key; ONE call → candidates + analysis + ranking over the whole catalog — the build plan's architectural key). Decision: **Strada B — analysis.search-primary + guardrails** (popularity floor via `track_rating`, `lyrics_language`, prefer `has_richsync`); the 303 Spotify seed becomes curated starting points / safety net, NOT the catalog. Soft-map = mpnet (all-mpnet-base-v2) embeddings + Claude fallback for ambiguous themes. Engine emits the contract `Trajectory` (deepen/evolve/escalate) with target-aligned citable verses. Bonus: `track_rating`/`num_favourite` restore the popularity signal Spotify denied (its /tracks endpoint 403s in dev mode). Spotify seed itself was read-only from the user's OWN playlists (dev-mode API limit).
- **2026-06-16** — Intent model + contract DECIDED (w/ Alberto). Intent `distribution` = **top-3 weighted macro-nodes + an explicit `shuffle`/neutral remainder** (no interaction = 100% shuffle = serendipity). Wheel renders the distribution (can be multi-peak); `confidence` controls sharpness/fog, not which emotions. Contract reframed to an **"agent turn"**: one conversational endpoint, `{message}` in → `{message, confidence, distribution, shuffle, trajectory|null}` out; `confidence`/`distribution` top-level; click-a-node = optional `seed_mood`/`shape` shortcut. Dwell-time %-weighting (10s budget per node, claims remaining budget) is a **post-demo extension**. Agent stays **datapizza** (Anthropic SDK fallback) — needs ANTHROPIC_API_KEY; open-source frameworks + commercial LLM APIs are not against the rules.
- **2026-06-17** — Karaoke / richsync framing decided. The engine captures `timestamp_in_song` = the moment the *cited verse* is sung in the FULL song. But the demo plays 30s iTunes previews (a window whose offset iTunes doesn't expose), so word-by-word karaoke synced to the preview is unreliable → **demo: the cited verse is an animated highlight** (emotional anchor), NOT a hard seek into the audio; **production (roadmap): full word-sync via a DSP playback integration** (Spotify/Apple SDK under a partnership), where full song + richsync align — `timestamp_in_song` is exactly what that needs, so it's not wasted. See `docs/HOW_IT_WORKS.md`.
- **2026-06-17** — Backend wired to the real engine + real agent (branch `engine-backend-wire`). Swap done via `backend/engine_bridge.py` (engine on sys.path, self-contained). New `POST /turn` returns `AgentTurn`; `/recommend` now runs the real engine too. Agent built with **datapizza-ai `AnthropicClient` (claude-sonnet-4-6)**, LLM-on-text-only: `interpret` (intent: ≤3 nodes + shuffle + confidence + shape + `end_mood` destination + reply) and `narrate` (transition_reason citing the verse). Added `end_mood` so `evolve` arrives somewhere coherent. Engine hardened against transient network/SSL errors. **Perf**: per-turn ~30-50s → ~14s (parallel `analysis.search` + batch embeddings + startup model warmup; CANDIDATES_PER_STEP 100→60). ANTHROPIC_API_KEY lives in `engine/.env`. NOTE: backend now pulls sentence-transformers/torch → heavier deploy footprint (Replit).
- **2026-06-16** — Input-modality scope fixed. **Demo input = text composer + click-a-node only.** Voice (STT in, ElevenLabs TTS out) and ambient / zero-input "readiness" (implicit feedback from skip/keep reactions + light context priors, e.g. driving) are **pitch/roadmap only — NOT built for the demo.** They are additive layers *upstream* of the same meaning-first pipeline, so they change neither the engine nor the contract. Rationale: "not knowing your exact mood" is already handled by the conversation + confidence (cloud→point) loop; voice/ambient strengthen the pitch (tie to ElevenLabs + the Memory mode) at zero cost to the demo.
- **2026-06-16** — Partner integrations reconsidered (Alberto). **ElevenLabs voice-OUT promoted to a DEMO feature** — Lyra *speaks* her short conversational replies + transition narration; the music ducks while she talks; a mute toggle is provided. **Input stays text + click (no STT)** — this supersedes the "voice-out is pitch-only" half of the line above, output-side only. **Cyanite kept pitch-only** — protect scope at 5 days out; it stays a pitch line (lyrics × audio fusion). Sentinel (songwriting tutor only) and Songstats (redundant w/ Musixmatch charts) remain out of the demo. ElevenLabs needs `ELEVENLABS_API_KEY` in `web/.env.local` (frontend, Alberto).
- **2026-06-17** — Frontend adopted the **agent-turn contract** end-to-end (Alberto). Single seam `POST /api/agent` (`AgentTurnRequest` → `AgentTurn`) proxies `BACKEND_URL/turn` and falls back to `web/src/lib/mockAgent.ts` (intent / safety / ready / confirm + mood accumulation all moved server-side) → the real backend swaps in with **zero frontend changes**, demo never dies. Mobile wheel finalized as an **accumulating radar graph**: moods accumulate by order of mention (first strongest = 1, then 0.62, 0.38…, earlier ones don't decay), one cohesive shape (floor), rAF-tweened. Cited verse wired into the player (placeholder until real richsync). Overnight autonomous run (branch `night/hardening-and-desktop-shape`): build-hardening + polish + a11y + contract/mock tests, and porting the radar shape to the desktop wheel.
- **2026-06-17** — **PRODUCT IDENTITY locked (Axel): Lyra is an *agentic recsys*, NOT a conversational system / chatbot.** The LLM is plumbing (read the feeling → distribution/shape; narrate the journey citing the verse), not the product. Flow = **single-shot**: feeling in (text or wheel) → trajectory out, narrated. **No "converse-until-ready" loop** — this supersedes that part of the conversational framing; the agent panel becomes a **narration feed**, not a chat. **Positioning**: Lyra is **Musixmatch's lyrics-intelligence LAYER that plugs into an existing DSP** (B2B2C), NOT another DSP/player — the world doesn't need more DSPs, it needs them to be *useful*. It exists to showcase the value of Musixmatch's database (a DSP integrates it to "understand" listeners by meaning, before Musixmatch ever builds its own DSP). **Catalog model**: recommend-from = the host DSP's catalog (demo stand-in: Musixmatch `analysis.search`); go-to / profile / bans = the host DSP's user data (demo stand-in: the 303 seed from the user's own playlists); audio = the host DSP's streaming (demo stand-in: iTunes 30s previews). Each demo piece is a stand-in for what the DSP provides in production; Lyra itself stays the same. **`shuffle` gets an engine behaviour**: vague/neutral input → shuffle path → recommend from the user's go-to (demo: the 303). **Ban/boycott list** = a negative filter (respect → Impact) → demo. **Redirect mid-journey** (re-plan from the current emotional position toward a node the user picks) = strong stretch. Real user profile / cold-start = roadmap.

## Next moves
- WS-A (agent): ✅ DONE — datapizza + Claude agent (`interpret` + `narrate`) live on `/turn`.
- WS-D (Axel): ✅ DONE — engine built + wired into the backend with karaoke timestamps.
- WS-E (shared): ✅ DONE — `analysis.search` validated, gate passed, Strada B adopted.
- WS-V (Alberto, frontend): **ElevenLabs voice-out** — `/api/tts` proxy + speak the agent's lines with music ducking + mute toggle. Needs `ELEVENLABS_API_KEY` in `web/.env.local`.
- ✅ **Ban-list + shuffle behaviour built (Axel, engine)**: `find_next_track` filters the user's banned artists/tracks at every tier (`engine/data/user_prefs.json`); `build_trajectory(shuffle=…)` draws a `shuffle` fraction of the journey from the user's go-to (the seed) ∪ new-but-similar discovery (taste-seeded `analysis.search`, open popularity), the rest aimed at targets. `/turn` passes the agent's `shuffle` through.
- **NEXT** — point `web` at the real backend end-to-end (`BACKEND_URL` → `/turn`) with a loading state (~14s/turn) or a progressive response.
- Deploy: backend on Replit, frontend on Vercel/Replit. Pitch + cover + video by the 21st.

## Open TODOs (design)
- Palette: decide whether to keep the violet aesthetic or move it closer to Musixmatch's brand (adapt, not clone).
- Session screen viz: rework the second-screen visualization — leaning toward a graph style, but the current one is standard and can be improved a lot.

## UX architecture (locked 2026-06-16)
> ⚠️ **Partly superseded (2026-06-17): Lyra is an agentic recsys, not conversational.** Drop the "converse-until-ready" multi-turn loop below — it's single-shot (feeling in → journey out + narration), and the agent panel is a **narration feed**, not a chat. The wheel, the distribution/confidence model, the cited verse and the responsive layout all stay. See the 2026-06-17 decision-log entry.
- **Split ~50/50**: left = animated emotional wheel (circumplex), right = agent conversation. The wheel is the persistent emotional map; the agent is the persistent spine.
- **Landing**: single large wheel + a "describe your mood" composer (text to the agent is the primary input; clicking a node is the quick alternative). On start, the wheel **docks to the left** (morph) and the agent panel slides in.
- **Path lives inside the conversation**: each track is a card in the agent thread (no separate path view). Player = persistent bottom bar (synced verse, auto-advance).
- **Wheel in session = interactive map**: click an emotion to tell the agent "take me there".
- **Responsive (mobile-first)**: the product is primarily phone. Base = mobile single column — the wheel is a **hero that collapses into a compact reactive header** (current mood + comprehension %); tap it to **expand full-screen as the interactive map**; the chat is the main surface; composer + comprehension + **mini-player** dock at the bottom. Desktop (`md:`+) = the 50/50 split (wheel left / agent right). Same components, different arrangement. Demo surface (phone vs laptop) TBD.
- **Input modalities**: input = text composer + click-a-node (no STT). **Output: Lyra has a voice — ElevenLabs TTS reads her conversational replies + transition narration (DEMO feature); music ducks under speech; mute toggle provided.** STT-in and ambient/hands-free "readiness" (implicit feedback from listening reactions + light context priors) stay **roadmap/pitch only** — additive upstream, no architecture/contract change. The point that the user often *can't name* their mood is a feature, not a gap: the conversation + confidence loop is the discovery mechanism.
- **Wheel = distribution, confidence = sharpness (refined 2026-06-16)**: the wheel renders the emotion `distribution` itself, which can be **genuinely multi-peak** — a confident *mix* (e.g. Joy + Nostalgia) shows as two clear points, NOT a fuzzy blob. `confidence` (0–1, from the LLM) controls the **sharpness/fog** of that rendering, not which emotions: low = haze, high = crisp. The comprehension bar shows confidence. It **never gates**. (Frontend note: the web app already renders this as an **angular radar graph** where moods **accumulate** across the conversation — dominant spike longest, one mood = a rhombus/arrow — matching the multi-peak model.)
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
