// POST /api/trajectory  — restituisce una traiettoria.
//
// SEAM: oggi ritorna dati mock. Quando il motore di Axel è pronto, questa route
// diventa un proxy verso il backend Python (stesso shape JSON, contratto /shared).
// Il resto del frontend non cambia di una riga.

import { NextResponse } from "next/server";

import { getMockTrajectory } from "@/lib/mockData";
import type { TrajectoryRequest } from "@/lib/types";

export async function POST(req: Request) {
  let body: Partial<TrajectoryRequest> = {};
  try {
    body = await req.json();
  } catch {
    // body vuoto -> default
  }

  const shape = body.shape ?? "deepen";
  const trajectory = getMockTrajectory(shape);

  // piccola latenza simulata per testare gli stati di loading dell'UI
  await new Promise((r) => setTimeout(r, 400));

  return NextResponse.json(trajectory);
}
