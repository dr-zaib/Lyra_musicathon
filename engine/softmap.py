"""Soft-mapping: Musixmatch mood/theme labels → distribution over the 12 macro-nodes.

Deterministic core: cosine similarity between a label embedding and the cached
node embeddings, turned into a distribution via tempered softmax. For free-text
themes that map ambiguously (low max-similarity), an optional **Claude fallback**
refines the distribution — active only if ANTHROPIC_API_KEY is set (the same key
the agent uses). Without the key, the embedding result is used as-is.

A track's distribution = normalized weighted sum of its mood/theme label
distributions (moods weigh more than themes by default).
"""
from __future__ import annotations

import os
import json
import logging

import numpy as np

from taxonomy import NODE_NAMES, node_embeddings, embed

log = logging.getLogger("lyra.softmap")

SOFTMAX_TEMP = 0.10         # lower = sharper distribution over nodes
FALLBACK_THRESHOLD = 0.34   # max cosine below this → ambiguous → try Claude
MOOD_WEIGHT = 1.0           # moods are direct emotion
THEME_WEIGHT = 0.6          # themes are topical → contribute less

_fallback_cache: dict[str, dict[str, float]] = {}
_dist_cache: dict[str, dict[str, float]] = {}  # label → distribution (moods recur a lot)


def _softmax(x: np.ndarray, temp: float) -> np.ndarray:
    z = (x - x.max()) / temp
    e = np.exp(z)
    return e / e.sum()


def _embedding_distribution(label: str) -> tuple[dict[str, float], float]:
    """Pure-embedding map of one label → (distribution, confidence=max cosine)."""
    nodes = node_embeddings()
    v = embed([label])[0]
    sims = nodes @ v  # cosine (both L2-normalized)
    conf = float(sims.max())
    weights = _softmax(sims, SOFTMAX_TEMP)
    dist = {NODE_NAMES[i]: float(weights[i]) for i in range(len(NODE_NAMES))}
    return dist, conf


def _claude_distribution(label: str) -> dict[str, float] | None:
    """Ask Claude to spread one label over the macro-nodes. Returns a normalized
    distribution dict, or None if no key / SDK / parse failure (caller falls back
    to the embedding result). Same model family as the agent."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    if label in _fallback_cache:
        return _fallback_cache[label]
    try:
        import anthropic  # lazy: only needed when the fallback fires
        client = anthropic.Anthropic()
        prompt = (
            "Map the lyric theme/mood below onto these 12 emotional macro-nodes, "
            "as weights that sum to 1 (use 0 for irrelevant nodes). "
            "Reply with ONLY a JSON object {node: weight}.\n\n"
            f"Nodes: {', '.join(NODE_NAMES)}\n"
            f"Theme/mood: \"{label}\""
        )
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        text = text[text.find("{"): text.rfind("}") + 1]
        raw = json.loads(text)
        dist = {n: float(raw.get(n, 0.0)) for n in NODE_NAMES}
        total = sum(dist.values())
        if total <= 0:
            return None
        dist = {n: w / total for n, w in dist.items()}
        _fallback_cache[label] = dist
        return dist
    except Exception as exc:  # never let the fallback break the pipeline
        log.warning("Claude fallback failed for %r: %s", label, exc)
        return None


def label_to_distribution(label: str) -> dict[str, float]:
    """One mood/theme label → distribution over the 12 nodes. Uses the embedding
    map; if the label is ambiguous (low confidence) and Claude is available,
    refines it with the LLM."""
    if label in _dist_cache:
        return _dist_cache[label]
    dist, conf = _embedding_distribution(label)
    if conf < FALLBACK_THRESHOLD:
        refined = _claude_distribution(label)
        if refined is not None:
            log.info("soft-map fallback→Claude for %r (conf %.2f)", label, conf)
            dist = refined
    _dist_cache[label] = dist
    return dist


def prewarm(labels) -> None:
    """Batch-embed all not-yet-cached labels in ONE mpnet call and fill the cache.
    Big latency win when soft-mapping ~hundreds of candidate labels (vs one-by-one).
    Uses the embedding result only (skips the per-label Claude fallback — intent
    reading is where the LLM matters, not bulk candidate mapping)."""
    todo = [l for l in dict.fromkeys(labels) if l and l not in _dist_cache]
    if not todo:
        return
    nodes = node_embeddings()
    vecs = embed(todo)
    for label, v in zip(todo, vecs):
        weights = _softmax(nodes @ v, SOFTMAX_TEMP)
        _dist_cache[label] = {NODE_NAMES[i]: float(weights[i]) for i in range(len(NODE_NAMES))}


def text_to_intent(text: str, top_k: int = 3) -> tuple[dict[str, float], float]:
    """STUB intent reader (placeholder for the LLM agent): free text → (distribution
    over the top-k nodes summing to 1, confidence=max cosine). Embeds the whole
    sentence and cosine-maps to the nodes. The real agent replaces this with a
    proper reading (+ shuffle)."""
    nodes = node_embeddings()
    v = embed([text])[0]
    sims = nodes @ v
    conf = float(sims.max())
    order = np.argsort(sims)[::-1][:top_k]
    sub = _softmax(sims[order], SOFTMAX_TEMP)
    dist = {NODE_NAMES[int(order[i])]: float(sub[i]) for i in range(len(order))}
    return dist, conf


def _normalize(dist: dict[str, float]) -> dict[str, float]:
    total = sum(dist.values())
    if total <= 0:
        return {n: 1.0 / len(NODE_NAMES) for n in NODE_NAMES}
    return {n: w / total for n, w in dist.items()}


def analysis_to_distribution(analysis: dict) -> dict[str, float]:
    """A Musixmatch `analysis` object → one normalized distribution over nodes.
    Combines `moods.main_moods` (weight MOOD_WEIGHT) and `themes.main_themes[].theme`
    (weight THEME_WEIGHT) as a weighted sum of their label distributions."""
    acc = {n: 0.0 for n in NODE_NAMES}
    if not isinstance(analysis, dict):
        return _normalize(acc)  # empty/odd payload → uniform after normalize

    moods_obj = analysis.get("moods")
    moods = moods_obj.get("main_moods") if isinstance(moods_obj, dict) else []
    themes_obj = analysis.get("themes")
    theme_items = themes_obj.get("main_themes") if isinstance(themes_obj, dict) else []
    themes = [t.get("theme") for t in (theme_items or []) if isinstance(t, dict)]

    for label in moods:
        if not label:
            continue
        for n, w in label_to_distribution(label).items():
            acc[n] += MOOD_WEIGHT * w
    for label in themes:
        if not label:
            continue
        for n, w in label_to_distribution(label).items():
            acc[n] += THEME_WEIGHT * w

    return _normalize(acc)


def top_nodes(dist: dict[str, float], k: int = 3) -> list[tuple[str, float]]:
    """The k highest-weight nodes — handy for logging/inspection."""
    return sorted(dist.items(), key=lambda kv: kv[1], reverse=True)[:k]
