"""Musixmatch API client for Lyra — thin wrapper over the ws/1.1 surface.

Contest rule (do NOT violate): identifiers + has_* flags returned by
`matcher.track.get` are persistable (they're references, not content). Lyrics,
richsync and analysis ARE Musixmatch content → keep them in memory per session
and never write them to disk. This module only returns data; the persistence
policy is enforced by the caller (e.g. enrich_seed persists only ids/flags).

Auth: `?apikey=` query param. Validated endpoints (2026-06-16):
  matcher.track.get · track.lyrics.analysis.get · track.lyrics.get · track.richsync.get
`track.lyrics.analysis.search` is a POST (body schema TBD) — not wrapped yet.
"""
from __future__ import annotations

import os
import json
import time
import logging
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv

log = logging.getLogger("lyra.musixmatch")

BASE = "https://api.musixmatch.com/ws/1.1/"
MAX_RETRIES = 3


class MusixmatchError(RuntimeError):
    """Non-200 Musixmatch status (the code lives in message.header.status_code)."""

    def __init__(self, method: str, status_code, hint: str | None = None):
        self.method = method
        self.status_code = status_code
        self.hint = hint
        super().__init__(f"{method} -> status {status_code}" + (f" ({hint})" if hint else ""))


def _api_key() -> str:
    load_dotenv()
    key = os.environ.get("MUSIXMATCH_API_KEY")
    if not key:
        raise RuntimeError("Missing MUSIXMATCH_API_KEY in .env")
    return key


def _get(method: str, **params):
    """GET a ws/1.1 method; return message.body or raise MusixmatchError.
    Retries on HTTP 429 with exponential backoff."""
    params["apikey"] = _api_key()
    url = BASE + method + "?" + urllib.parse.urlencode(params)
    payload = None
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=25) as resp:
                payload = json.loads(resp.read())
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                log.warning("Rate limited (429) on %s — retry in %ds.", method, wait)
                time.sleep(wait)
                continue
            raise
    header = (payload or {}).get("message", {}).get("header", {})
    status = header.get("status_code")
    if status != 200:
        raise MusixmatchError(method, status, header.get("hint"))
    return payload["message"]["body"]


def _post(method: str, data: dict, **query):
    """POST a ws/1.1 method with a JSON `{"data": ...}` body; query params (incl.
    pagination + apikey) go in the URL. Retries on HTTP 429 and transient 5xx."""
    query["apikey"] = _api_key()
    url = BASE + method + "?" + urllib.parse.urlencode(query)
    body = json.dumps({"data": data}).encode()
    payload = None
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                log.warning("HTTP %d on %s — retry in %ds.", exc.code, method, wait)
                time.sleep(wait)
                continue
            raise
        header = payload.get("message", {}).get("header", {})
        status = header.get("status_code")
        # Musixmatch sometimes wraps a transient failure in a 200 envelope + 5xx code
        if status in (500, 502, 503, 504) and attempt < MAX_RETRIES - 1:
            time.sleep(2 ** (attempt + 1))
            continue
        if status != 200:
            raise MusixmatchError(method, status, header.get("hint"))
        return payload["message"]["body"]
    return (payload or {}).get("message", {}).get("body", {})


def search_analysis(data: dict, page: int = 1, page_size: int = 50) -> list[dict]:
    """track.lyrics.analysis.search (POST) → list of {track, analysis} items.

    `data` holds the search criteria: `meaning` (free-text semantic query),
    `moods` / `themes` / `genre` (arrays), `rating`, `lyrics_language`, etc.
    ONE call returns candidates + their analysis + ranking over the whole
    Musixmatch catalog. The analysis is CONTENT → keep it in memory only."""
    body = _post("track.lyrics.analysis.search", data, page=page, page_size=page_size)
    return (body or {}).get("track_list") or []


# ---- identifiers (PERSISTABLE) ----------------------------------------------
def match_track(isrc: str | None = None, artist: str | None = None,
                title: str | None = None) -> dict | None:
    """matcher.track.get → the matched track dict (commontrack_id + has_* flags),
    or None if nothing matched. Prefer ISRC; fall back to artist+title."""
    params: dict = {}
    if isrc:
        params["track_isrc"] = isrc
    if artist:
        params["q_artist"] = artist
    if title:
        params["q_track"] = title
    try:
        body = _get("matcher.track.get", **params)
    except MusixmatchError as exc:
        if exc.status_code == 404:
            return None  # no match — caller counts it
        raise
    track = (body or {}).get("track") or None
    # Musixmatch returns an empty track object ({}) for some non-matches.
    if not track or not track.get("commontrack_id"):
        return None
    return track


# ---- content (IN-MEMORY ONLY, never persist) --------------------------------
def get_analysis(commontrack_id: int | str) -> dict | None:
    """track.lyrics.analysis.get → the `analysis` object
    (themes, entities, meaning, moods, rating, ...). Musixmatch CONTENT."""
    body = _get("track.lyrics.analysis.get", commontrack_id=commontrack_id)
    return (body or {}).get("analysis")


def get_richsync(commontrack_id: int | str) -> dict | None:
    """track.richsync.get → the `richsync` object (timed lyrics). Musixmatch CONTENT."""
    body = _get("track.richsync.get", commontrack_id=commontrack_id)
    return (body or {}).get("richsync")


def get_lyrics(commontrack_id: int | str) -> dict | None:
    """track.lyrics.get → the `lyrics` object. Musixmatch CONTENT."""
    body = _get("track.lyrics.get", commontrack_id=commontrack_id)
    return (body or {}).get("lyrics")
