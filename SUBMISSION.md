<!-- Single source of truth for the Musicathon submission — copy each field below into the
     form so repo and form never drift. Fields are in the form's order. -->

# lyra — Musicathon submission

Fields below follow the submission form order: **One-liner → Full description → Tags**. Copy each into its field.

---

## 1 · One-liner

> Tell lyra how you feel — it builds a playlist that travels your emotions, choosing songs by what their lyrics actually say.

---

## 2 · Full description  *(markdown supported)*

### The idea

Music discovery today matches the *surface*: genre, tempo, an audio fingerprint. But the reason a song lands is usually in the words — what it says, and the feeling underneath. lyra starts there. It reads lyrics, places every track in an emotional space, and uses that to meet you exactly where you are — then takes you somewhere.

### How it works

**1 · Say how you feel.** Pick up to three emotions on the wheel, or just type it the way you'd say it out loud — *"restless but quietly hopeful."* A Claude agent interprets the text and resolves it into the same three-emotion state, so typing and tapping feed one model, not two.

**2 · lyra plots a journey.** Not a flat list — a *trajectory*. From your starting feeling it picks an entry track, then songs that move through the emotional space toward where you're heading, so the playlist has an arc instead of looping one mood.

**3 · Steer in real time.** *More like this*, *change the mood*, *raise the energy* — each reshapes the upcoming queue and the path it takes, without cutting off the song that's playing. You're always driving.

**4 · See the feeling.** A living 3D **emotional compass** — a twelve-emotion wheel — turns to your dominant feeling and traces the constellation of your emotions; each steer turns it toward where the journey is heading. The depth isn't decoration: it maps the emotional distance you travel.

### Why it's different

- **Grounded in meaning, not metadata.** Songs are chosen by what they *say*. With Musixmatch lyrics, lyra surfaces the exact **cited line** that matches your mood — the lyric itself, not just a title and a cover.
- **A path, not a pile.** Emotion is treated as a space you move through. The compass makes that legible: your mood becomes motion.
- **Natural language in, music out.** Describe a feeling like you would to a friend; lyra understands it and answers in songs.

### Under the hood

- **Musixmatch Pro API** — lyrics, richsync (the time-aligned cited verse) and track metadata: the semantic foundation the whole thing stands on.
- **Emotional engine** — sentence-transformer embeddings (`all-mpnet-base-v2`) place each track on a twelve-node emotion taxonomy (a circumplex of valence × energy); a "journey" is a walk across that space.
- **Claude (Anthropic)** — reads free-text mood into the emotion model and shapes the trajectory (deepen / evolve / escalate).
- **Frontend** — Next.js with a `react-three-fiber` 3D compass; mobile compass-first layout plus a desktop split view. Real 30-second previews via Deezer/iTunes, since Musixmatch is lyrics, not audio.
- **Infra** — frontend on **Vercel**; the backend (FastAPI + ML engine) runs on **Hugging Face Spaces**.

### A focused MVP — with a real product behind it

This build is a deliberate MVP: a self-contained **Discover** experience that proves the engine end-to-end on real Musixmatch data, scoped by the contest's **no-persistence / real-time** rules (so: within-session, with stand-ins for a host DSP's catalog, profile and streaming). The full product — **lyra as a lyrics-intelligence layer a DSP plugs in (B2B2C)**, plus the Learn/Memory modes, voice, variable journeys and reaction-learning — is documented in [`docs/VISION.md`](./docs/VISION.md).

---

## 3 · Tags

> `ai` · `discovery` · `lyrics` · `web` · `mobile`

<!-- Live link + demo video go in their own dedicated submission fields, not here. -->
