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
- **Recsys, NOT a chatbot**: the agent reads the feeling and narrates the journey. It does
  **not** comment / summarize the prompt — `AgentTurn.message` is now empty by design. Don't
  render an empty agent bubble.
- **Intent** = up to **3 weighted nodes + `shuffle`** (neutral remainder);
  `sum(distribution.weights) + shuffle == 1`. `confidence` = wheel sharpness/fog.
- **`shuffle`** has a real behaviour server-side (go-to ∪ new-but-similar discovery).
- **Ban-list** + **karaoke timestamps** are handled server-side; nothing to do on the UI
  beyond showing the cited verse.

## ★ The playback flow (designed 2026-06-17 — the experience, "no loading screen, ever")
This supersedes the old "send message → wait → whole journey plays" behaviour. The point:
**hide the ~14s generation behind the first preview.** The player owns the timers/queue;
the engine gives a fast **entry** list + a **journey** playlist (endpoints being split — see
"Engine endpoints" below; until they exist, `/turn` returns a full trajectory you can treat
as the journey).

1. User states a mood → agent reads it → **an entry track starts playing immediately**
   (the first of an **N-candidate entry list**). No wait, no shape chosen yet, no comment.
2. **Skip** must work on the entry track *before any shape is chosen* → play the next entry
   candidate. (The queue auto-refills server-side; you just request more if you run low.)
3. **While the entry track plays**, the user can pick a shape — **all THREE**:
   **deep dive / evolution / escalation** (the UI currently only shows deepen+evolve — **add
   escalate**). On choice → engine builds that playlist → **queue it behind the entry track**;
   it starts when the entry track ends.
4. If the user **doesn't choose**, when the entry track is `X`s from the end
   (`X` = playlist-gen time + 1s; measure it, ~6–10s, fits inside a 30s preview) →
   **auto-generate** a mood-coherent playlist (≈ deep dive from the entry track).
5. The entry track **is** the first track of the playlist (don't double-play it).

**known/new ratio** (both the entry list and playlists): ~50/50 known (the user's go-to) +
new (discovery). Expose a **settings slider** (% known↔new) with an **automatic floor of
15–20% new**. The engine applies the ratio; the slider value rides along as a parameter.

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

### P1 — the playback flow (the experience above)
- [ ] **Entry track plays immediately** on mood read; **don't** wait for a shape choice.
- [ ] **Skip on the entry track** (before any shape) → next entry candidate.
- [ ] **Three shape buttons** while playing: deep dive / **evolution** / **escalation**
  (add the missing `escalate`). On choice → fetch the playlist → **queue it** behind the entry.
- [ ] **Auto-generate** the playlist at `X`s-before-end if no shape was chosen (timer).
- [ ] **Settings slider** known↔new with a 15–20% new floor (pass the value to the backend).
- [ ] **Drop the converse-until-ready loop** in the mock too (no multi-turn "ready" gating).
  Keep the mock's **crisis-safety** reply — the real agent will own the robust version.

### P1b — contract hygiene
- [ ] **Read `shuffle` as a field, do NOT derive it.** `mockAgent.ts` sets
  `shuffle ≈ 1 − confidence`; the real agent sends `shuffle` **independently** (neutral
  remainder). Drive the wheel/serendipity from the returned `shuffle`. Align `mockAgent` too.

### P2 — features that are ready to surface
- [ ] **Cited verse** in the player comes from real richsync now (`citable_verse` +
  `timestamp_in_song`). Show it as an **animated highlight** (NOT a hard seek into the
  30s preview — preview offset is unknown; full word-sync is a production/DSP feature).
  See `docs/HOW_IT_WORKS.md` §5.
- [ ] **WS-V — ElevenLabs voice-out** (your call): speak each step's `transition_reason`
  (the narration) as its track plays, duck the music, mute toggle. (`message` is empty now —
  there's no conversational line to speak.) Needs `ELEVENLABS_API_KEY`.

### P3 — stretch
- [ ] **Mid-journey redirect**: clicking a node re-plans the rest of the queue from the
  current emotional position. Engine support is the same `build_trajectory` (start =
  current position) — we'll expose a small endpoint; you wire the trigger (node click /
  track end). Coordinate with Axel before building.

## Engine endpoints (LIVE on branch `playback-flow` — field names LOCKED)
Types are mirrored in `shared/schema.py` ↔ `web/src/lib/types.ts` — **you can wire against
these now.** (HTTP-validated end-to-end; the agent's intent/narration need Anthropic credits,
but the engine path works regardless.)
- `POST /entry` — `EntryRequest { message?, seed_mood?, n=6, known_new? }` →
  `EntryResponse { confidence, distribution, shuffle, entry_candidates: TrackCandidate[] }`.
  Play `entry_candidates[0]` immediately; skip → `[1]`… The list is mood-coherent, mixing
  known (go-to) + new (discovery). **Latency ≈ 7s warm / 12s cold — NOT ~1s** (matching go-to to
  the mood needs live analysis). Still well under the old 14s, and the first preview then hides
  the journey gen. Show a brief "finding your opening track…" for those seconds.
- `POST /journey` — `JourneyRequest { seed_mood, shape, end_mood?, exclude_isrcs[], known_new? }`
  → `Trajectory` (narrated). Pass the ISRCs already played (entry + skips) in `exclude_isrcs`;
  queue the result behind the entry track.
- `POST /refill` — `RefillRequest { remaining: TrackCandidate[], exclude_isrcs[], n=6, known_new? }`
  → `TrackCandidate[]` (seeded on the centroid of `remaining`). Call when the queue drops below ~3.
- `POST /turn` still exists (one-shot `AgentTurn`) — fine as a fallback / simplest path.

> **Note on `/entry` speed**: ~7s isn't instant. If we want it snappier we can return the single
> best NEW candidate first (one search ~4s) and fill known in the background — tell me if the UX
> needs that. Don't over-build around a 1s assumption.

## Don't break
- The contract field names (`shared/schema.py` ↔ `web/src/lib/types.ts`) — change both in lockstep.
- The mock fallback path — keep it; it's our "demo never dies" safety net.

## Run the backend locally (to test against the real thing)
```bash
cd backend && uv sync && uv run uvicorn app:app --reload --port 8010
# then in web: BACKEND_URL=http://localhost:8010
```
Needs `MUSIXMATCH_API_KEY` + `ANTHROPIC_API_KEY` in `engine/.env`.
