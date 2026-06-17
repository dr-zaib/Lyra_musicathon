# Frontend handoff — for Alberto (from Axel, 2026-06-17)

The engine + agent + backend are **done and on `main`**. This is what's live, how the
two sides talk, and a task list to finish/limare the frontend **without breaking
anything**. Nothing here changes the contract you already adopted — it's mostly
config + a few alignments.

> **Product identity (locked):** Lyra is an **agentic recsys**, not a chatbot.
> Flow is **single-shot**: feeling in → journey out + narration. No
> "converse-until-ready" multi-turn loop. Your agent panel = a **narration feed**,
> not a chat. (Wheel, distribution/confidence, cited verse, responsive layout all stay.)

## How the two sides talk (unchanged contract)
```
web → POST /api/agent  → (BACKEND_URL/turn)  → Python backend → engine + agent
   in : AgentTurnRequest { message?, session_id?, seed_mood?, shape? }
   out: AgentTurn { message, confidence, distribution, shuffle, trajectory|null }
```
- Your `/api/agent` already proxies `BACKEND_URL/turn` and falls back to `mockAgent`
  if unset/unreachable → the demo never dies. **To use the real backend: set `BACKEND_URL`.**
- `trajectory.steps[]` → each: `target_distribution`, `selected_track`
  (`artist,title,isrc,spotify_id,has_richsync,track_rating,artwork_url,…`),
  `transition_reason` (agent's voice), `citable_verse`, `timestamp_in_song` (seconds).
- Audio = iTunes preview by ISRC/artist+title (your `/api/preview`); `preview_url`
  isn't filled by the engine — you enrich it as you already do.

## What the system does now (so the UI reflects it)
- **Single-shot turn**: one message (or a `seed_mood`/`shape` click) → the agent reads
  the feeling and the engine returns a full journey, narrated. No back-and-forth needed.
- **Intent** = up to **3 weighted nodes + `shuffle`** (neutral remainder);
  `sum(distribution.weights) + shuffle == 1`. `confidence` = wheel sharpness/fog.
- **`shuffle`** has a real behaviour server-side (go-to ∪ new-but-similar discovery).
- **Ban-list** + **karaoke timestamps** are handled server-side; nothing to do on the UI
  beyond showing the cited verse.

## Task list (priority order)

### P0 — make the real backend actually work
- [ ] **Raise the proxy timeout.** `web/src/app/api/agent/route.ts` uses
  `AbortSignal.timeout(8000)`, but a real turn takes **~14s** → it currently times out
  and silently falls back to the mock. Bump to **~25000–30000**. (Same for
  `/api/trajectory` if used.)
- [ ] **Set `BACKEND_URL`** (e.g. `http://localhost:8010` locally; the Replit URL in prod).
  Add a `web/.env.example` documenting `BACKEND_URL` (and `ELEVENLABS_API_KEY` for WS-V).
- [ ] **Loading state for ~14s/turn**: the "thinking" indicator must comfortably cover
  ~15s (you have one — just make sure it doesn't look stuck). Optional polish: a few
  rotating status lines ("reading the feeling…", "walking the catalog…", "citing the line…").

### P1 — align with the locked decisions
- [ ] **Read `shuffle` as a field, do NOT derive it.** `mockAgent.ts` sets
  `shuffle ≈ 1 − confidence`; the real agent sends `shuffle` **independently** (neutral
  remainder). Drive the wheel/serendipity from the returned `shuffle`, not from confidence.
  (Worth aligning `mockAgent` too, so the fallback matches.)
- [ ] **Drop the converse-until-ready loop.** The real backend returns a `trajectory`
  on the **first** turn (never `null`). The mock's multi-turn accumulation / "ready"
  gating no longer matches the product — treat each turn as a fresh single-shot read.
  (Keep the mock's **crisis-safety** reply — good to have; the real agent will own the
  robust version.)

### P2 — features that are ready to surface
- [ ] **Cited verse** in the player comes from real richsync now (`citable_verse` +
  `timestamp_in_song`). Show it as an **animated highlight** (NOT a hard seek into the
  30s preview — preview offset is unknown; full word-sync is a production/DSP feature).
  See `docs/HOW_IT_WORKS.md` §5.
- [ ] **WS-V — ElevenLabs voice-out** (your call): speak `message` + each
  `transition_reason`, duck the music, mute toggle. Needs `ELEVENLABS_API_KEY`.

### P3 — stretch
- [ ] **Mid-journey redirect**: clicking a node re-plans the rest of the queue from the
  current emotional position. Engine support is the same `build_trajectory` (start =
  current position) — we'll expose a small endpoint; you wire the trigger (node click /
  track end). Coordinate with Axel before building.

## Don't break
- The contract field names (`shared/schema.py` ↔ `web/src/lib/types.ts`) — change both in lockstep.
- The mock fallback path — keep it; it's our "demo never dies" safety net.

## Run the backend locally (to test against the real thing)
```bash
cd backend && uv sync && uv run uvicorn app:app --reload --port 8010
# then in web: BACKEND_URL=http://localhost:8010
```
Needs `MUSIXMATCH_API_KEY` + `ANTHROPIC_API_KEY` in `engine/.env`.
