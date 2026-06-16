"""Lyra macro-node taxonomy + cached name embeddings (OUR artifact → persistable).

The 12 macro-nodes mirror shared/schema.py::MacroNode. Each node carries a short
gloss (synonyms / felt sense) that anchors its position in embedding space — this
markedly improves the soft-mapping of free-text Musixmatch themes like
"vengeance and forgiveness". Embeddings are computed once with a strong open model
(all-mpnet-base-v2) and cached to data/node_embeddings.npz (no API key, no cost).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

# macro-node name -> gloss. The gloss is embedded together with the name so the
# vector sits where the *feeling* lives, not just where the word lives.
NODES: dict[str, str] = {
    "Melancholia": "melancholy, sadness, sorrow, grief, heavy-heartedness",
    "Reflection":  "reflection, introspection, pensive and quiet thought",
    "Solitude":    "solitude, being alone, withdrawal, isolation, loneliness",
    "Nostalgia":   "nostalgia, longing for the past, memories, bittersweet remembrance",
    "Tenderness":  "tenderness, warmth, affection, love, gentleness, intimacy",
    "Hope":        "hope, optimism, looking forward, faith, better days ahead",
    "Joy":         "joy, happiness, elation, delight, celebration",
    "Awe":         "awe, wonder, amazement, the sublime, vastness",
    "Anxiety":     "anxiety, angst, worry, fear, restlessness, unease, dread",
    "Anger":       "anger, rage, fury, resentment, hostility",
    "Defiance":    "defiance, rebellion, resistance, boldness, standing your ground",
    "Empowerment": "empowerment, strength, confidence, self-belief, power",
}
NODE_NAMES: list[str] = list(NODES)

_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
_CACHE = Path(__file__).parent / "data" / "node_embeddings.npz"

_model = None


def _get_model():
    """Lazy-load the embedding model (downloads ~420MB once, then cached by HF)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed(texts: list[str]) -> np.ndarray:
    """L2-normalized embeddings, so a dot product equals cosine similarity."""
    return _get_model().encode(texts, normalize_embeddings=True, convert_to_numpy=True)


def node_embeddings(rebuild: bool = False) -> np.ndarray:
    """(12, dim) matrix of node embeddings, cached on disk (our own artifact).
    Rebuilds automatically if the node set changed."""
    if _CACHE.exists() and not rebuild:
        data = np.load(_CACHE, allow_pickle=True)
        if list(data["names"]) == NODE_NAMES:
            return data["emb"]
    texts = [f"{name}: {gloss}" for name, gloss in NODES.items()]
    emb = embed(texts)
    _CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez(_CACHE, names=np.array(NODE_NAMES), emb=emb)
    return emb
