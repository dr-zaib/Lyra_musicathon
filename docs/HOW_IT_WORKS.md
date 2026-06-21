# How lyra works (engine + agent)

The listener expresses a feeling — in words or by touching the wheel — and lyra
builds an **emotional journey** of songs pulled *by meaning* from the whole
Musixmatch catalog, citing the **line** that marks each passage.

---

## 1. Prepared once (offline — our own artifacts)
- **Seed** (`engine/data/seed_tracks.json`, 303 tracks): extracted from Spotify
  playlists, 100% ISRC, enriched with Musixmatch `commontrack_id`s. Today it's a
  curated **safety net / starting points**, not the catalog.
- **Taxonomy + embeddings** (`engine/taxonomy.py` + `data/node_embeddings.npz`):
  the 12 emotional macro-nodes, vectorized once with **mpnet**. This is the only
  persisted content — it's ours.

## 2. What happens on each `/turn` (live, in memory, no Musixmatch content persisted)

```
user text
   │
   ▼  AGENT — interpret()        (datapizza + Claude claude-sonnet-4-6)
   │   reads the text → distribution (≤3 nodes) + shuffle + confidence
   │                    + shape (deepen/evolve/escalate) + end_mood + reply
   ▼  ENGINE — build_trajectory()
   │   1. operator (deepen/evolve/escalate) → a sequence of emotional "targets"
   │   2. per target: analysis.search on Musixmatch (by meaning) → ~60 candidates
   │   3. soft-map: each candidate's moods/themes → distribution over the 12 nodes
   │   4. pick the track nearest the target (popularity floor + prefer has_richsync)
   │   5. richsync → timestamp of the cited verse (see §5)
   ▼  AGENT — narrate()          (Claude)
   │   writes each step's transition_reason, citing the verse
   ▼
AgentTurn { message, confidence, distribution, shuffle, trajectory[...] }
```

**The key split:** the **engine** produces the *structured data* (deterministic);
the **LLM agent** does *language only* (intent + narration). The young framework
stays on a low-risk role.

## 3. Components
| Component | File | Role |
|---|---|---|
| Musixmatch client | `engine/musixmatch.py` | match, **analysis.search**, analysis.get, richsync (network-resilient) |
| Soft-map | `engine/softmap.py` | label → node distribution (mpnet + cache + batch `prewarm`) |
| Trajectory engine | `engine/trajectory.py` | operators + `build_trajectory` (parallelized) |
| Agent | `backend/agent.py` | `interpret` + `narrate` (datapizza + Claude) |
| API | `backend/app.py` | `POST /turn` → `AgentTurn`; `POST /recommend` → `Trajectory` |
| Bridge | `backend/engine_bridge.py` | makes the engine importable from the backend + startup warmup |
| Contract | `shared/schema.py` ↔ `web/src/lib/types.ts` | identical field-for-field |

## 4. The intent model
The agent reads the listener into an **intent distribution**: up to **3 weighted
macro-nodes** plus an explicit **`shuffle`** (neutral/serendipity) remainder
(`sum(weights) + shuffle == 1`; no interaction = 100% shuffle = surprise). The
wheel renders this distribution (it can be multi-peak); **`confidence`** controls
its sharpness/fog, not which emotions show.

## 5. What happens while you listen — and the richsync caveat
While a step plays:
```
[ step card ]  track playing (30s iTunes preview, emotional backdrop, auto-advance)
   ├─ the WHEEL reflects the step's distribution
   ├─ the agent's narration ("this passage, marked by…")
   └─ the cited VERSE shown as an animated highlight (Motion)
```

**richsync** is Musixmatch's word-by-word time-synced lyrics (`ts`/`te` in seconds
**of the full song**). We capture `timestamp_in_song` = the moment the *cited verse*
is sung in the full track.

**Caveat (honest):** the demo plays a **30s preview**, which is a *window* of the
song, and iTunes doesn't expose where that window starts. So the cited line (e.g.
at 195s) usually isn't inside the 30s clip — literal word-by-word karaoke synced to
the preview is **not reliable**. Therefore:
- **Demo**: the cited verse is a **displayed/animated highlight** (emotional anchor),
  not a hard seek into the 30s audio.
- **Production (roadmap)**: with full playback via a DSP integration (Spotify /
  Apple Music SDK, under a partnership), the full song + richsync align and the
  word-by-word karaoke works. `timestamp_in_song` is exactly what that needs — so
  it's captured, not wasted.

## 6. Performance & resilience
- **~14s/turn** (≈4s once the label cache is hot): parallel `analysis.search`,
  batch embeddings, model pre-warmed at startup.
- Transient network/SSL errors → retry/degrade. The demo never dies.

## 7. Contest rules — respected
Only **identifiers** + **our own artifacts** (node embeddings) are persisted.
Lyrics / richsync / analysis are Musixmatch **content** → fetched real-time, kept
in memory, never written to disk.

## 8. Still stubbed / pending
- The **frontend** isn't wired to `/turn` yet (Alberto).
- Branch `engine-backend-wire` not yet merged to `main`.
- Audio (iTunes preview) is added by the frontend via ISRC/spotify_id;
  `preview_url`/`artwork_url` are ready fields in the contract.
