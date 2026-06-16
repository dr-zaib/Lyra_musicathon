# Lyra

Discover music by what it actually says. Un agente lyrics-first che ti fa
muovere in un **atlante di emozioni** (macro-nodi mood/theme) e ti accompagna da
un sentimento al successivo, citando **il verso** che marca ogni passaggio.

## Struttura (monorepo a cartelle)

```
shared/        Contratto motore <-> agente (fonte di verità cross-team)
  schema.py      modelli Pydantic — lato Axel
web/           Frontend Next.js + agent layer — lato Alberto
  src/lib/types.ts   specchio TS del contratto (stessi nomi snake_case)
  src/app/api/       SEAM: mock del motore + proxy audio iTunes
agent/         (Fase 2) Datapizza agent — da costruire
```

Confini per cartella = niente conflitti git fra i due.

## Far girare il frontend

```bash
cd web
npm install
npm run dev      # http://localhost:3000
```

Gira **da solo, senza API key**: l'audio è reale (preview iTunes, pubbliche), la
traiettoria è mock (fallback se il backend è giù).

## Far girare il backend (opzionale in dev)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app:app --reload --port 8010
```

Poi in `web/.env.local`: `BACKEND_URL=http://localhost:8010`. Engine e agent sono
MOCK (`mock_engine.py`, `agent.py`); gli swap point sono in `app.py`.
NB: l'agente reale (datapizza-ai) richiede **Python >=3.10,<3.13** → venv 3.12.

## La cucitura (mock -> motore vero)

Oggi `web/src/app/api/trajectory/route.ts` restituisce dati mock
(`web/src/lib/mockData.ts`) che rispettano il contratto `/shared`. Quando il
trajectory engine è pronto, quella route diventa un proxy verso il backend
Python — **stesso shape JSON, il frontend non cambia**.

## Vincolo regole contest (importante)

Nessun contenuto Musixmatch va persistito: lyrics/richsync/analysis si fetchano
**real-time per sessione** e si svuotano a fine sessione. Persistibili solo i
nostri artefatti (embedding dei nomi dei macro-nodi). L'audio NON è contenuto
Musixmatch (iTunes), quindi è fuori dal vincolo.
