# Build dataset Lyra — Estrazione brani da playlist

## Contesto

Sto costruendo Lyra, un sistema di raccomandazione musicale che lavora sui significati dei testi, per l'hackathon Musicathon di Musixmatch. Mi serve un dataset di seed di ~400-500 brani su cui poi farò le chiamate `matcher.track.get` di Musixmatch per recuperare i `track_id` e l'analisi semantica.

Questo step è solo l'estrazione dei brani dalle playlist. Le chiamate Musixmatch e la verifica delle preview audio sono step successivi, non parte di questo script.

## Input

Un dizionario Python con questa forma:

```python
playlists_dict = {
    "link_playlist_0": "spotify",
    "link_playlist_1": "spotify",
    "link_playlist_2": "applemusic",
    ...
}
```

dove la chiave è il **link completo** alla playlist e il valore è il provider (`"spotify"` o `"applemusic"`).

## Output

Un file JSON deduplicato con i brani estratti, in questa forma:

```json
[
  {
    "isrc": "USUG12103675",
    "spotify_id": "7A2cNLRT0YJc1yjxHlKihs",
    "artist": "Taylor Swift",
    "title": "Starlight (Taylor's Version)",
    "album": "Red (Taylor's Version)",
    "duration_ms": 220000,
    "release_date": "2021-11-12",
    "spotify_popularity": 65,
    "playlist_count": 3,
    "playlist_sources": ["link_playlist_0", "link_playlist_2", "link_playlist_4"]
  },
  ...
]
```

Salva anche una versione CSV equivalente per ispezione veloce.

## Steps

### 1. Setup

- Usa `spotipy` con Client Credentials Flow (no user auth richiesta — leggiamo solo playlist pubbliche).
- Credenziali da variabili d'ambiente: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.
- Crea un file `.env.example` con i nomi delle variabili (NON i valori).

### 2. Parsing dei link

- Per ogni entry del dict, estrai il `playlist_id`:
  - Spotify: parte dopo `/playlist/` (es. `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M` → `37i9dQZF1DXcBWIGoYBM5M`)
  - Apple Music: **skippa con warning** (richiede Apple Developer account a pagamento). Log: `"Skipping Apple Music link {url}: not supported in this version. Please convert to Spotify."`

### 3. Estrazione brani da ogni playlist Spotify

- Per ogni playlist, chiama `sp.playlist_tracks(playlist_id)`.
- Gestisci la **paginazione** (le playlist lunghe ritornano in pagine di 100).
- Per ogni brano estrai:
  - `isrc` da `track['external_ids'].get('isrc')` (può essere None per alcuni brani — gestiscilo)
  - `spotify_id` da `track['id']`
  - `artist` da `track['artists'][0]['name']` (solo il primo artista, per semplicità)
  - `title` da `track['name']`
  - `album` da `track['album']['name']`
  - `duration_ms` da `track['duration_ms']`
  - `release_date` da `track['album']['release_date']`
  - `spotify_popularity` da `track['popularity']` (0-100)

### 4. Deduplicazione

- Chiave di dedup primaria: **ISRC**.
- Se l'ISRC è None (capita), chiave di fallback: tupla `(artist.lower().strip(), title.lower().strip())`.
- Quando trovi un duplicato, **NON** sovrascrivere ma:
  - Incrementa `playlist_count`
  - Aggiungi il nome della playlist a `playlist_sources` (lista)

### 5. Gestione errori

- **Playlist privata o inesistente** (errore 404/403): log warning con il link e continua con le altre.
- **Brani locali** (Spotify permette di aggiungere file locali a una playlist): skippali — di solito hanno `track['id'] = None`.
- **Brani senza ISRC e senza titolo/artist**: skippali (record corrotto, raro).
- **Rate limit Spotify** (errore 429): retry con backoff esponenziale, max 3 tentativi.
- **Logging**: usa `logging` (non `print`) con livello INFO per progresso, WARNING per skip, ERROR per fallimenti. Logga ogni playlist processata con il numero di brani estratti.

### 6. Salvataggio incrementale

- Salva il file JSON ogni 50 brani processati, non solo alla fine. Se lo script crasha, non si perde tutto.
- Output paths: `data/seed_tracks.json` e `data/seed_tracks.csv`.

### 7. Report finale

A fine esecuzione, stampa un piccolo report:

```
Playlists processed: 10/12 (2 skipped)
Total tracks before dedup: 487
Unique tracks (deduplicated): 312
Tracks without ISRC: 14
Distribution of playlist_count:
  1 playlist: 245 tracks
  2 playlists: 48 tracks
  3+ playlists: 19 tracks
```

## Struttura del codice

Una sola funzione orchestratrice `build_dataset(playlists_dict, output_dir)` ben commentata, con helper functions ben separate:
- `parse_spotify_playlist_id(url) -> str`
- `extract_tracks_from_playlist(sp_client, playlist_id, source_name) -> list[dict]`
- `dedup_tracks(tracks) -> list[dict]`
- `save_outputs(tracks, output_dir)`

Niente classi complesse, niente over-engineering. Script lineare, leggibile.

## Dipendenze

`requirements.txt` minimo:

```
spotipy
python-dotenv
pandas    # solo per il CSV export, opzionale
```

## Quello che NON deve fare questo script

- NON chiamare l'API Musixmatch (step successivo).
- NON scaricare audio o preview (step successivo).
- NON salvare nulla di contenuto Musixmatch.
- NON deduplicare in modo aggressivo (es. fuzzy matching su titolo) — la dedup è solo per ISRC + (artist, title) esatti.

## Nota finale

Quando lo script è pronto, lo testerò passando un dict con 2-3 link di prova. Se passa il test, lo rilancerò sul dict completo finale.
