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

import json
import logging
import random
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

import musixmatch as mxm
import softmap
from taxonomy import NODE_NAMES, NODES

log = logging.getLogger("lyra.trajectory")

_PREFS_PATH = Path(__file__).parent / "data" / "user_prefs.json"


def load_user_prefs() -> tuple[set, set]:
    """Read the user's ban-list → (banned_artists lowercased, banned_isrcs).
    Respect-by-design: Lyra must never recommend what the user has banned.
    In production this is owned by the host DSP; here it's a local JSON."""
    try:
        p = json.loads(_PREFS_PATH.read_text(encoding="utf-8"))
    except Exception:
        p = {}
    banned_artists = {a.lower().strip() for a in p.get("banned_artists", []) if a}
    banned_isrcs = {s.strip() for s in p.get("banned_isrcs", []) if s}
    return banned_artists, banned_isrcs

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

CANDIDATES_PER_STEP = 60    # wide enough to filter by popularity + nearest, fast to embed
MIN_TRACK_RATING = 20       # popularity floor — surface recognizable tracks (0–100)
DEFAULT_EXPLORE = 0.5       # known/new split default: half new (discovery), half go-to
EXPLORE_FLOOR = 0.15        # always ≥15% new — no filter bubble (settings can't go below)


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


def _dist_to_vec(distribution: dict | None) -> np.ndarray | None:
    """A normalized node vector from an intent distribution dict (≤3 weighted
    nodes), or None when absent/empty so callers fall back to `_soft_start`."""
    if not distribution:
        return None
    v = np.array([float(distribution.get(n, 0.0)) for n in NODE_NAMES])
    return _normalize(v) if v.sum() > 0 else None


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
                     end_node: str | None = None,
                     start_dist: np.ndarray | None = None) -> tuple[np.ndarray, list[np.ndarray]]:
    """Return (start_distribution, [target per step]) for a trajectory shape.
    `start_dist` (the user's full ≤3-node weighted read) overrides the single-seed
    `_soft_start` as the journey's starting point; `seed` (the dominant) still
    anchors the destination (deepen→seed, evolve→default_destination(seed))."""
    start = start_dist if start_dist is not None else _soft_start(seed)
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
    except Exception as exc:  # richsync is optional — never break the journey
        log.warning("richsync lookup failed (%s) — no timestamp.", exc)
        return None
    for ln in lines:
        x = (ln.get("text") or "").lower().strip()
        if x and (x == v or v in x or x in v):
            return ln.get("ts")
    return None


