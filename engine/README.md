# Lyra engine

The deterministic core: it turns a **seed mood** into a **trajectory** — a short
emotional journey across the 12 macro-nodes — pulling real songs from the whole
Musixmatch catalog by *meaning* and citing the line that marks each passage.

> Contest rule: only identifiers + our own artifacts are persisted. Lyrics /
> richsync / analysis are Musixmatch **content** → fetched real-time per session,
> kept in memory, never written to disk.

## Modules
| file | role |
|------|------|
| `musixmatch.py` | API client: `match_track`, `get_analysis`, `richsync_lines`, **`search_analysis`** (POST, the meaning search — one call → candidates + analysis + ranking) |
| `taxonomy.py` | the 12 macro-nodes + glosses; cached **mpnet** embeddings (`data/node_embeddings.npz`) |
| `softmap.py` | mood/theme label → distribution over nodes (cosine + softmax; Claude fallback for ambiguous themes); `analysis_to_distribution`, `text_to_intent` (stub) |
| `trajectory.py` | operators **deepen / evolve / escalate** → `build_trajectory()` → the contract `Trajectory` dict, with popularity floor, `has_richsync` preference and richsync **karaoke timestamps** |
| `enrich_seed.py` | one-off: Spotify seed (`data/seed_tracks.json`) → Musixmatch ids/flags (`data/seed_enriched.json`) |
| `notebook.ipynb` | how the Spotify seed was built |

## Setup & run
```bash
cd engine
uv sync                       # Python 3.12 + deps (incl. sentence-transformers)
cp .env.example .env          # then fill MUSIXMATCH_API_KEY (+ ANTHROPIC_API_KEY for the agent/fallback)
```
Quick check (builds a real trajectory):
```python
import trajectory as traj
t = traj.build_trajectory("Solitude", "deepen", n_steps=4)
```

## Backend wire
The backend imports the engine via `backend/engine_bridge.py` (puts `engine/` on
`sys.path`; the engine is self-contained — loads `engine/.env`, caches embeddings).
- `POST /recommend {seed_mood, shape}` → `Trajectory` (real engine)
- `POST /turn` `AgentTurnRequest` → `AgentTurn` (the conversational seam)

```bash
cd backend && uv sync && uv run uvicorn app:app --reload --port 8010
```

## Contract
Engine output mirrors `shared/schema.py` (`Trajectory` → `steps[]` →
`{target_distribution, selected_track, transition_reason, citable_verse,
timestamp_in_song}`). The engine fills everything **except** `transition_reason`
(the agent's voice) — `confidence`, `distribution`, `shuffle`, `message` come from
the agent layer.

## TODO
- **Agent** (WS-A, needs `ANTHROPIC_API_KEY`): real intent reading (text →
  distribution + shuffle + confidence) and `transition_reason` citing the verse —
  replaces the `text_to_intent` stub and the empty `message`/`shuffle`.
- Fine-tune match precision at the extremes of `deepen` (catalog has few *popular*
  single-emotion songs); pick an even better citable line.
- `analysis.search` body schema is documented in `musixmatch_llms_full.txt`.
