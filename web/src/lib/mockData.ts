// Lyra — dati mock del trajectory engine.
//
// Finché non arriva la API key Musixmatch (poche ore prima del kickoff) e il
// motore vero di Axel, il frontend gira contro questi dati. Le CANZONI sono reali
// (artist + title veri) così l'audio preview da iTunes funziona davvero: la demo
// suona, anche se la "logica" di traiettoria è ancora finta.
//
// Quando il motore vero esiste, basta che `/api/trajectory` smetta di restituire
// questi oggetti e proxi il backend di Axel. Il resto del frontend non cambia.

import type { MacroNode, Trajectory, TrajectoryShape } from "./types";

function dist(weights: Partial<Record<MacroNode, number>>) {
  return { weights };
}

let _id = 1000;
function track(
  artist: string,
  title: string,
  weights: Partial<Record<MacroNode, number>>,
  verse: string,
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
    citable_verse: verse,
    timestamp_in_song: ts,
  };
}

// Deep dive: stessa emozione, sempre più dentro. Da Melancholia verso la
// solitudine/riflessione più nuda.
const DEEPEN: Trajectory = {
  shape: "deepen",
  start_distribution: dist({ Melancholia: 0.7, Nostalgia: 0.3 }),
  steps: [
    {
      target_distribution: dist({ Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }),
      ...split(
        track(
          "Lord Huron",
          "The Night We Met",
          { Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 },
          "I had all and then most of you, some and now none of you",
          49,
          78,
        ),
      ),
      transition_reason:
        "Partiamo da dove sei: una malinconia ancora avvolta nel ricordo. Questo è il punto d'ingresso.",
    },
    {
      target_distribution: dist({ Melancholia: 0.5, Solitude: 0.4, Reflection: 0.1 }),
      ...split(
        track(
          "Lorde",
          "Liability",
          { Melancholia: 0.5, Solitude: 0.4, Reflection: 0.1 },
          "They say, 'You're a little much for me'",
          33,
          70,
        ),
      ),
      transition_reason:
        "Il ricordo si ritira, resta la solitudine. Stesso sentimento, ma più rivolto verso di te.",
    },
    {
      target_distribution: dist({ Melancholia: 0.45, Solitude: 0.35, Reflection: 0.2 }),
      ...split(
        track(
          "Phoebe Bridgers",
          "Motion Sickness",
          { Melancholia: 0.45, Solitude: 0.35, Reflection: 0.2 },
          "I have emotional motion sickness",
          41,
          64,
        ),
      ),
      transition_reason:
        "Qui la malinconia inizia a guardarsi da fuori. Compare la riflessione.",
    },
    {
      target_distribution: dist({ Solitude: 0.5, Reflection: 0.4, Melancholia: 0.1 }),
      ...split(
        track(
          "Bon Iver",
          "Re: Stacks",
          { Solitude: 0.5, Reflection: 0.4, Melancholia: 0.1 },
          "This is not the sound of a new man",
          200,
          58,
        ),
      ),
      transition_reason:
        "Sei al centro: quasi solo riflessione e solitudine. È il fondo del deep dive — il più nudo.",
    },
  ],
};

// Evolution: te ne vai, ma con passi coerenti. Da Melancholia verso Hope.
const EVOLVE: Trajectory = {
  shape: "evolve",
  start_distribution: dist({ Melancholia: 0.7, Nostalgia: 0.3 }),
  steps: [
    {
      target_distribution: dist({ Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }),
      ...split(
        track(
          "Lord Huron",
          "The Night We Met",
          { Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 },
          "I had all and then most of you, some and now none of you",
          49,
          78,
        ),
      ),
      transition_reason: "Stesso punto d'ingresso: malinconia e ricordo.",
    },
    {
      target_distribution: dist({ Melancholia: 0.4, Tenderness: 0.3, Solitude: 0.3 }),
      ...split(
        track(
          "Bon Iver",
          "Skinny Love",
          { Melancholia: 0.4, Tenderness: 0.3, Solitude: 0.3 },
          "Come on skinny love, just last the year",
          38,
          72,
        ),
      ),
      transition_reason:
        "Primo spostamento: nella malinconia entra una tenerezza. Non è un salto, è uno scivolamento.",
    },
    {
      target_distribution: dist({ Reflection: 0.4, Awe: 0.3, Tenderness: 0.3 }),
      ...split(
        track(
          "Bon Iver",
          "Holocene",
          { Reflection: 0.4, Awe: 0.3, Tenderness: 0.3 },
          "And at once I knew I was not magnificent",
          150,
          74,
        ),
      ),
      transition_reason:
        "La tenerezza si apre in qualcosa di più vasto: riflessione e una punta di stupore.",
    },
    {
      target_distribution: dist({ Tenderness: 0.5, Hope: 0.4, Nostalgia: 0.1 }),
      ...split(
        track(
          "Bright Eyes",
          "First Day of My Life",
          { Tenderness: 0.5, Hope: 0.4, Nostalgia: 0.1 },
          "This is the first day of my life",
          12,
          66,
        ),
      ),
      transition_reason:
        "Quasi arrivati: la tenerezza diventa speranza. Sei in un posto diverso da dove hai iniziato.",
    },
    {
      target_distribution: dist({ Hope: 0.5, Joy: 0.3, Tenderness: 0.2 }),
      ...split(
        track(
          "The Postal Service",
          "Such Great Heights",
          { Hope: 0.5, Joy: 0.3, Tenderness: 0.2 },
          "They will see us waving from such great heights",
          27,
          70,
        ),
      ),
      transition_reason:
        "Destinazione: speranza con dentro la gioia. Il viaggio dalla malinconia è completo, un passo coerente alla volta.",
    },
  ],
};

// Helper: separa i campi step-level (verse, ts) dal track candidate.
function split(t: ReturnType<typeof track>) {
  const { citable_verse, timestamp_in_song, ...rest } = t;
  return {
    selected_track: rest,
    citable_verse,
    timestamp_in_song,
  };
}

export function getMockTrajectory(shape: TrajectoryShape): Trajectory {
  if (shape === "evolve") return EVOLVE;
  // escalate non ancora nei dati mock -> ripiega su deepen
  return DEEPEN;
}