def find_next_track(target: np.ndarray, candidates: list[dict], used: set,
                    require_richsync: bool = False, min_rating: int = 0,
                    banned_artists: set = frozenset(), banned_isrcs: set = frozenset()):
    """Pick the candidate whose soft-mapped distribution is nearest the target
    (Euclidean), skipping used / banned tracks and those below the popularity floor.
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
        # respect-by-design: never recommend a banned artist / track
        if (track.get("artist_name") or "").lower().strip() in banned_artists:
            continue
        if (track.get("track_isrc") or "") in banned_isrcs:
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


def _all_labels(cand_lists: list[list[dict]]) -> list[str]:
    """Every mood/theme label across all candidates (to batch-embed at once)."""
    labels: list[str] = []
    for candidates in cand_lists:
        for item in candidates:
            an = item.get("analysis")
            if not isinstance(an, dict):
                continue
            labels += (an.get("moods") or {}).get("main_moods") or []
            labels += [t.get("theme") for t in ((an.get("themes") or {}).get("main_themes") or [])]
    return [l for l in labels if l]


def _select(target, candidates, used, banned_artists=frozenset(), banned_isrcs=frozenset()):
    """Graceful cascade: richsync + popular → richsync (any) → any candidate.
    The ban-list is enforced at every tier (never relaxed)."""
    ban = dict(banned_artists=banned_artists, banned_isrcs=banned_isrcs)
    item, vec = find_next_track(target, candidates, used,
                                require_richsync=True, min_rating=MIN_TRACK_RATING, **ban)
    if item is None:
        item, vec = find_next_track(target, candidates, used, require_richsync=True, **ban)
    if item is None:
        item, vec = find_next_track(target, candidates, used, require_richsync=False, **ban)
    return item, vec


# ---- serendipity pool (shuffle): go-to ∪ new-but-similar discovery ----------
MXM_MOODS = {
    "Love", "Heartbreak", "Joy", "Empowerment", "Angst", "Reflection", "Inspiration",
    "Nostalgia", "Despair", "Celebration", "Anger", "Peace", "Solitude", "Adventure",
    "Social Commentary", "Hope", "Spirituality", "Freedom", "Party", "Nature",
}
_GO_TO_PATH = Path(__file__).parent / "data" / "seed_enriched.json"


def load_go_to() -> list[dict]:
    """The user's go-to pool (the seed from their own playlists), with lyrics analysis.
    In production this is the host DSP's user profile."""
    try:
        seed = json.loads(_GO_TO_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    return [t for t in seed if t.get("commontrack_id") and t.get("mxm_has_lyrics")]


def _norm_mood(m: str) -> str | None:
    t = " ".join(w.capitalize() for w in (m or "").split())
    return t if t in MXM_MOODS else None


def _go_to_item(track: dict) -> dict:
    """analysis.get a go-to track → a {track, analysis} item shaped like a search hit."""
    try:
        an = mxm.get_analysis(track["commontrack_id"])
    except Exception:
        an = None
    return {
        "track": {
            "track_id": track.get("mxm_track_id"),
            "commontrack_id": track["commontrack_id"],
            "artist_name": track.get("artist"),
            "track_name": track.get("title"),
            "track_isrc": track.get("isrc"),
            "track_spotify_id": track.get("spotify_id"),
            "has_richsync": bool(track.get("mxm_has_richsync")),
            "track_rating": track.get("spotify_popularity") or 0,
            "album_coverart_350x350": None,
        },
        "analysis": an if isinstance(an, dict) else {},
    }


def _taste_moods(go_to: list[dict], k: int = 3) -> list[str]:
    """Sample a few go-to tracks → their Musixmatch moods = the user's taste seed."""
    moods: list[str] = []
    for t in random.sample(go_to, min(k, len(go_to))):
        try:
            an = mxm.get_analysis(t["commontrack_id"])
        except Exception:
            an = None
        if isinstance(an, dict):
            for m in (an.get("moods") or {}).get("main_moods") or []:
                nm = _norm_mood(m)
                if nm and nm not in moods:
                    moods.append(nm)
    return moods[:5] or ["Reflection"]


def _discovery_pool(go_to, exclude_ctids, banned_artists, banned_isrcs) -> list[dict]:
    """New-but-similar: analysis.search seeded by the user's taste, OPEN popularity
    (niche welcome), excluding the go-to themselves + used + banned."""
    try:
        items = mxm.search_analysis({"moods": _taste_moods(go_to), "lyrics_language": "en"},
                                    page_size=CANDIDATES_PER_STEP)
    except mxm.MusixmatchError:
        items = []
    pool = []
    for it in items:
        tr = it.get("track") or {}
        ctid = tr.get("commontrack_id")
        if (not ctid or ctid in exclude_ctids
                or (tr.get("artist_name") or "").lower().strip() in banned_artists
                or (tr.get("track_isrc") or "") in banned_isrcs
                or not isinstance(it.get("analysis"), dict)):
            continue
        pool.append(it)
    return pool


def _serendipity_picks(n, used, banned_artists, banned_isrcs, go_to) -> list[tuple]:
    """n serendipity picks alternating comfort (go-to) and discovery (new-but-similar).
    Each pick's OWN distribution is its 'target' (serendipity isn't aimed)."""
    if n <= 0 or not go_to:
        return []
    go_ctids = {t["commontrack_id"] for t in go_to}
    discovery = _discovery_pool(go_to, used | go_ctids, banned_artists, banned_isrcs)
    random.shuffle(discovery)
    go_pool = [t for t in go_to
               if (t.get("artist") or "").lower().strip() not in banned_artists
               and (t.get("isrc") or "") not in banned_isrcs]
    random.shuffle(go_pool)

    picks, di = [], 0
    for i in range(n):
        item = None
        if i % 2 == 0:  # comfort (go-to) on even slots
            while go_pool:
                cand = go_pool.pop()
                if cand["commontrack_id"] in used:
                    continue
                cand_item = _go_to_item(cand)
                if isinstance(cand_item.get("analysis"), dict) and cand_item["analysis"]:
                    item = cand_item
                    break
        if item is None:  # discovery (or go-to exhausted)
            while di < len(discovery):
                cand = discovery[di]; di += 1
                if (cand.get("track") or {}).get("commontrack_id") not in used:
                    item = cand
                    break
        if item is None:
            continue
        used.add(item["track"]["commontrack_id"])
        an = item.get("analysis")
        dist = softmap.analysis_to_distribution(an if isinstance(an, dict) else {})
        vec = np.array([dist[nn] for nn in NODE_NAMES])
        picks.append((vec, item, vec, _citable_verse(an, vec)))
    return picks


def _targeted_picks(seed_mood, shape, n, end_node, used, banned_artists, banned_isrcs,
                    start_dist=None) -> list[tuple]:
    """The aimed part of the journey: n steps toward the operator's targets."""
    if n <= 0:
        return []
    _, targets = operator_targets(shape, seed_mood, n, end_node, start_dist)
    with ThreadPoolExecutor(max_workers=min(8, len(targets) or 1)) as ex:
        cand_lists = list(ex.map(_fetch_candidates, targets))
    softmap.prewarm(_all_labels(cand_lists))
    picks = []
    for target, candidates in zip(targets, cand_lists):
        item, vec = _select(target, candidates, used, banned_artists, banned_isrcs)
        if item is None:
            log.warning("no candidate for target %s", _target_moods(target))
            continue
        used.add(item["track"].get("commontrack_id"))
        picks.append((target, item, vec, _citable_verse(item.get("analysis"), target)))
    return picks


# ---- entry list + refill (the playback flow's instant-audio + skip) ---------
def _explore(known_new: float | None) -> float:
    """Resolve the known/new ratio to a NEW fraction, never below the floor."""
    kn = DEFAULT_EXPLORE if known_new is None else known_new
    return max(EXPLORE_FLOOR, min(1.0, kn))


def _resolve_target(distribution: dict | None, seed_mood: str | None) -> np.ndarray:
    """A target vector from an intent distribution (preferred) or a seed mood."""
    if distribution:
        v = np.array([float(distribution.get(n, 0.0)) for n in NODE_NAMES])
        if v.sum() > 0:
            return _normalize(v)
    if seed_mood:
        return _soft_start(seed_mood)
    return np.full(len(NODE_NAMES), 1.0 / len(NODE_NAMES))


def _rank_items(items, target, exclude_ctids, banned_artists, banned_isrcs):
    """Soft-map each {track, analysis} item and rank by nearness to target.
    Returns [(distance, item, vec)] sorted closest-first, ban/exclude filtered."""
    scored = []
    for it in items:
        tr = it.get("track") or {}
        ctid = tr.get("commontrack_id")
        an = it.get("analysis")
        if (not ctid or ctid in exclude_ctids or not isinstance(an, dict) or not an
                or (tr.get("artist_name") or "").lower().strip() in banned_artists
                or (tr.get("track_isrc") or "") in banned_isrcs):
            continue
        dist = softmap.analysis_to_distribution(an)
        vec = np.array([dist[n] for n in NODE_NAMES])
        scored.append((float(np.linalg.norm(vec - target)), it, vec))
    scored.sort(key=lambda x: x[0])
    return scored


def _new_ranked(target, exclude_ctids, banned_artists, banned_isrcs):
    """NEW pool: catalog candidates for the target (analysis.search), ranked."""
    items = _fetch_candidates(target)
    softmap.prewarm(_all_labels([items]))
    return _rank_items(items, target, exclude_ctids, banned_artists, banned_isrcs)


def _known_ranked(target, n_known, banned_artists, banned_isrcs, go_to, exclude_ctids):
    """KNOWN pool: a sample of the user's go-to, analyzed in parallel and ranked
    by nearness to the target (so 'known' is also mood-coherent). The sample is
    kept small (≈3× the slots) so the live analysis.get calls stay fast."""
    if n_known <= 0 or not go_to:
        return []
    pool = [t for t in go_to if t["commontrack_id"] not in exclude_ctids]
    sample = random.sample(pool, min(len(pool), max(6, n_known * 3)))
    with ThreadPoolExecutor(max_workers=min(12, len(sample) or 1)) as ex:
        items = list(ex.map(_go_to_item, sample))
    softmap.prewarm(_all_labels([items]))
    return _rank_items(items, target, exclude_ctids, banned_artists, banned_isrcs)


def _pools_parallel(target, n_new, n_known, banned_artists, banned_isrcs,
                    go_to, new_exclude, known_exclude):
    """Fetch the NEW and KNOWN pools concurrently (independent HTTP) — the entry
    list's latency becomes max(new, known), not their sum."""
    with ThreadPoolExecutor(max_workers=2) as ex:
        fu_new = ex.submit(_new_ranked, target, new_exclude, banned_artists, banned_isrcs)
        fu_known = ex.submit(_known_ranked, target, n_known, banned_artists, banned_isrcs,
                             go_to, known_exclude)
        new_ranked = fu_new.result()[: n_new + 3]
        known_ranked = fu_known.result()[: n_known + 2]
    return new_ranked, known_ranked


def _interleave(new_ranked, known_ranked, n) -> list[dict]:
    """Weave new + known into n TrackCandidate dicts (new first = strongest mood
    match for the instant entry track), de-duped, preserving the known/new counts."""
    out, used = [], set()
    ni = ki = 0
    take_new = True
    while len(out) < n and (ni < len(new_ranked) or ki < len(known_ranked)):
        src = new_ranked if (take_new and ni < len(new_ranked)) else known_ranked
        if src is known_ranked and ki >= len(known_ranked):
            src = new_ranked
        if src is new_ranked:
            if ni >= len(new_ranked):
                take_new = False
                continue
            _, item, vec = new_ranked[ni]; ni += 1
        else:
            _, item, vec = known_ranked[ki]; ki += 1
        ctid = item["track"].get("commontrack_id")
        if ctid in used:
            continue
        used.add(ctid)
        out.append(_track_candidate(item, vec))
        take_new = not take_new
    return out


def entry_candidates(seed_mood: str | None = None, distribution: dict | None = None,
                     n: int = 6, known_new: float | None = None) -> list[dict]:
    """A skippable list of N entry candidates for a mood — mood-coherent, mixing
    KNOWN (go-to) and NEW (discovery) per the known/new ratio. The player starts
    candidate[0] immediately and lets the user skip down the list."""
    target = _resolve_target(distribution, seed_mood)
    explore = _explore(known_new)
    n_new = min(n, max(round(explore * n), 1))
    n_known = n - n_new

    banned_artists, banned_isrcs = load_user_prefs()
    go_to = load_go_to()
    go_ctids = {t["commontrack_id"] for t in go_to}

    new_ranked, known_ranked = _pools_parallel(
        target, n_new, n_known, banned_artists, banned_isrcs, go_to,
        new_exclude=go_ctids, known_exclude=set())
    return _interleave(new_ranked, known_ranked, n)


def _centroid(remaining: list[dict]) -> np.ndarray:
    """The mean distribution of the remaining candidates — seeds the refill search
    so the queue drifts toward what the user has NOT skipped (similarity)."""
    vecs = []
    for tc in remaining or []:
        w = (tc.get("distribution") or {}).get("weights") or {}
        v = np.array([float(w.get(n, 0.0)) for n in NODE_NAMES])
        if v.sum() > 0:
            vecs.append(v)
    if not vecs:
        return np.full(len(NODE_NAMES), 1.0 / len(NODE_NAMES))
    return _normalize(np.mean(vecs, axis=0))


def refill_candidates(remaining: list[dict], exclude_isrcs: list[str] | None = None,
                      n: int = 6, known_new: float | None = None) -> list[dict]:
    """More candidates seeded on the centroid of what's left in the queue (so the
    list stays similar to the un-skipped tracks), same known/new mix. Append these
    to the player's queue when it drops below ~3."""
    target = _centroid(remaining)
    explore = _explore(known_new)
    n_new = min(n, max(round(explore * n), 1))
    n_known = n - n_new

    banned_artists, banned_isrcs = load_user_prefs()
    banned_isrcs = banned_isrcs | set(exclude_isrcs or [])
    go_to = load_go_to()
    go_ctids = {t["commontrack_id"] for t in go_to}

    new_ranked, known_ranked = _pools_parallel(
        target, n_new, n_known, banned_artists, banned_isrcs, go_to,
        new_exclude=go_ctids, known_exclude=set())
    return _interleave(new_ranked, known_ranked, n)


def build_trajectory(seed_mood: str, shape: str, n_steps: int = 5,
                     end_node: str | None = None, shuffle: float = 0.0,
                     exclude_isrcs: list[str] | None = None,
                     seed_distribution: dict | None = None) -> dict:
    """Build a Trajectory (contract dict). `shuffle` (0..1) is the serendipity
    fraction: that share of the journey is drawn from the user's go-to ∪ discovery
    (comfort + new-but-similar), the rest is aimed at the trajectory's targets.
    `seed_distribution` (the user's full ≤3-node weighted read) sets the journey's
    starting point; absent → the single-seed `_soft_start`. transition_reason is
    left empty for the agent to fill."""
    shuffle = max(0.0, min(1.0, shuffle))
    n_ser = round(shuffle * n_steps)
    n_tgt = n_steps - n_ser
    start_dist = _dist_to_vec(seed_distribution)

    banned_artists, banned_isrcs = load_user_prefs()
    banned_isrcs = banned_isrcs | set(exclude_isrcs or [])  # already-played (entry/skips)
    used: set = set()

    picks = _targeted_picks(seed_mood, shape, n_tgt, end_node, used, banned_artists,
                            banned_isrcs, start_dist)
    if n_ser > 0:
        picks += _serendipity_picks(n_ser, used, banned_artists, banned_isrcs, load_go_to())

    # richsync timestamps in parallel (HTTP only)
    def _ts(pick):
        _, item, _, verse = pick
        t = item["track"]
        return _verse_timestamp(t.get("commontrack_id"), verse) if t.get("has_richsync") else None

    with ThreadPoolExecutor(max_workers=min(8, len(picks) or 1)) as ex:
        timestamps = list(ex.map(_ts, picks)) if picks else []

    # assemble the steps
    start = operator_targets(shape, seed_mood, 1, end_node, start_dist)[0]
    steps = []
    for (target, item, vec, verse), ts in zip(picks, timestamps):
        steps.append({
            "target_distribution": {"weights": _to_dict(target)},
            "selected_track": _track_candidate(item, vec),
            "transition_reason": "",  # agent fills this (cites citable_verse)
            "citable_verse": verse,
            "timestamp_in_song": ts,  # seconds, from richsync — for the karaoke jump
        })

    return {
        "shape": shape,
        "start_distribution": {"weights": _to_dict(start)},
        "steps": steps,
    }
