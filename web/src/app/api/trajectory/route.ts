// POST /api/trajectory  — returns a trajectory.
//
// SEAM: tries the Python backend (BACKEND_URL); if unset or unreachable, falls
// back to the local mock -> the demo never dies. Same JSON shape either way.

import { NextResponse } from "next/server";

import { getMockTrajectory } from "@/lib/mockData";
import type { TrajectoryRequest } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  let body: Partial<TrajectoryRequest> = {};
  try {
    body = await req.json();
  } catch {
    // empty body -> defaults
  }

  const shape = body.shape ?? "deepen";
  const seed_mood = body.seed_mood ?? "Melancholia";

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/recommend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed_mood, shape }),
        // real engine turn ~14s (kept in sync with /api/agent); unused by the app now
        signal: AbortSignal.timeout(28000),
      });
      if (res.ok) return NextResponse.json(await res.json());
    } catch {
      // backend down -> fall back to mock
    }
  }

  await new Promise((r) => setTimeout(r, 300)); // simulate latency for UI states
  return NextResponse.json(getMockTrajectory(shape));
}
