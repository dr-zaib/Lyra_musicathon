"""Lyra trajectory engine — walks the emotional space and builds a Trajectory.

Per step the engine computes a TARGET distribution over the 12 macro-nodes
(via a trajectory operator), pulls candidates from the whole Musixmatch catalog
with `analysis.search` (translating the target into Musixmatch moods), soft-maps
each candidate's analysis into our node space, and picks the nearest one.

Output mirrors shared/schema.py (snake_case dicts): Trajectory → steps[] →
{target_distribution, selected_track, transition_reason, citable_verse, ...}.
The transition_reason is left empty here — it's the agent's voice (filled later).

Contest rule: candidate analysis is Musixmatch CONTENT, used in memory only and
never persisted. Only identifiers flow into the (transient) response.
"""
from __future__ import annotations

import logging

import numpy as np

import musixmatch as mxm
import softmap
from taxonomy import NODE_NAMES, NODES

log = logging.getLogger("lyra.trajectory")

# circumplex ring order (mirrors web EmotionWheel ORDER) — for neighbours/defaults
RING = [
    "Tenderness", "Hope", "Joy", "Empowerment",
    "Awe", "Defiance", "Anger", "Anxiety",
    "Melancholia", "Solitude", "Reflection", "Nostalgia",
]

# our macro-node -> Musixmatch mood vocabulary (capitalized, from the docs)
NODE_TO_MXM_MOOD = {
    "Melancholia": "Despair",
    "Reflection":  "Reflection",
    "Solitude":    "Solitude",
    "Nostalgia":   "Nostalgia",
    "Tenderness":  "Love",
    "Hope":        "Hope",
    "Joy":         "Joy",
    "Awe":         "Inspiration",
    "Anxiety":     "Angst",
    "Anger":       "Anger",
    "Defiance":    "Freedom",
    "Empowerment": "Empowerment",
}

# nodes that read as "higher intensity" — used by the (experimental) escalate shape
HIGH_AROUSAL = ["Anger", "Empowerment", "Defiance", "Joy", "Anxiety"]

CANDIDATES_PER_STEP = 100   # pull a wide pool, then filter by popularity + nearest
MIN_TRACK_RATING = 20       # popularity floor — surface recognizable tracks (0–100)


# ---- distribution helpers ---------------------------------------------------
def _idx(node: str) -> int:
    return NODE_NAMES.index(node)


def _onehot(node: str) -> np.ndarray:
    v = np.zeros(len(NODE_NAMES))
    v[_idx(node)] = 1.0
    return v


def _soft_start(seed: str) -> np.ndarray:
    """A fuzzy starting distribution: the seed plus its two ring neighbours.
    (The user rarely knows their mood precisely — start a bit spread out.)"""
    i = RING.index(seed)
    prev, nxt = RING[(i - 1) % 12], RING[(i + 1) % 12]
    v = np.zeros(len(NODE_NAMES))
    v[_idx(seed)] = 0.6
    v[_idx(prev)] = 0.2
    v[_idx(nxt)] = 0.2
    return v


def _normalize(v: np.ndarray) -> np.ndarray:
    s = v.sum()
    return v / s if s > 0 else np.full(len(NODE_NAMES), 1.0 / len(NODE_NAMES))


def _to_dict(v: np.ndarray) -> dict[str, float]:
    return {NODE_NAMES[i]: float(v[i]) for i in range(len(NODE_NAMES))}


def _default_destination(seed: str) -> str:
    """A sensible 'evolve' target when the agent doesn't supply one: a meaningful
    shift around the ring (toward a different emotional region)."""
    return RING[(RING.index(seed) + 5) % 12]


# ---- operators: a sequence of target distributions --------------------------
def _interp(start: np.ndarray, end: np.ndarray, n: int) -> list[np.ndarray]:
    """n target distributions interpolating from start (exclusive) to end."""
    return [_normalize((1 - a) * start + a * end) for a in np.linspace(0, 1, n + 1)[1:]]


def operator_targets(shape: str, seed: str, n_steps: int,
                     end_node: str | None = None) -> tuple[np.ndarray, list[np.ndarray]]:
    """Return (start_distribution, [target per step]) for a trajectory shape."""
    start = _soft_start(seed)
    if shape == "deepen":
        # reduce entropy: converge onto the seed node
        return start, _interp(start, _onehot(seed), n_steps)
    if shape == "evolve":
        end = _onehot(end_node or _default_destination(seed))
        return start, _interp(start, end, n_steps)
    if shape == "escalate":
        # move toward the nearest high-arousal node (experimental)
        target = end_node or min(HIGH_AROUSAL, key=lambda n: abs(RING.index(n) - RING.index(seed)))
        return start, _interp(start, _onehot(target), n_steps)
    raise ValueError(f"unknown shape: {shape}")


# ---- candidates + selection -------------------------------------------------
def _target_moods(target: np.ndarray, k: int = 2) -> list[str]:
    """Top-k nodes of the target → their Musixmatch mood labels (for the query)."""
    top = np.argsort(target)[::-1][:k]
    return [NODE_TO_MXM_MOOD[NODE_NAMES[i]] for i in top]


def _target_meaning(target: np.ndarray, k: int = 2) -> str:
    """A free-text semantic query from the target's top-k node glosses — enriches
    analysis.search beyond the categorical mood filter (better match precision)."""
    top = np.argsort(target)[::-1][:k]
    glosses = [NODES[NODE_NAMES[i]] for i in top]
    return "; ".join(glosses)[:500]  # API caps meaning at 500 chars


