// Lyra — mock trajectory engine data (fallback when the Python backend is down).
//
// REAL songs (artist+title) so the iTunes audio preview actually works.
// Palette: black music (R&B, rap, reggaeton, salsa) with a coherent emotional arc.
//
// `citable_verse` is a PLACEHOLDER: real verses come at runtime from Musixmatch
// richsync (license + no-store rule). We never hardcode lyrics.

import type { MacroNode, Trajectory, TrajectoryShape } from "./types";

// placeholder shown until real richsync is wired
const VERSE = "the synced line appears here · Musixmatch richsync";

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

// Deep dive: same feeling, ever deeper. R&B/rap melancholy toward the bare core.
const DEEPEN: Trajectory = {
  shape: "deepen",
  start_distribution: dist({ Melancholia: 0.7, Nostalgia: 0.3 }),
  steps: [
    {
      target_distribution: dist({ Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }),
      ...split(track("Frank Ocean", "Self Control", { Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }, 60, 80)),
      transition_reason:
        "We start where you are: a melancholy still wrapped in memory. The entry point.",
    },
    {
      target_distribution: dist({ Melancholia: 0.5, Solitude: 0.4, Reflection: 0.1 }),
      ...split(track("Drake", "Marvins Room", { Melancholia: 0.5, Solitude: 0.4, Reflection: 0.1 }, 70, 76)),
      transition_reason:
        "The memory recedes; what's left is solitude — the late-night phone-call kind.",
    },
    {
      target_distribution: dist({ Melancholia: 0.45, Solitude: 0.35, Reflection: 0.2 }),
      ...split(track("SZA", "Nobody Gets Me", { Melancholia: 0.45, Solitude: 0.35, Reflection: 0.2 }, 41, 74)),
      transition_reason:
        "Solitude starts to look at itself from the outside. Reflection appears.",
    },
    {
      target_distribution: dist({ Reflection: 0.5, Solitude: 0.3, Melancholia: 0.2 }),
      ...split(track("J. Cole", "Love Yourz", { Reflection: 0.5, Solitude: 0.3, Melancholia: 0.2 }, 75, 74)),
      transition_reason:
        "The bottom of the deep dive: reflection turning into acceptance, bare gratitude. From here you see it all.",
    },
  ],
};

// Evolution: you leave, but in coherent steps. Melancholy (R&B) → reggaeton → salsa.
const EVOLVE: Trajectory = {
  shape: "evolve",
  start_distribution: dist({ Melancholia: 0.7, Nostalgia: 0.3 }),
  steps: [
    {
      target_distribution: dist({ Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }),
      ...split(track("Frank Ocean", "Self Control", { Melancholia: 0.6, Nostalgia: 0.3, Solitude: 0.1 }, 60, 80)),
      transition_reason: "Same entry point: melancholy and memory.",
    },
    {
      target_distribution: dist({ Melancholia: 0.4, Tenderness: 0.3, Solitude: 0.3 }),
      ...split(track("SZA", "Snooze", { Melancholia: 0.4, Tenderness: 0.3, Solitude: 0.3 }, 35, 78)),
      transition_reason:
        "First shift: a tenderness enters the melancholy. Not a jump — a slide.",
    },
    {
      target_distribution: dist({ Tenderness: 0.5, Hope: 0.3, Joy: 0.2 }),
      ...split(track("Manuel Turizo", "La Bachata", { Tenderness: 0.5, Hope: 0.3, Joy: 0.2 }, 60, 84)),
      transition_reason:
        "Tenderness picks up a Latin rhythm and warms: hope arrives.",
    },
    {
      target_distribution: dist({ Joy: 0.4, Empowerment: 0.3, Defiance: 0.3 }),
      ...split(track("Bad Bunny", "Tití Me Preguntó", { Joy: 0.4, Empowerment: 0.3, Defiance: 0.3 }, 45, 88)),
      transition_reason:
        "The energy rises, the step turns bold — melancholy is far behind now.",
    },
    {
      target_distribution: dist({ Joy: 0.5, Hope: 0.3, Empowerment: 0.2 }),
      ...split(track("Marc Anthony", "Vivir Mi Vida", { Joy: 0.5, Hope: 0.3, Empowerment: 0.2 }, 55, 84)),
      transition_reason:
        "Destination: full joy, a salsa that affirms life. The journey from melancholy is complete.",
    },
  ],
};

// Helper: split step-level fields (verse, ts) from the track candidate.
function split(t: ReturnType<typeof track>) {
  const { citable_verse, timestamp_in_song, ...rest } = t;
  return { selected_track: rest, citable_verse, timestamp_in_song };
}

export function getMockTrajectory(shape: TrajectoryShape): Trajectory {
  if (shape === "evolve") return EVOLVE;
  return DEEPEN; // escalate not in mocks yet → fall back to deepen
}
