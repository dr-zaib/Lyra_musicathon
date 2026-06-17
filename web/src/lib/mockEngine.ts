// Mock for the split playback-flow endpoints (/entry, /journey, /refill) — the
// fallback when the real backend is down, so the playback flow works without keys.
// Mirrors the real contract; reuses mockAgent (intent read) + mockData (track pool).

import { mockAgentTurn } from "./mockAgent";
import { getMockTrajectory } from "./mockData";
import type {
  EntryRequest,
  EntryResponse,
  JourneyRequest,
  RefillRequest,
  TrackCandidate,
  Trajectory,
} from "./types";

// A small candidate pool drawn from the mock trajectories' real songs (so iTunes
// previews resolve). Deduped by track_id.
function candidatePool(): TrackCandidate[] {
  const seen = new Set<number>();
  const out: TrackCandidate[] = [];
  for (const shape of ["deepen", "evolve"] as const) {
    for (const step of getMockTrajectory(shape).steps) {
      const t = step.selected_track;
      if (!seen.has(t.track_id)) { seen.add(t.track_id); out.push(t); }
    }
  }
  return out;
}

const notExcluded = (t: TrackCandidate, exclude?: string[]) =>
  !t.isrc || !(exclude ?? []).includes(t.isrc);

// /entry — read the mood (reuse the mock agent) + a skippable entry list.
export function mockEntry(req: EntryRequest): EntryResponse {
  const turn = mockAgentTurn({ message: req.message, seed_mood: req.seed_mood, session_id: req.session_id });
  const n = req.n ?? 6;
  return {
    confidence: turn.confidence,
    distribution: turn.distribution,
    shuffle: turn.shuffle,
    entry_candidates: candidatePool().slice(0, n),
  };
}

// /journey — the playlist for a chosen shape, excluding what already played.
export function mockJourney(req: JourneyRequest): Trajectory {
  const traj = getMockTrajectory(req.shape);
  const steps = traj.steps.filter((s) => notExcluded(s.selected_track, req.exclude_isrcs));
  return { ...traj, steps: steps.length ? steps : traj.steps };
}

// /refill — more candidates when the queue runs low.
export function mockRefill(req: RefillRequest): TrackCandidate[] {
  return candidatePool().filter((t) => notExcluded(t, req.exclude_isrcs)).slice(0, req.n ?? 4);
}
