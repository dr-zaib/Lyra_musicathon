// Lyra — engine <-> agent <-> frontend contract (TS side).
//
// 1:1 mirror of `shared/schema.py` (cross-team source of truth). Same snake_case
// names as the wire JSON, so Axel's Pydantic backend response drops in here with
// no conversion. If you change a field here, change it in schema.py too.

export type MacroNode =
  | "Melancholia"
  | "Reflection"
  | "Solitude"
  | "Nostalgia"
  | "Tenderness"
  | "Hope"
  | "Joy"
  | "Awe"
  | "Anxiety"
  | "Anger"
  | "Defiance"
  | "Empowerment";

export type TrajectoryShape = "deepen" | "evolve" | "escalate";

export interface NodeDistribution {
  // macro-node name -> weight. As an *intent* distribution: ≤3 non-zero nodes,
  // weights sum to (1 - shuffle). As a step/track distribution: sums to 1.
  weights: Partial<Record<MacroNode, number>>;
}

export interface TrackCandidate {
  track_id: number;
  artist: string;
  title: string;
  isrc?: string | null;
  spotify_id?: string | null;
  distribution: NodeDistribution;
  has_richsync: boolean;
  track_rating: number;
  similarity_score?: number | null;

  // Runtime enrichment (added by the frontend via iTunes Search, not the engine).
  preview_url?: string | null;
  artwork_url?: string | null;
}

export interface TrajectoryStep {
  target_distribution: NodeDistribution;
  selected_track: TrackCandidate;
  transition_reason: string;
  citable_verse?: string | null;
  timestamp_in_song?: number | null;
}

export interface Trajectory {
  shape: TrajectoryShape;
  start_distribution: NodeDistribution;
  steps: TrajectoryStep[];
}

// Click-a-node shortcut payload (also expressible via AgentTurnRequest below).
export interface TrajectoryRequest {
  seed_mood: MacroNode;
  shape: TrajectoryShape;
}

// --- conversational seam: one endpoint, "message in → agent turn out" ---------
// One conversational turn from the user → the agent (the single endpoint).
// `message` = free text; `seed_mood`/`shape` = optional click-a-node shortcut.
export interface AgentTurnRequest {
  message?: string | null;
  session_id?: string | null;
  seed_mood?: MacroNode | null;
  shape?: TrajectoryShape | null;
  language?: string | null; // ISO 639-1 lyrics language (Musixmatch lyrics_language)
}

// The agent's response for one turn. `confidence` + `distribution` update on every
// turn, even when `trajectory` is null (pure conversation). `distribution` = intent
// (≤3 nodes); sum(distribution.weights) + shuffle === 1. `confidence` = wheel sharpness.
export interface AgentTurn {
  message: string;
  confidence: number;
  distribution: NodeDistribution;
  shuffle: number;
  trajectory?: Trajectory | null;
}

// --- playback flow: split seam (instant first audio, then the journey) ---------
// /entry → mood read + a skippable list of entry candidates (player starts [0]);
// /journey → the playlist for a chosen shape (queued behind the entry track);
// /refill → more candidates seeded on the centroid of what's left.
// known_new = fraction of NEW (discovery) vs KNOWN (go-to); engine floors it ≈0.15.
export interface EntryRequest {
  message?: string | null;
  session_id?: string | null;
  seed_mood?: MacroNode | null; // click-a-node shortcut
  n?: number;                   // how many entry candidates (default 6)
  known_new?: number | null;    // % new (discovery); null → default
  language?: string | null;     // ISO 639-1 lyrics language; null → engine default ("en")
}

export interface EntryResponse {
  confidence: number;
  distribution: NodeDistribution;
  shuffle: number;
  entry_candidates: TrackCandidate[];
}

export interface JourneyRequest {
  seed_mood: MacroNode;
  shape: TrajectoryShape;
  end_mood?: MacroNode | null;
  exclude_isrcs?: string[]; // already played (entry track + skips)
  known_new?: number | null;
  session_id?: string | null;
  language?: string | null; // ISO 639-1 lyrics language; null → engine default ("en")
}

export interface RefillRequest {
  remaining: TrackCandidate[]; // what's left in the queue (centroid seed)
  exclude_isrcs?: string[];
  n?: number;
  known_new?: number | null;
  session_id?: string | null;
  language?: string | null; // ISO 639-1 lyrics language; null → engine default ("en")
}
