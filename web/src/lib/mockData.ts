// Lyra — dati mock del trajectory engine (fallback se il backend Python è giù).
//
// Canzoni REALI (artist+title) → l'audio preview iTunes funziona davvero.
// Palette: black music (R&B, rap, reggaeton, salsa) con un arco emotivo coerente.
//
// I `citable_verse` sono PLACEHOLDER: i versi veri arrivano a runtime da
// Musixmatch richsync (licenza + regola no-store). Non hardcodiamo lyrics.

import type { MacroNode, Trajectory, TrajectoryShape } from "./types";

// placeholder mostrato finché non c'è il richsync reale
const VERSE = "il verso sincronizzato arriva qui · Musixmatch richsync";

function dist(weights: Partial<Record<MacroNode, number>>) {
  return { weights };
}

let _id = 1000;
function track(
  artist: string,
  title: string,
  weights: Partial<Record<MacroNode, number>>,
  ts: number,
  rating = 60,
) {
  return {
    track_id: _id++,
    artist,
    title,
    distribution: dist(weights),
    has_richsync: true,
    track_rating: rating,
    similarity_score: null,
    citable_verse: VERSE,
    timestamp_in_song: ts,
  };
}

// Deep dive: stessa emozione, sempre più dentro. Melancholia R&B/rap verso il nudo.
const DEEPEN: Trajectory = {
  shape: "deepen",
  start_distribution: dist({ Melancholia: 0.7, Nostalgia: 0.3 }),
  steps: [
    {
      target_distribution: dist({ Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }),
      ...split(track("Frank Ocean", "Self Control", { Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }, 60, 80)),
      transition_reason:
        "Partiamo da dove sei: una malinconia ancora avvolta nel ricordo. Il punto d'ingresso.",
    },
    {
      target_distribution: dist({ Melancholia: 0.5, Solitude: 0.4, Reflection: 0.1 }),
      ...split(track("Drake", "Marvins Room", { Melancholia: 0.5, Solitude: 0.4, Reflection: 0.1 }, 70, 76)),
      transition_reason:
        "Il ricordo si ritira, resta la solitudine — quella delle chiamate fatte a notte fonda.",
    },
    {
      target_distribution: dist({ Melancholia: 0.45, Solitude: 0.35, Reflection: 0.2 }),
      ...split(track("SZA", "Nobody Gets Me", { Melancholia: 0.45, Solitude: 0.35, Reflection: 0.2 }, 41, 74)),
      transition_reason:
        "La solitudine inizia a guardarsi da fuori. Compare la riflessione.",
    },
    {
      target_distribution: dist({ Reflection: 0.5, Solitude: 0.3, Melancholia: 0.2 }),
      ...split(track("J. Cole", "Love Yourz", { Reflection: 0.5, Solitude: 0.3, Melancholia: 0.2 }, 75, 74)),
      transition_reason:
        "Il fondo del deep dive: la riflessione che diventa quasi resa, gratitudine nuda. Da qui si vede tutto.",
    },
  ],
};

// Evolution: te ne vai con passi coerenti. Da Melancholia (R&B) → reggaeton → salsa.
const EVOLVE: Trajectory = {
  shape: "evolve",
  start_distribution: dist({ Melancholia: 0.7, Nostalgia: 0.3 }),
  steps: [
    {
      target_distribution: dist({ Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }),
      ...split(track("Frank Ocean", "Self Control", { Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }, 60, 80)),
      transition_reason: "Stesso punto d'ingresso: malinconia e ricordo.",
    },
    {
      target_distribution: dist({ Melancholia: 0.4, Tenderness: 0.3, Solitude: 0.3 }),
      ...split(track("SZA", "Snooze", { Melancholia: 0.4, Tenderness: 0.3, Solitude: 0.3 }, 35, 78)),
      transition_reason:
        "Primo spostamento: nella malinconia entra una tenerezza. Non un salto, uno scivolamento.",
    },
    {
      target_distribution: dist({ Tenderness: 0.5, Hope: 0.3, Joy: 0.2 }),
      ...split(track("Manuel Turizo", "La Bachata", { Tenderness: 0.5, Hope: 0.3, Joy: 0.2 }, 60, 84)),
      transition_reason:
        "La tenerezza prende ritmo latino e si scalda: arriva la speranza.",
    },
    {
      target_distribution: dist({ Joy: 0.4, Empowerment: 0.3, Defiance: 0.3 }),
      ...split(track("Bad Bunny", "Tití Me Preguntó", { Joy: 0.4, Empowerment: 0.3, Defiance: 0.3 }, 45, 88)),
      transition_reason:
        "L'energia sale, il passo si fa deciso — la malinconia è ormai lontana.",
    },
    {
      target_distribution: dist({ Joy: 0.5, Hope: 0.3, Empowerment: 0.2 }),
      ...split(track("Marc Anthony", "Vivir Mi Vida", { Joy: 0.5, Hope: 0.3, Empowerment: 0.2 }, 55, 84)),
      transition_reason:
        "Destinazione: gioia piena, una salsa che afferma la vita. Il viaggio dalla malinconia è completo.",
    },
  ],
};

// Helper: separa i campi step-level (verse, ts) dal track candidate.
function split(t: ReturnType<typeof track>) {
  const { citable_verse, timestamp_in_song, ...rest } = t;
  return { selected_track: rest, citable_verse, timestamp_in_song };
}

export function getMockTrajectory(shape: TrajectoryShape): Trajectory {
  if (shape === "evolve") return EVOLVE;
  return DEEPEN; // escalate non ancora nei mock → ripiega su deepen
}
