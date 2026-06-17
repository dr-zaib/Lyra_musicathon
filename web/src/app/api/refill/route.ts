// POST /api/refill — more entry/queue candidates when the queue runs low.
// Proxies BACKEND_URL/refill; falls back to the local mock engine.
//   in:  RefillRequest { remaining, exclude_isrcs?, n?, known_new?, session_id? }
//   out: TrackCandidate[]

import { NextResponse } from "next/server";

import { mockRefill } from "@/lib/mockEngine";
import type { RefillRequest } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  let body: RefillRequest;
  try {
    body = await req.json();
  } catch {
    body = { remaining: [] };
  }

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/refill`, {
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

  await new Promise((r) => setTimeout(r, 200));
  return NextResponse.json(mockRefill(body));
}
