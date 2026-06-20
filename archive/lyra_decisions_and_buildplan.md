# Lyra — Decisioni operative e piano di build
> Documento di sintesi da condividere con Alberto. Riassume tutte le scelte prese
> e lo stato dell'architettura prima dell'inizio dello sviluppo.

---

## 1. Decisioni operative (chiuse)

### Architettura
- **Grafo discreto** come piano A, no vector pre-popolato.
  Le rules vietano lo storage persistente di contenuto Musixmatch — il grafo si
  popola **real-time per sessione** e si svuota a fine sessione.
- **Nodi: tassonomia macro nostra** (15-25 macro-mood, da definire). Esempi base
  da Plutchik/Russell: Melancholia, Reflection, Anger, Hope, Awe, Joy, Anxiety,
  Tenderness, Defiance, Nostalgia, Solitude, Empowerment...
- **Soft mapping con pesi**: ogni mood/theme Musixmatch viene mappato come
  *distribuzione* sui macro-nodi (non hard assignment) via cosine similarity tra
  embedding della label Musixmatch e embedding dei nomi dei macro-nodi.
  Un brano = somma normalizzata delle distribuzioni dei suoi mood/theme.
- **Persistenza ammessa**: solo embedding dei nomi dei *macro-nodi nostri*
  (pre-calcolati una volta all'avvio). Niente contenuto Musixmatch persistito.

### Traiettorie
- **Due forme solide per la demo**: Deep Dive (resti, ti restringi) ed Evolution
  (te ne vai con passi coerenti).
- **Escalation condizionale**: si attiva se il test del giorno 1 trova un asse
  di intensità ordinabile nei dati Musixmatch (track_rating con varianza,
  presenza di asse arousal in lyrics.analysis, o altro). Se no, in roadmap come
  forma-bandiera dell'estensione audio.
- Naming UI: i nomi tecnici (deep dive, evolution) saranno verbi/frasi user-friendly
  nell'interfaccia. Decisione UI definitiva post-sync.

### UX del grafo
- **Prominente nei momenti decisionali** (scelta della traiettoria all'inizio
  della sessione → grafo centrale, mostra le direzioni possibili).
- **Ritratto durante l'ascolto** (sidebar / toggle "view graph" stile "view credits").
- Pattern UI specifico (drawer, collapse, overlay) → libertà di Alberto.

### Stack API Musixmatch
- **Critici**: `track.lyrics.get`, `track.richsync.get`, `track.lyrics.analysis.get`,
  `track.lyrics.analysis.search` (semantic search nativa con meaning come query —
  questa è la chiave architetturale: una sola call ritorna brani + analisi + ranking).
- **Popolarità interna**: `chart.tracks.get` + `track_rating` + `num_favourite`.
  **Songstats fuori dai partner** — coperto dalle chart Musixmatch.
- **Cancello di legittimità**: flag `has_lyrics`, `has_richsync`, `has_lyrics_analysis`,
  `restricted`, presenza ISRC/Spotify ID.
- **Onboarding/seed**: `artist.search`, `track.search`, `matcher.track.get`.
- **In roadmap (pitch)**: `track.lyrics.fingerprint.post` (Sentinel) per il songwriting
  tutor — verifica originalità.

### Partner
- **Replit** — ambiente di build e deploy (in stack).
- **Cyanite** — citato nel pitch come upstream audio per l'estensione (NON in Discover,
  per non riaprire lo scope audio). Markus Schwarzer (CEO) in giuria.
- **ElevenLabs** — citato in pitch come possibile voce di Lyra, non in build.
- **Songstats** — fuori, ridondante.

### Audio nella demo — sì, si sente
La demo è con suono. L'audio è la spina dorsale dell'esperienza utente.
- **Fonte**: iTunes Search API o Deezer — preview pubbliche di 30s, free, no auth.
  NOT contenuto Musixmatch → nessun problema con le rules sullo storage.
- **Matching**: ISRC (preferito) → fallback artist + title.
- **Riproduzione**: tag `<audio>` HTML con `preview_url` dalla risposta.
- **Auto-avanzamento**: allo scadere dei 30s, transizione smooth al prossimo brano
  della traiettoria (la playlist viaggio deve fluire, non fermarsi).
- **Filtro del dataset**: nel seed teniamo solo brani che hanno *sia* lyrics analysis
  su Musixmatch *sia* preview audio disponibile (verifica nel Giorno 2).
- **Mismatch attesi**: alcuni brani del seed non avranno preview su nessuna fonte
  → escludersi a monte.
- **In pitch**: in produzione, playback completo via integrazione Spotify / Apple Music
  SDK — linea di roadmap naturale, le preview da 30s sono limite delle API free per
  la demo, non del prodotto.

### Scope demo
- **Solo modalità Discover** nella demo funzionante.
- Learn (songwriting tutor) e Memory (resurfacing stagionale) **citati nel pitch**
  come estensioni naturali della stessa architettura.

### Submission format
- Web demo live come obiettivo. **Video 90s come piano B** entro il giorno 5
  se la web demo è in bilico.

---

