"""
MOCK agent — narration placeholder.

Represents the agent's role (datapizza-ai, claude-sonnet-4-6): it takes the
`Trajectory` skeleton from the engine and writes its language — each step's
`transition_reason`, citing the `citable_verse`. Here the texts are canned;
tonight this file becomes the real agent (intent -> seed/shape, LLM-generated
narration).

Keeping the LLM on text ONLY (not on the structured data) is the design choice:
data comes from the engine, the young framework stays on a low-risk task.
"""

from schema import Trajectory

# mock narration per (artist, title) -> reason
_NARRATION = {
    ("Frank Ocean", "Self Control"):
        "We start where you are: a melancholy still wrapped in memory. The entry point.",
    ("Drake", "Passionfruit"):
        "The memory recedes; what's left is solitude — the ache of distance.",
    ("SZA", "Nobody Gets Me"):
        "Solitude starts to look at itself from the outside. Reflection appears.",
    ("J. Cole", "Love Yourz"):
        "The bottom of the deep dive: reflection turning into acceptance, bare gratitude. From here you see it all.",
    ("SZA", "Snooze"):
        "First shift: a tenderness enters the melancholy. Not a jump — a slide.",
    ("Manuel Turizo", "La Bachata"):
        "Tenderness picks up a Latin rhythm and warms: hope arrives.",
    ("Bad Bunny", "Tití Me Preguntó"):
        "The energy rises, the step turns bold — melancholy is far behind now.",
    ("Marc Anthony", "Vivir Mi Vida"):
        "Destination: full joy, a salsa that affirms life. The journey from melancholy is complete.",
}


def narrate(trajectory: Trajectory) -> Trajectory:
    """Fill transition_reason for each step (mock of the LLM output)."""
    for step in trajectory.steps:
        t = step.selected_track
        step.transition_reason = _NARRATION.get(
            (t.artist, t.title),
            f"Passage toward {t.title}.",
        )
    return trajectory
