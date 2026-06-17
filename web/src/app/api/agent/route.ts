// POST /api/agent — one conversational turn (the decided "agent turn" contract).
//
// SEAM: tries the Python backend (BACKEND_URL/turn); if unset or unreachable, falls
// back to the local mock agent -> the demo never dies. Same JSON shape either way:
//   in:  { message?, session_id?, seed_mood?, shape? }
//   out: { message, confidence, distribution, shuffle, trajectory|null }

import { NextResponse } from "next/server";

import { mockAgentTurn } from "@/lib/mockAgent";
import type { AgentTurnRequest } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  let body: AgentTurnRequest = {};
  try {
    body = await req.json();
  } catch {
    // empty body -> defaults
  }

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        // a real turn (engine + agent) takes ~14s — give it room before falling back
        signal: AbortSignal.timeout(28000),
      });
      if (res.ok) return NextResponse.json(await res.json());
    } catch {
      // backend down -> fall back to mock
    }
  }

  await new Promise((r) => setTimeout(r, 250)); // a touch of latency for UI states
  return NextResponse.json(mockAgentTurn(body));
}
