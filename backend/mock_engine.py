"""
MOCK trajectory engine — placeholder deterministico (parte di Axel).

Produce lo scheletro `Trajectory` (dati strutturati + verso), NON il
`transition_reason` (compito dell'agente). Stasera si sostituisce con l'engine
reale in `engine/` — `app.py` cambia solo l'import.

Canzoni reali (audio iTunes lato frontend), palette black music. I `citable_verse`
sono PLACEHOLDER: i versi veri arrivano da Musixmatch richsync a runtime.
"""

from schema import (
    NodeDistribution,
    TrackCandidate,
    Trajectory,
    TrajectoryStep,
)

# placeholder finché non c'è il richsync reale (no lyrics hardcoded)
VERSE = "il verso sincronizzato arriva qui · Musixmatch richsync"

_next_id = 1000


def _track(artist, title, weights, ts, rating=60):
    global _next_id
    _next_id += 1
    return TrackCandidate(
        track_id=_next_id,
        artist=artist,
        title=title,
        distribution=NodeDistribution(weights=weights),
        has_richsync=True,
        track_rating=rating,
    ), ts


def _step(weights, track_tuple):
    track, ts = track_tuple
    return TrajectoryStep(
        target_distribution=NodeDistribution(weights=weights),
        selected_track=track,
        transition_reason="",  # lo riempie l'agente
        citable_verse=VERSE,
        timestamp_in_song=ts,
    )


def _deepen() -> Trajectory:
    return Trajectory(
        shape="deepen",
        start_distribution=NodeDistribution(weights={"Melancholia": 0.7, "Nostalgia": 0.3}),
        steps=[
            _step({"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1},
                  _track("Frank Ocean", "Self Control", {"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1}, 60, 80)),
            _step({"Melancholia": 0.5, "Solitude": 0.4, "Reflection": 0.1},
                  _track("Drake", "Marvins Room", {"Melancholia": 0.5, "Solitude": 0.4, "Reflection": 0.1}, 70, 76)),
            _step({"Melancholia": 0.45, "Solitude": 0.35, "Reflection": 0.2},
                  _track("SZA", "Nobody Gets Me", {"Melancholia": 0.45, "Solitude": 0.35, "Reflection": 0.2}, 41, 74)),
            _step({"Reflection": 0.5, "Solitude": 0.3, "Melancholia": 0.2},
                  _track("J. Cole", "Love Yourz", {"Reflection": 0.5, "Solitude": 0.3, "Melancholia": 0.2}, 75, 74)),
        ],
    )


def _evolve() -> Trajectory:
    return Trajectory(
        shape="evolve",
        start_distribution=NodeDistribution(weights={"Melancholia": 0.7, "Nostalgia": 0.3}),
        steps=[
            _step({"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1},
                  _track("Frank Ocean", "Self Control", {"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1}, 60, 80)),
            _step({"Melancholia": 0.4, "Tenderness": 0.3, "Solitude": 0.3},
                  _track("SZA", "Snooze", {"Melancholia": 0.4, "Tenderness": 0.3, "Solitude": 0.3}, 35, 78)),
            _step({"Tenderness": 0.5, "Hope": 0.3, "Joy": 0.2},
                  _track("Manuel Turizo", "La Bachata", {"Tenderness": 0.5, "Hope": 0.3, "Joy": 0.2}, 60, 84)),
            _step({"Joy": 0.4, "Empowerment": 0.3, "Defiance": 0.3},
                  _track("Bad Bunny", "Tití Me Preguntó", {"Joy": 0.4, "Empowerment": 0.3, "Defiance": 0.3}, 45, 88)),
            _step({"Joy": 0.5, "Hope": 0.3, "Empowerment": 0.2},
                  _track("Marc Anthony", "Vivir Mi Vida", {"Joy": 0.5, "Hope": 0.3, "Empowerment": 0.2}, 55, 84)),
        ],
    )


def build_trajectory(seed_mood: str, shape: str) -> Trajectory:
    """Interfaccia che l'engine reale deve implementare."""
    if shape == "evolve":
        return _evolve()
    return _deepen()
