"""Enrich the Spotify seed with Musixmatch identifiers — PERSISTABLE step.

Reads data/seed_tracks.json (our Spotify metadata) and, for each track, matches it
to Musixmatch by ISRC (fallback: artist + title), adding only identifiers + flags:
  commontrack_id, mxm_track_id, mxm_has_lyrics, mxm_has_richsync, mxm_restricted,
  mxm_matched, mxm_match_by.

Contest-compliant: stores references/flags only, never lyrics/analysis content.
Writes data/seed_enriched.json (+ incremental checkpoints). Next step (online,
in-memory only) is analysis.get per commontrack_id for the soft-mapping.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import musixmatch as mxm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("lyra.enrich")

SAVE_EVERY = 25


def _match(track: dict):
    """Two-stage match: ISRC first (precise), then artist+title fallback.
    Returns (mxm_track, match_by) where match_by ∈ {'isrc','artist_title',None}."""
    isrc = track.get("isrc")
    if isrc:
        m = mxm.match_track(isrc=isrc)
        if m:
            return m, "isrc"
    artist, title = track.get("artist"), track.get("title")
    if artist and title:
        m = mxm.match_track(artist=artist, title=title)
        if m:
            return m, "artist_title"
    return None, None


def enrich_seed(in_path="data/seed_tracks.json", out_path="data/seed_enriched.json"):
    seed = json.loads(Path(in_path).read_text(encoding="utf-8"))
    out: list[dict] = []
    matched = no_match = with_lyrics = with_richsync = 0
    n = len(seed)

    for i, t in enumerate(seed, 1):
        rec = dict(t)
        try:
            track, match_by = _match(t)
        except mxm.MusixmatchError as exc:
            log.error("[%d/%d] %s - %s: %s", i, n, t.get("artist"), t.get("title"), exc)
            track, match_by = None, None

        if track:
            matched += 1
            has_lyrics = int(track.get("has_lyrics") or 0)
            has_richsync = int(track.get("has_richsync") or 0)
            with_lyrics += has_lyrics
            with_richsync += has_richsync
            rec.update({
                "commontrack_id": track.get("commontrack_id"),
                "mxm_track_id": track.get("track_id"),
                "mxm_has_lyrics": has_lyrics,
                "mxm_has_richsync": has_richsync,
                "mxm_restricted": int(track.get("restricted") or 0),
                "mxm_matched": True,
                "mxm_match_by": match_by,
            })
        else:
            no_match += 1
            rec.update({
                "commontrack_id": None, "mxm_track_id": None,
                "mxm_has_lyrics": 0, "mxm_has_richsync": 0, "mxm_restricted": 0,
                "mxm_matched": False, "mxm_match_by": None,
            })
        out.append(rec)

        if i % 20 == 0 or i == n:
            log.info("[%d/%d] matched=%d no_match=%d", i, n, matched, no_match)
        if i % SAVE_EVERY == 0:
            Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("DONE. matched=%d/%d  no_match=%d  has_lyrics=%d  has_richsync=%d",
             matched, n, no_match, with_lyrics, with_richsync)
    return out


if __name__ == "__main__":
    enrich_seed()
