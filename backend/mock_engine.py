"""
MOCK trajectory engine — placeholder deterministico.

Rappresenta la parte di Axel: cammina il grafo dei macro-nodi e produce lo
scheletro `Trajectory` (dati strutturati + verso). NON scrive `transition_reason`
(quello è compito dell'agente). Stasera questo file viene sostituito dall'engine
reale in `engine/` — `app.py` cambierà solo l'import.

Le canzoni sono reali così l'audio preview (iTunes, lato frontend) funziona.
"""

from schema import (
    NodeDistribution,
    TrackCandidate,
    Trajectory,
    TrajectoryStep,
)

_next_id = 1000


def _track(artist, title, weights, verse, ts, rating=60):
    global _next_id
    _next_id += 1
    return TrackCandidate(
        track_id=_next_id,
        artist=artist,
        title=title,
        distribution=NodeDistribution(weights=weights),
        has_richsync=True,
        track_rating=rating,
    ), verse, ts


def _step(weights, track_tuple):
    track, verse, ts = track_tuple
    return TrajectoryStep(
        target_distribution=NodeDistribution(weights=weights),
        selected_track=track,
        transition_reason="",  # lo riempie l'agente
        citable_verse=verse,
        timestamp_in_song=ts,
    )


def _deepen() -> Trajectory:
    return Trajectory(
        shape="deepen",
        start_distribution=NodeDistribution(weights={"Melancholia": 0.7, "Nostalgia": 0.3}),
        steps=[
            _step(
                {"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1},
                _track("Lord Huron", "The Night We Met",
                       {"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1},
                       "I had all and then most of you, some and now none of you", 49, 78),
            ),
            _step(
                {"Melancholia": 0.5, "Solitude": 0.4, "Reflection": 0.1},
                _track("Lorde", "Liability",
                       {"Melancholia": 0.5, "Solitude": 0.4, "Reflection": 0.1},
                       "They say, 'You're a little much for me'", 33, 70),
            ),
            _step(
                {"Melancholia": 0.45, "Solitude": 0.35, "Reflection": 0.2},
                _track("Phoebe Bridgers", "Motion Sickness",
                       {"Melancholia": 0.45, "Solitude": 0.35, "Reflection": 0.2},
                       "I have emotional motion sickness", 41, 64),
            ),
            _step(
                {"Solitude": 0.5, "Reflection": 0.4, "Melancholia": 0.1},
                _track("Bon Iver", "Re: Stacks",
                       {"Solitude": 0.5, "Reflection": 0.4, "Melancholia": 0.1},
                       "This is not the sound of a new man", 200, 58),
            ),
        ],
    )


def _evolve() -> Trajectory:
    return Trajectory(
        shape="evolve",
        start_distribution=NodeDistribution(weights={"Melancholia": 0.7, "Nostalgia": 0.3}),
        steps=[
            _step(
                {"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1},
                _track("Lord Huron", "The Night We Met",
                       {"Melancholia": 0.6, "Nostalgia": 0.3, "Solitude": 0.1},
                       "I had all and then most of you, some and now none of you", 49, 78),
            ),
            _step(
                {"Melancholia": 0.4, "Tenderness": 0.3, "Solitude": 0.3},
                _track("Bon Iver", "Skinny Love",
                       {"Melancholia": 0.4, "Tenderness": 0.3, "Solitude": 0.3},
                       "Come on skinny love, just last the year", 38, 72),
            ),
            _step(
                {"Reflection": 0.4, "Awe": 0.3, "Tenderness": 0.3},
                _track("Bon Iver", "Holocene",
                       {"Reflection": 0.4, "Awe": 0.3, "Tenderness": 0.3},
                       "And at once I knew I was not magnificent", 150, 74),
            ),
            _step(
                {"Tenderness": 0.5, "Hope": 0.4, "Nostalgia": 0.1},
                _track("Bright Eyes", "First Day of My Life",
                       {"Tenderness": 0.5, "Hope": 0.4, "Nostalgia": 0.1},
                       "This is the first day of my life", 12, 66),
            ),
            _step(
                {"Hope": 0.5, "Joy": 0.3, "Tenderness": 0.2},
                _track("The Postal Service", "Such Great Heights",
                       {"Hope": 0.5, "Joy": 0.3, "Tenderness": 0.2},
                       "They will see us waving from such great heights", 27, 70),
            ),
        ],
    )


def build_trajectory(seed_mood: str, shape: str) -> Trajectory:
    """Interfaccia che l'engine reale deve implementare."""
    if shape == "evolve":
        return _evolve()
    return _deepen()
