// POST /api/journey — the playlist for a chosen shape, queued behind the entry track.
// Proxies BACKEND_URL/journey; falls back to the local mock engine.
//   in:  JourneyRequest { seed_mood, shape, end_mood?, exclude_isrcs?, known_new?, session_id? }
//   out: Trajectory

import { NextResponse } from "next/server";

import { mockJourney } from "@/lib/mockEngine";
import type { JourneyRequest } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  let body: JourneyRequest;
  try {
    body = await req.json();
  } catch {
    body = { seed_mood: "Melancholia", shape: "deepen" };
  }

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/journey`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(28000),
      });
      if (res.ok) return NextResponse.json(await res.json());
    } catch {
      // backend down -> fall back to mock
    }
  }

  await new Promise((r) => setTimeout(r, 250));
  return NextResponse.json(mockJourney(body));
}
