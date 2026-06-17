"""Lyra agent — the language layer (datapizza-ai + Claude, claude-sonnet-4-6).

The LLM works on TEXT only (the engine owns the structured trajectory data):
- interpret(message): the listener's words → intent (≤3 weighted macro-nodes +
  shuffle + confidence), the journey shape, and the agent's conversational reply.
- narrate(trajectory): fill each step's transition_reason, citing the verse.

Degrades gracefully (neutral intent / empty reasons) if the LLM call fails, so the
demo never dies. Needs ANTHROPIC_API_KEY (loaded from engine/.env).
"""
from __future__ import annotations

import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

from schema import MacroNode, TrajectoryShape, Trajectory

# ANTHROPIC_API_KEY lives in engine/.env (also check backend/.env)
load_dotenv(Path(__file__).parent.parent / "engine" / ".env")
load_dotenv(Path(__file__).parent / ".env")

log = logging.getLogger("lyra.agent")

MODEL = "claude-sonnet-4-6"
NODES = [
    "Melancholia", "Reflection", "Solitude", "Nostalgia", "Tenderness", "Hope",
    "Joy", "Awe", "Anxiety", "Anger", "Defiance", "Empowerment",
]
_SYSTEM = (
    "You are Lyra, a lyrics-first music companion. You map a listener's feelings onto "
    "12 emotional macro-nodes and guide them on a short journey across songs, citing the "
    "line that marks each passage. Nodes: " + ", ".join(NODES) + ". "
    "Be warm, concise and perceptive — never clinical."
)

_client = None


def _first(structured_data):
    """datapizza returns structured_data as a list of parsed models — take the first."""
    if isinstance(structured_data, list):
        return structured_data[0] if structured_data else None
    return structured_data


def _get_client():
    global _client
    if _client is None:
        from datapizza.clients.anthropic import AnthropicClient
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("Missing ANTHROPIC_API_KEY (put it in engine/.env)")
        _client = AnthropicClient(api_key=key, model=MODEL, system_prompt=_SYSTEM)
    return _client


# ---- intent: text -> weighted nodes + shuffle + confidence + shape ----------
class _MoodWeight(BaseModel):
    node: MacroNode
    weight: float


class _Intent(BaseModel):
    moods: list[_MoodWeight]   # up to 3; weights are relative (renormalized below)
    shuffle: float             # 0..1 — neutral/serendipity remainder
    confidence: float          # 0..1 — how clearly you understood
    shape: TrajectoryShape     # deepen | evolve | escalate
    end_mood: MacroNode        # destination feeling (evolve/escalate); = seed for deepen


def interpret(message: str) -> dict:
    """The listener's words → an intent dict ready for an AgentTurn. Lyra is a
    recsys, not a chatbot: interpret READS the feeling (no conversational reply —
    the agent's only language output is the per-step narration in narrate())."""
    try:
        prompt = (
            f'The listener said: "{message}"\n\n'
            "Read their emotional state. Pick the 1-3 most relevant macro-nodes and weight them. "
            "Use `shuffle` (higher when they're vague or open to surprise) for the neutral remainder. "
            "Set `confidence` to how clearly you understood them. Choose a journey `shape`: "
            "deepen (stay, go deeper), evolve (move to a different feeling), escalate (raise intensity). "
            "Set `end_mood`: the destination the journey should arrive at — for evolve/escalate choose "
            "where to take them (e.g. from grief toward acceptance or hope, not somewhere jarring); "
            "for deepen set it to their dominant mood."
        )
        resp = _get_client().structured_response(input=prompt, output_cls=_Intent, max_tokens=500)
        intent: _Intent = _first(resp.structured_data)
        shuffle = max(0.0, min(1.0, intent.shuffle))
        weights = {m.node: max(0.0, m.weight) for m in intent.moods[:3]}
        s = sum(weights.values())
        if s > 0:  # renormalize the nodes to sum to (1 - shuffle)
            weights = {k: v / s * (1 - shuffle) for k, v in weights.items()}
        seed = max(weights, key=weights.get) if weights else "Melancholia"
        return {
            "distribution": weights,
            "shuffle": shuffle,
            "confidence": max(0.0, min(1.0, intent.confidence)),
            "seed_mood": seed,
            "shape": intent.shape,
            "end_mood": intent.end_mood,
            "message": "",  # no conversational commentary — Lyra is a recsys, not a chatbot
        }
    except Exception as exc:  # never break the turn
        log.warning("interpret() fell back: %s", exc)
        return {
            "distribution": {"Melancholia": 1.0}, "shuffle": 0.0, "confidence": 0.0,
            "seed_mood": "Melancholia", "shape": "deepen", "end_mood": "Melancholia",
            "message": "",
        }


# ---- narration: fill each step's transition_reason --------------------------
class _Reasons(BaseModel):
    reasons: list[str]  # exactly one per step, in order


def narrate(trajectory: Trajectory) -> Trajectory:
    """Fill each step's transition_reason (the agent's voice), citing the verse.
    One LLM call for the whole journey."""
    if not trajectory.steps:
        return trajectory
    try:
        lines = []
        for i, step in enumerate(trajectory.steps, 1):
            t = step.selected_track
            w = step.target_distribution.weights
            dom = max(w, key=w.get) if w else "?"
            lines.append(f'{i}. {t.artist} — {t.title} (toward {dom}); line: "{step.citable_verse or ""}"')
        prompt = (
            f"This is a '{trajectory.shape}' journey. For each step write ONE short sentence "
            "(your voice) explaining the emotional passage into that song, weaving in the cited line. "
            "Return exactly one reason per step, in order.\n\n" + "\n".join(lines)
        )
        resp = _get_client().structured_response(input=prompt, output_cls=_Reasons, max_tokens=900)
        parsed = _first(resp.structured_data)
        for step, reason in zip(trajectory.steps, parsed.reasons if parsed else []):
            step.transition_reason = reason
    except Exception as exc:  # leave reasons empty rather than break the demo
        log.warning("narrate() fell back (empty reasons): %s", exc)
    return trajectory