## 2. Architettura aggiornata

### Componenti del sistema (online, in-memory per sessione)

```
┌─────────────────────────────────────────────────────────────────┐
│ Web app (Replit-hosted)                                         │
│  · player, history, session playlist                            │
│  · graph view (prominent at decision, sidebar during listening) │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ Datapizza agent                                                 │
│  · reads intent, picks trajectory shape, walks the graph        │
│  · explains transitions citing richsync verses                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ Trajectory engine (core, ours)                                  │
│  · macro-node taxonomy (fixed, ours, embedded at startup)       │
│  · soft mapping: Musixmatch moods/themes → weighted node dist   │
│  · trajectory operators: deepen (reduce entropy),               │
│    evolve (shift mass A→B through intermediate states),         │
│    escalate (conditional, if intensity axis available)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ Musixmatch API layer (real-time, no persistent storage)         │
│  · track.lyrics.analysis.search → candidates + analysis + score │
│  · track.lyrics.analysis.get    → on-demand enrichment          │
│  · track.richsync.get           → citable verse + timestamp     │
│  · chart.tracks.get             → popularity ramp               │
└─────────────────────────────────────────────────────────────────┘
```

### Build flow

```
OFFLINE (once, ours, persistable)        ONLINE (real-time, in-memory only)
─────────────────────────────────        ──────────────────────────────────

┌─────────────────────────┐               ┌──────────────────────────────┐
│ Define macro-node       │               │ Session starts               │
│ taxonomy (strings)      │               │  └─ user picks seed mood     │
└───────────┬─────────────┘               └──────────────┬───────────────┘
            │                                            │
┌───────────▼─────────────┐               ┌──────────────▼───────────────┐
│ Pre-compute taxonomy    │      ──►      │ Call Musixmatch:             │
│ embeddings (cached)     │               │ analysis.search w/ meaning   │
└─────────────────────────┘               └──────────────┬───────────────┘
                                                         │
                                          ┌──────────────▼───────────────┐
                                          │ Soft-map response moods to   │
                                          │ macro-nodes using cached     │
                                          │ taxonomy embeddings          │
                                          └──────────────┬───────────────┘
                                                         │
                                          ┌──────────────▼───────────────┐
                                          │ Build session graph,         │
                                          │ offer trajectories,          │
                                          │ play, adapt, cite richsync   │
                                          └──────────────┬───────────────┘
                                                         │
                                          ┌──────────────▼───────────────┐
                                          │ Session ends → wipe          │
                                          │ (only macro-node embeddings  │
                                          │ persist, nothing else)       │
                                          └──────────────────────────────┘
```

---

## 3. Dataset di seed — requisiti

Tipo: **lista di identificatori di brani** che servono per popolare la demo,
NOT contenuto Musixmatch. Solo riferimenti — il contenuto viene fetchato real-time.

### Requisiti

Per ogni brano del seed servono identificatori esterni per matching con Musixmatch:
- **ISRC** (preferito — match diretto via `matcher.track.get`)
- **Spotify ID** (alternativa)
- Oppure **artist name + track title** (match via `track.search` o `matcher.track.get`)

### Caratteristiche del seed ideale

- **Dimensione**: 200-500 brani per la demo (abbastanza da popolare grafi
  ricchi, abbastanza piccolo da curare a mano).
- **Diversità emotiva**: copertura ampia dei macro-nodi (qualche brano per ogni
  area emotiva — non solo sad, non solo happy).
- **Diversità di popolarità**: mix di brani famosi (per familiar starting point)
  e di nicchia (per discovery payoff).
- **Lyrics present in Musixmatch**: verificare che `has_lyrics=1` e
  `has_lyrics_analysis=1` per la maggior parte (test rapido in batch).
- **Multilingua opzionale ma utile**: una manciata di brani non-inglesi per
  mostrare il supporto multilingua nel demo.

### Dove trovarlo

Tre strade, in ordine di velocità:

1. **Dataset curato a mano da voi due** (consigliato). Partite da playlist
   esistenti vostre / di Spotify / di amici fidati. Estraete artist+title in CSV,
   200-500 righe. È lavoro di un pomeriggio. Vantaggi: massimo controllo,
   copertura emotiva garantita perché la scegliete voi.

2. **Dataset pubblici come base + curation**:
   - **Million Song Dataset** (subset Last.fm tags) — vasto ma rumoroso, da filtrare.
   - **MusicBrainz** — ricco di ISRC, ottimo per il matching, ma freddo come selezione.
   - **Spotify "Editorial Playlists"** scaricate via API Spotify (free tier) —
     ottima diversità emotiva ed editoriale.
   - **Genius / AZLyrics scraping** — sconsigliato, problemi di licensing.

3. **Charts Musixmatch + amplificazione** — partite da `chart.tracks.get` per
   ottenere brani popolari con `has_lyrics_analysis=1` garantiti, poi
   espandete con altri per diversità.

**Raccomandazione**: opzione 1 + un check con `chart.tracks.get` per validare
che i brani scelti abbiano l'analisi disponibile. Massimo 1 giorno di lavoro.

