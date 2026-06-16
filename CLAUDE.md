# CLAUDE.md — Lyra (shared brain)

> Documento vivo letto da **entrambi i Claude Code** del team (Alberto + Axel).
> Lo aggiorniamo quando prendiamo decisioni o cambiamo stato, così i due agenti
> condividono lo stesso modello mentale senza scambiarsi MD a mano.

## Cos'è Lyra
Agente musicale lyrics-first per il **Musixmatch Musicathon** (15–21 giu 2026).
L'utente si muove in un **atlante di emozioni** (macro-nodi mood/theme); Lyra lo
accompagna da un sentimento al successivo lungo una **traiettoria** e cita **il
verso** (richsync) che marca ogni passaggio. Modalità unica per il contest:
**Discover**. (Learn/Memory solo citati nel pitch.)

## Team & ownership (confini per cartella → niente conflitti git)
- **Alberto** → `web/` (frontend Next.js) + agent layer (narrazione) + deploy frontend.
- **Axel** → `engine/` (traiettorie, ML, soft-mapping, richsync align) + dataset seed + backend Python.
- **Comune** → `shared/` (il contratto) e questo file.

## Architettura runtime (target)
```
Next (web/, Alberto) ──HTTP──> Backend Python (FastAPI) ──> Musixmatch API
                                ├─ agent/  (datapizza-ai, narrazione)  ← co-build
                                └─ engine/ (traiettorie, Axel)
```
Due cuciture: `web → backend` (HTTP, stesso JSON) e `agent ↔ engine` (`shared/`).
Il backend `backend/` è già in piedi (FastAPI, `POST /recommend`) con **engine e
agent MOCK** (`backend/mock_engine.py`, `backend/agent.py`). Swap point in
`app.py`: stasera `mock_engine` → `engine/` reale (Axel), `agent` → datapizza-ai.
`web/src/app/api/trajectory` proxa il backend via `BACKEND_URL` e **ripiega sul
mock locale** (`web/src/lib/mockData.ts`) se il backend è giù → la demo non muore mai.

⚠️ **Python**: datapizza-ai richiede **>=3.10,<3.13**. Il sistema ha 3.14 → per il
backend reale (con l'agente) creare un **venv 3.12**. Il mock attuale gira su 3.14.

## Il contratto
`shared/schema.py` (Pydantic, lato Axel) ↔ `web/src/lib/types.ts` (lato Alberto),
**identici campo per campo, snake_case**. La risposta `model_dump()` di Pydantic
entra nel frontend senza conversioni. Se cambi un campo, cambialo in entrambi.

## Decisione agent (datapizza-ai)
Framework giovane (v0.0.x) → tenerlo in **ruolo a basso rischio**:
- **Engine (deterministico)** produce i dati strutturati `Trajectory`.
- **Agent (LLM, claude-sonnet-4-6)** fa solo linguaggio: intent → `seed_mood`+`shape`,
  e genera `transition_reason` citando `citable_verse`. NON emette la Trajectory.
- Fallback se datapizza combatte: SDK Anthropic diretto (switch a basso costo).
- L'agente è un **co-build Alberto+Axel** in una session dedicata.

## Vincoli regole contest (NON violare)
- **No storage persistente di contenuto Musixmatch** (lyrics/richsync/analysis):
  fetch real-time per sessione, si svuota a fine sessione. Niente vector DB di liriche.
  Persistibili solo i nostri artefatti (es. embedding dei nomi dei macro-nodi).
  L'audio è iTunes/Deezer (NON Musixmatch) → fuori dal vincolo.
- **Obbligatorio usare ≥1 surface API Musixmatch** in modo significativo.
- **Giudizio**: Originality 25% · Craft 25% · Use of Musixmatch API 25% · Impact 25%.
- **Deadline submission: 21 giu 2026, 23:59 CEST** (le regole si contraddicono sul 22 → usiamo il 21 come muro).
- **Submission**: repo pubblico + (demo URL *o* video 90s) + cover image + titolo/one-liner/descrizione.

## Stato attuale
- ✅ Scaffold `web/` (Next 16 + TS + Tailwind v4) su `main`.
- ✅ Discover skeleton funzionante: MoodPicker → atlante SVG → step card (verso citato) → player con auto-avanzamento. **Audio iTunes reale**, traiettoria mock.
- ✅ Contratto `shared/schema.py` + `web/src/lib/types.ts`.
- ✅ Backend FastAPI (`backend/`) con engine+agent MOCK; seam Next→backend provata end-to-end.
- ✅ Atlante interattivo + verso "karaoke" sincronizzato all'audio.
- ⏳ Agent (datapizza) + engine reali: da costruire (agent stasera, co-build).

## Come lavoriamo
- Si lavora su `main` (processo leggero, niente cerimonia PR). Branch corti solo se serve.
- Tenere `main` sempre demoabile.
- **Aggiornare questo file** quando si decide qualcosa o cambia lo stato.

## Decision log
- **2026-06-16** — Architettura a grafo discreto (no vector DB) confermata; ruolo agent definito (engine=dati, agent=narrazione); scaffold frontend mergiato su main; audio via iTunes preview.
- **2026-06-16** — Backend FastAPI scaffoldato con engine+agent MOCK e swap point; proxy Next→backend con fallback; trovato vincolo Python <3.13 per datapizza-ai (sistema 3.14 → serve venv 3.12).

## Next moves
- WS-C (Alberto, in corso): graph interattiva + legenda + sync del verso sull'audio.
- WS-A (Alberto+Axel, session): costruire l'agente datapizza-ai.
- WS-D (Axel): engine reale che riempie il contratto.
- WS-E (comune, post-key): validare `track.lyrics.analysis.search` come gate bloccante.
- Deploy: backend Replit, frontend Vercel/Replit. Pitch + cover + video entro il 21.
