# lyra — Product Vision

> The extended product document: what lyra is meant to be, the full experience and
> architecture, **what the Musicathon demo deliberately scoped down (and why)**, and the
> roadmap from MVP to product. For the 1-page elevator version see [`PITCH.md`](./PITCH.md);
> for the technical walkthrough of the demo see [`HOW_IT_WORKS.md`](./HOW_IT_WORKS.md).

---

## 1. What lyra is

**lyra is a lyrics-first music *agent* — an agentic recommender that understands songs by what their words actually say, and walks a listener through an emotional journey rather than handing them a flat list.**

Positioning matters: **lyra is not another DSP, and not a chatbot.** It is **Musixmatch's lyrics-intelligence layer** that an existing streaming service (Spotify, Apple Music, a regional DSP…) plugs in to make its own catalog *understood by meaning* (B2B2C). The world doesn't need more players; it needs the ones we have to be *useful*. lyra exists to showcase the value of Musixmatch's database: a DSP integrates it to understand listeners by **feeling and theme**, before Musixmatch ever builds a player of its own.

The thesis: **the richest signal in music is the most underused.** Every mainstream recommender matches the *surface* — genre, tempo, an audio fingerprint, collaborative-filtering co-listens. But the reason a song *lands* is usually in the words: the theme, the story, the feeling underneath. lyra starts there.

The LLM is **plumbing** (it reads the feeling and narrates); the **engine — the recsys — is the product.**

---

## 2. The full experience

### 2.1 Meet the listener where they are
- **Natural language in.** Describe a feeling the way you'd say it to a friend — *"restless but quietly hopeful"* — and lyra resolves it into a weighted emotional state.
- **The wheel.** Or pick up to three emotions on a circumplex of twelve macro-emotions. Text and taps feed **one** model, not two.
- **Voice & ambient (vision).** Speak your mood (STT in) and let lyra *speak back* (TTS narration, music ducking under her voice). Beyond explicit input: an ambient, near-zero-input "readiness" that reads implicit feedback (what you skip, what you stay with) and light context (e.g. driving) — because the point that *you often can't name your mood* is a feature, not a gap.

### 2.2 A journey, not a pile
From the starting feeling lyra plots a **trajectory** across the emotional space:
- **Deep dive** — settle deeper into the same feeling.
- **Evolution** — move to an adjacent or distant emotional region; repeated, it explores the whole wheel.
- **Escalation** — climb in energy/intensity.

Each step cites the **actual lyric line** (Musixmatch richsync) that marks the passage — the emotional anchor of the transition. The playlist has an **arc**, not a loop.

### 2.3 Steer in real time
*More like this · change the mood · raise the energy* reshape the **upcoming** queue and the path it takes — **without cutting the song that's playing.** The listener is always driving; choosing a mode **re-selects the emotional constellation** the journey heads toward, and the map redraws.

### 2.4 See the feeling
A living **3D emotional compass** — the twelve-emotion wheel — turns to the dominant feeling and traces the constellation of the current mood. Depth is not decoration: it maps the **emotional distance** travelled.

### 2.5 Three modes (one engine)
The same lyrics-understanding engine powers more than discovery:
- **Discover** *(the demo)* — the journey described above.
- **Learn** *(vision)* — an adaptive **songwriting tutor** that curates real lyrical examples for what you're trying to write and evolves with your feedback, with fingerprint/originality checks (e.g. Sentinel).
- **Memory** *(vision)* — resurfaces a song you loved a year ago, in the same season or emotional moment.

### 2.6 Mobile-first — where music actually happens
Music is lived on the phone, and DSPs are **mobile-first** — so lyra is too. The build ships a **dedicated mobile experience**, not a shrunk desktop page: a portrait-tuned **compass-first** layout, a keyboard-aware composer (the input rides above the on-screen keyboard), the steer controls and a slim player — with a desktop split view as the secondary surface. Since lyra is meant to **embed inside a host DSP** (overwhelmingly used on mobile), the phone is the primary surface, not a responsive afterthought.

---

## 3. Production architecture

In production lyra is a **layer inside a host DSP**. Three things come from the DSP; lyra itself stays the same:

| Concern | In production (host DSP) | In the demo (stand-in) |
|---|---|---|
| **Catalog** to recommend from | the DSP's full catalog | Musixmatch `analysis.search` over the catalog |
| **User profile** (go-to tracks, bans, history) | the DSP's user data | a 303-track seed from the user's own playlists |
| **Audio** playback | the DSP's licensed streaming | Deezer/iTunes 30s previews |

