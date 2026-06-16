// Lyra — contratto motore <-> agente <-> frontend (lato TS).
//
// Specchio 1:1 di `shared/schema.py` (fonte di verità cross-team). Stessi nomi
// snake_case del wire JSON, così la risposta Pydantic del backend di Axel entra
// qui senza conversioni. Se cambi un campo qui, cambialo anche in schema.py.

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
  // macro-node name -> peso, normalizzato a somma 1
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

  // Arricchimento a runtime (aggiunto dal frontend via iTunes Search, non dal motore).
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
