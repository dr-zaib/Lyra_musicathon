"""
MOCK agent — placeholder della narrazione.

Rappresenta il ruolo dell'agente (datapizza-ai, claude-sonnet-4-6): prende lo
scheletro `Trajectory` dall'engine e ne scrive il linguaggio — il `transition_reason`
di ogni step, citando il `citable_verse`. Qui i testi sono canned; stasera questo
file diventa l'agente vero (intent -> seed/shape, narrazione generata dall'LLM).

Tenere l'LLM SOLO sul testo (non sui dati strutturati) è la scelta di design:
i dati vengono dall'engine, il framework giovane sta su un compito a basso rischio.
"""

from schema import Trajectory

# narrazione mock per (artist, title) -> reason
_NARRATION = {
    ("Frank Ocean", "Self Control"):
        "Partiamo da dove sei: una malinconia ancora avvolta nel ricordo. Il punto d'ingresso.",
    ("Drake", "Marvins Room"):
        "Il ricordo si ritira, resta la solitudine — quella delle chiamate fatte a notte fonda.",
    ("SZA", "Nobody Gets Me"):
        "La solitudine inizia a guardarsi da fuori. Compare la riflessione.",
    ("J. Cole", "Love Yourz"):
        "Il fondo del deep dive: la riflessione che diventa quasi resa, gratitudine nuda. Da qui si vede tutto.",
    ("SZA", "Snooze"):
        "Primo spostamento: nella malinconia entra una tenerezza. Non un salto, uno scivolamento.",
    ("Manuel Turizo", "La Bachata"):
        "La tenerezza prende ritmo latino e si scalda: arriva la speranza.",
    ("Bad Bunny", "Tití Me Preguntó"):
        "L'energia sale, il passo si fa deciso — la malinconia è ormai lontana.",
    ("Marc Anthony", "Vivir Mi Vida"):
        "Destinazione: gioia piena, una salsa che afferma la vita. Il viaggio dalla malinconia è completo.",
}


def narrate(trajectory: Trajectory) -> Trajectory:
    """Riempie transition_reason per ogni step (mock dell'output LLM)."""
    for step in trajectory.steps:
        t = step.selected_track
        step.transition_reason = _NARRATION.get(
            (t.artist, t.title),
            f"Passaggio verso {t.title}.",
        )
    return trajectory