---

## 4. Roadmap di build — cose da iniziare a costruire

### Giorno 1 (oggi, dopo il sync)

**Verifiche/test (15-30 min):**
- [ ] Chiave Scale arrivata e funzionante (chiamata di prova a un endpoint)
- [ ] Test della distribuzione di `track_rating` su 50 brani (varianza → manopola popolarità)
- [ ] Test della presenza di un asse di intensità nei mood (escalation sì/no)

**Setup (1-2 h):**
- [ ] Repo pubblico creato (richiesto per submission)
- [ ] README minimo con pitch
- [ ] Replit project creato
- [ ] Cartella `/shared` con schema JSON del contratto motore ↔ agente
- [ ] Environment variables: chiavi API in `.env` (mai committate)

### Giorno 2

**Dataset (zaib):**
- [ ] Curare seed di 200-300 brani in CSV (artist, title, optional ISRC/Spotify ID)
- [ ] Script di matching: per ogni riga del CSV, chiama `matcher.track.get`
  e salva solo `track_id` + flag `has_*` in un piccolo CSV interno
  (questo è permesso — sono identificatori, non contenuto)
- [ ] Filtro: tieni solo brani con `has_lyrics_analysis=1`

**Taxonomy + embeddings (zaib):**
- [ ] Definire i 15-25 macro-nodi (lista di stringhe)
- [ ] Pre-calcolare embedding dei nomi dei nodi (OpenAI / sentence-transformers)
- [ ] Salvare embedding in file locale (cache permanente, è roba vostra)

**Frontend skeleton (Alberto):**
- [ ] App scaffolding (React/Next o stack di scelta)
- [ ] Layout base: player + sidebar grafo + session playlist
- [ ] Routing e stato globale

### Giorno 3

**Trajectory engine (zaib):**
- [ ] Funzione `soft_map(mood_string) → distribution over macro_nodes`
- [ ] Funzione `track_to_node_distribution(track_analysis) → distribution`
- [ ] Operatori di traiettoria:
  - `deepen(start_distribution) → target_distribution` (riduce entropia)
  - `evolve(start_distribution, target_node) → sequence of intermediate distributions`
- [ ] Funzione `find_next_track(target_distribution, candidates_pool)` — il "nearest neighbor"
  in spazio di distribuzioni
- [ ] Mock layer Musixmatch per testare engine in isolamento

**Agente (Alberto + eventuale terzo):**
- [ ] Datapizza agent scaffolding
- [ ] Tool wrapping di analysis.search, analysis.get, richsync.get
- [ ] Prompt di sistema: ruolo, formati, vincoli

### Giorno 4

**Integrazione:**
- [ ] Engine + agent + Musixmatch reale (no mock)
- [ ] Sessione end-to-end: utente sceglie mood → grafo popolato → traiettorie offerte
  → playlist costruita
- [ ] Audio preview integration (iTunes Search via ISRC)

**Graph view (Alberto):**
- [ ] Rendering del grafo (NetworkX backend + libreria JS frontend, es. react-flow o vis.js)
- [ ] Stato prominente vs ritratto

### Giorno 5

**Polish + piano B:**
- [ ] UX dei momenti decisionali
- [ ] Spiegazioni dell'agente con richsync citato
- [ ] Performance check: latenza per ciclo
- [ ] **Inizio registrazione video 90s come piano B**

### Giorno 6

**Demo + submission:**
- [ ] Catalogo del demo finale curato (sostituzione/rifinitura del seed)
- [ ] Pitch finalizzato
- [ ] Cover image
- [ ] Video 90s finalizzato (se piano B in uso)
- [ ] Submission entro il 21 giugno 23:59 CEST

---

## 5. Contratto /shared (motore ↔ agente)

Bozza dello schema. Da raffinare insieme.

```python
# shared/schema.py (Pydantic)

class NodeDistribution(BaseModel):
    """Distribuzione di pesi sui macro-nodi."""
    weights: dict[str, float]  # macro-node name → weight, normalized to sum 1

class TrackCandidate(BaseModel):
    track_id: int
    artist: str
    title: str
    isrc: str | None
    spotify_id: str | None
    distribution: NodeDistribution
    has_richsync: bool
    track_rating: int  # popularity proxy
    similarity_score: float | None  # from analysis.search

class TrajectoryStep(BaseModel):
    target_distribution: NodeDistribution
    selected_track: TrackCandidate
    transition_reason: str  # natural language for the agent
    citable_verse: str | None  # from richsync, if available
    timestamp_in_song: float | None  # seconds, for richsync

class Trajectory(BaseModel):
    shape: Literal["deepen", "evolve", "escalate"]
    start_distribution: NodeDistribution
    steps: list[TrajectoryStep]
```

---

## 6. Cose da non dimenticare

- **Kick-off ufficiale Musixmatch ore 18 (Discord)** — entrambi collegati.
- **Sync interno team** — appena Alberto disponibile.
- **Cover image** — chi la fa? Da assegnare.
- **Repo pubblico aperto entro fine giornata** — richiesto per submission.
