# Lyra — the lyrics-first music agent

*(Elevator pitch. For the full product vision, architecture and roadmap see [`VISION.md`](./VISION.md).)*

**Tell Lyra how you feel — it builds a playlist that *travels* your emotions, choosing songs by what their lyrics actually say.**

**The problem.** Every recommender — Spotify, Apple Music — treats lyrics as metadata or ignores them. Yet lyrics carry what we actually connect to: the themes, the emotion, the story. The richest signal in music is the most underused.

**The idea.** Lyra puts lyrics first. It understands the semantic and emotional content of songs and turns it into **journeys**: you start from a mood, and Lyra walks you through the emotional space — deeper into the same feeling, or evolving into a new one — building the path in real time and **citing the actual lyric line** that marks each transition. An agent, not a static playlist.

**Why Musixmatch.** This only works on top of the world's largest lyrics catalogue. Lyrics analysis, themes with citable quotes, and richsync are first-class signals — the core of the product. The entire data layer is built on the Musixmatch API, popularity included (`track_rating`, charts), with no external data dependencies.

**What it really is.** Not another player — **Musixmatch's lyrics-intelligence layer that a DSP plugs in** to understand its own catalog by meaning (B2B2C). The hackathon build is a focused MVP that proves the engine end-to-end; the full vision is in [`VISION.md`](./VISION.md).

**Team.** Two Music & Acoustic Engineers (Politecnico di Milano): one focused on AI agent engineering and shipping, one a data scientist in ML, recommender systems and solution architecture.