def _fetch_candidates(target: np.ndarray, lang: str = "en") -> list[dict]:
    """Pull catalog candidates for a target via analysis.search (guardrails:
    language filter + meaning query). Returns the raw {track, analysis} items."""
    data = {
        "meaning": _target_meaning(target),
        "moods": _target_moods(target),
        "lyrics_language": lang,
    }
    try:
        return mxm.search_analysis(data, page_size=CANDIDATES_PER_STEP)
    except mxm.MusixmatchError as exc:
        log.warning("analysis.search failed for moods %s: %s", data["moods"], exc)
        return []


def _citable_verse(analysis: dict, target: np.ndarray | None = None) -> str | None:
    """A short citable line from the analysis themes' quotes. If a target is given,
    pick the quote from the theme most aligned with the target emotion (so the
    cited line actually matches where the journey is)."""
    themes = ((analysis or {}).get("themes") or {}).get("main_themes") or []

    def first_quote(theme):
        for q in theme.get("quotes") or []:
            if q and q.strip():
                return q.strip()
        return None

    if target is not None:
        best_q, best_score = None, -1.0
        for theme in themes:
            label, q = theme.get("theme"), first_quote(theme)
            if not label or not q:
                continue
            d = softmap.label_to_distribution(label)
            vec = np.array([d[n] for n in NODE_NAMES])
            score = float(vec @ target)  # alignment with the target emotion
            if score > best_score:
                best_q, best_score = q, score
        if best_q:
            return best_q

    for theme in themes:  # fallback: first available quote
        q = first_quote(theme)
        if q:
            return q
    return None


def _verse_timestamp(commontrack_id, verse: str | None) -> float | None:
    """Find when the citable verse is sung, via richsync (for the karaoke jump).
    Matches the verse text to a timed line; None if no match / no richsync."""
    if not verse or not commontrack_id:
        return None
    v = verse.lower().strip()
    try:
        lines = mxm.richsync_lines(commontrack_id)
    except mxm.MusixmatchError:
        return None
    for ln in lines:
        x = (ln.get("text") or "").lower().strip()
        if x and (x == v or v in x or x in v):
            return ln.get("ts")
    return None


def find_next_track(target: np.ndarray, candidates: list[dict], used: set,
                    require_richsync: bool = False, min_rating: int = 0):
    """Pick the candidate whose soft-mapped distribution is nearest the target
    (Euclidean), skipping used tracks and those below the popularity floor.
    Returns (item, distribution_vec) or (None, None)."""
    best, best_vec, best_d = None, None, 1e9
    for item in candidates:
        track = item.get("track") or {}
        ctid = track.get("commontrack_id")
        analysis = item.get("analysis")
        if not ctid or ctid in used or not isinstance(analysis, dict):
            continue
        if require_richsync and not track.get("has_richsync"):
            continue
        if (track.get("track_rating") or 0) < min_rating:
            continue
        dist = softmap.analysis_to_distribution(analysis)
        vec = np.array([dist[n] for n in NODE_NAMES])
        d = float(np.linalg.norm(vec - target))
        if d < best_d:
            best, best_vec, best_d = item, vec, d
    return best, best_vec


# ---- orchestrator -----------------------------------------------------------
def _track_candidate(item: dict, dist_vec: np.ndarray) -> dict:
    """Shape a Musixmatch search item into the contract's TrackCandidate dict."""
    t = item.get("track") or {}
    return {
        "track_id": t.get("track_id"),
        "artist": t.get("artist_name"),
        "title": t.get("track_name"),
        "isrc": t.get("track_isrc"),
        "spotify_id": t.get("track_spotify_id"),
        "distribution": {"weights": _to_dict(dist_vec)},
        "has_richsync": bool(t.get("has_richsync")),
        "track_rating": t.get("track_rating") or 0,
        "similarity_score": None,
        # frontend enrichment (iTunes) fills preview_url / artwork_url later
        "preview_url": None,
        "artwork_url": t.get("album_coverart_350x350") or None,
    }


def build_trajectory(seed_mood: str, shape: str, n_steps: int = 5,
                     end_node: str | None = None) -> dict:
    """Build a Trajectory (contract dict): for each operator target, fetch catalog
    candidates and select the nearest track. transition_reason is left empty for
    the agent to fill."""
    start, targets = operator_targets(shape, seed_mood, n_steps, end_node)
    used: set = set()
    steps: list[dict] = []

    for step_i, target in enumerate(targets, 1):
        candidates = _fetch_candidates(target)
        # graceful cascade: richsync + popular → richsync (any) → any candidate
        item, vec = find_next_track(target, candidates, used,
                                    require_richsync=True, min_rating=MIN_TRACK_RATING)
        if item is None:
            item, vec = find_next_track(target, candidates, used, require_richsync=True)
        if item is None:
            item, vec = find_next_track(target, candidates, used, require_richsync=False)
        if item is None:
            log.warning("step %d: no candidate found for target %s", step_i, _target_moods(target))
            continue
        track = item["track"]
        used.add(track.get("commontrack_id"))
        verse = _citable_verse(item.get("analysis"), target)
        ts = _verse_timestamp(track.get("commontrack_id"), verse) if track.get("has_richsync") else None
        steps.append({
            "target_distribution": {"weights": _to_dict(target)},
            "selected_track": _track_candidate(item, vec),
            "transition_reason": "",  # agent fills this (cites citable_verse)
            "citable_verse": verse,
            "timestamp_in_song": ts,  # seconds, from richsync — for the karaoke jump
        })
        log.info("step %d: %s - %s  (%s)", step_i,
                 track.get("artist_name"), track.get("track_name"),
                 softmap.top_nodes(_to_dict(vec), 3))

    return {
        "shape": shape,
        "start_distribution": {"weights": _to_dict(start)},
        "steps": steps,
    }