**The engine** (unchanged across demo and production):
1. A **discrete graph of macro-emotional nodes** (our taxonomy: a valence × energy circumplex), populated **in real time per session** from Musixmatch's `track.lyrics.analysis` and `analysis.search`.
2. Each song **soft-maps** onto the nodes via embedding similarity between its Musixmatch moods/themes and our node labels — preserving Musixmatch's semantic richness inside a structure the product can reason over.
3. A **trajectory operator** walks the space (deepen/evolve/escalate), interpolating from the listener's start constellation to a destination and picking, at each step, a catalog track whose meaning sits nearest the target.

**Scaling the semantics.** The demo maps per session. At catalogue scale the same structure gains a **persistent semantic layer** — vector embeddings of lyrics under commercial licence, or **Musixmatch's own Music Lens** as the upstream engine — to refine *within-node* selection across millions of tracks. The graph stays the narrative/UX backbone.

**Audio fusion (vision).** Voice texture, energy and sonic intensity (e.g. via **Cyanite**) join as upstream analysis, unlocking trajectory shapes lyrics alone can't express (lyrics × audio).

---

## 4. The demo (MVP) — what it is, and what we scoped down

The Musicathon build is a **deliberate MVP**, not a thin prototype: a **self-contained Discover experience** that proves the engine end-to-end on real Musixmatch data. Several choices were forced by the **contest rules** and the 7-day window — they are *scoping decisions*, not the product's ceiling.

**Shaped by the rules:**
- **No persistent storage of Musixmatch content.** Lyrics/richsync/analysis are fetched **real-time per session and wiped** — so there is **no lyrics vector DB** and **no persistent user profile** in the demo. Learning is **within-session** only.
- **Stand-ins for the DSP** (catalog / profile / audio — see the table above), because a hackathon team has no DSP backend.

**Intentionally out of the MVP (built as vision/roadmap):**
- **Variable "arrive-then-radio" duration** — the demo uses a fixed journey length.
- **Continuous learning from reactions** (skip/replay → live re-ranking) — the demo has entry **skip + refill** only.
- **Mid-journey redirect** from the current position toward a picked node — the engine supports it (`exclude_isrcs` + re-plan); not surfaced in the demo UI.
- **Voice (STT/TTS) and ambient readiness**, **multilingual** catalog + **verse translation**, **persistent profile / cold-start**, and the **Learn / Memory** modes.

What the MVP *does* show, for real: natural-language **and** wheel input → a narrated **trajectory** of real tracks chosen by lyrical meaning, with the **cited verse** per step, live **steering** that re-selects the constellation, recommendation **diversity**, a **ban-list** (respect by design), and the 3D compass — all on the Musixmatch API.

---

## 5. Roadmap

**Near term (post-MVP):**
- Wire mid-journey redirect into the UI; variable journey duration ("arrive, then radio").
- Reaction learning: skip/replay as signals for continuous, in-session re-ranking.
- ElevenLabs voice-out (lyra speaks her transitions; music ducks).
- "Show translation" of the cited verse (Musixmatch translation surface) and an opt-in per-language catalog filter.

**Mid term:**
- The **host-DSP integration**: real catalog, real user profile/history, real streaming — lyra as a drop-in layer.
- Persistent semantic layer (licensed lyric embeddings / Music Lens) for within-node selection at catalogue scale.
- Real user profiles + cold-start handling.

**Long term:**
- **Learn** (songwriting tutor) and **Memory** modes on the same engine.
- Audio × lyrics fusion (Cyanite) for richer trajectory shapes.
- Ambient / hands-free readiness.

---

## 6. Why it matters (impact)

- **For listeners:** discovery that meets you by *meaning* and takes you somewhere — your mood becomes motion, grounded in the words you actually connect to.
- **For DSPs:** a differentiator that doesn't require building new ML from scratch — plug in Musixmatch's lyrics intelligence and instantly understand your catalog and your listeners by feeling.
- **For Musixmatch:** a concrete showcase of the database as an *intelligence layer*, not just a lyrics feed — the value proposition made tangible before any first-party player exists.

---

*Team — two Audio Signal Processing Engineers: one a data scientist & ML engineer, one a full-stack & DevOps engineer.*
