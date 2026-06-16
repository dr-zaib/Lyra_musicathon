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
    ("Lord Huron", "The Night We Met"):
        "Partiamo da dove sei: una malinconia ancora avvolta nel ricordo. Questo è il punto d'ingresso.",
    ("Lorde", "Liability"):
        "Il ricordo si ritira, resta la solitudine. Stesso sentimento, ma più rivolto verso di te.",
    ("Phoebe Bridgers", "Motion Sickness"):
        "Qui la malinconia inizia a guardarsi da fuori. Compare la riflessione.",
    ("Bon Iver", "Re: Stacks"):
        "Sei al centro: quasi solo riflessione e solitudine. È il fondo del deep dive — il più nudo.",
    ("Bon Iver", "Skinny Love"):
        "Primo spostamento: nella malinconia entra una tenerezza. Non è un salto, è uno scivolamento.",
    ("Bon Iver", "Holocene"):
        "La tenerezza si apre in qualcosa di più vasto: riflessione e una punta di stupore.",
    ("Bright Eyes", "First Day of My Life"):
        "Quasi arrivati: la tenerezza diventa speranza. Sei in un posto diverso da dove hai iniziato.",
    ("The Postal Service", "Such Great Heights"):
        "Destinazione: speranza con dentro la gioia. Il viaggio dalla malinconia è completo.",
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
