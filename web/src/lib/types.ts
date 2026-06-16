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
  // macro-node name -> weight, normalized to sum 1
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

export interface TrajectoryRequest {
  seed_mood: MacroNode;
  shape: TrajectoryShape;
}
