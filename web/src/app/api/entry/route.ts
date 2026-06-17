// POST /api/entry — read the mood + a skippable entry list (the instant first audio).
// Proxies BACKEND_URL/entry; falls back to the local mock engine so the demo never dies.
//   in:  EntryRequest  { message?, session_id?, seed_mood?, n?, known_new? }
//   out: EntryResponse { confidence, distribution, shuffle, entry_candidates[] }

import { NextResponse } from "next/server";

import { mockEntry } from "@/lib/mockEngine";
import type { EntryRequest } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: Request) {
  let body: EntryRequest = {};
  try {
    body = await req.json();
  } catch {
    // empty body -> defaults
  }

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/entry`, {
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
  return NextResponse.json(mockEntry(body));
}
