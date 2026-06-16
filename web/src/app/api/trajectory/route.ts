// POST /api/trajectory  — restituisce una traiettoria.
//
// SEAM: prova il backend Python (BACKEND_URL); se non configurato o irraggiungibile,
// ripiega sul mock locale -> la demo non muore mai. Stesso shape JSON in entrambi i casi.

import { NextResponse } from "next/server";

import { getMockTrajectory } from "@/lib/mockData";
import type { TrajectoryRequest } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  let body: Partial<TrajectoryRequest> = {};
  try {
    body = await req.json();
  } catch {
    // body vuoto -> default
  }

  const shape = body.shape ?? "deepen";
  const seed_mood = body.seed_mood ?? "Melancholia";

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/recommend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed_mood, shape }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return NextResponse.json(await res.json());
    } catch {
      // backend giù -> fallback al mock
    }
  }

  await new Promise((r) => setTimeout(r, 300)); // simula latenza per gli stati UI
  return NextResponse.json(getMockTrajectory(shape));
}
