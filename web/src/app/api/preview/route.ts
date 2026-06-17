// GET /api/preview?isrc=...&artist=...&title=...  — real 30s audio preview + artwork.
//
// Strategy: ISRC-first (exact recording) via Deezer, then text fallbacks. ISRC is
// the right key — the engine carries it on every TrackCandidate — so we avoid
// covers/namesakes and improve niche hit-rate. All sources are public, no auth,
// NOT Musixmatch content -> no conflict with the contest's storage rule.
//   1. Deezer by ISRC      (https://api.deezer.com/track/isrc:<ISRC>)  ← exact
//   2. Deezer by text      (artist + title)
//   3. iTunes by text      (artist + title)                            ← last resort
// In production, full playback comes from the host DSP (Spotify/Apple SDK).

import { NextResponse } from "next/server";

export const revalidate = 3600; // preview URLs are stable; cache 1h

type Preview = { preview_url: string | null; artwork_url: string | null; source?: string };

async function deezerByIsrc(isrc: string): Promise<Preview | null> {
  try {
    const res = await fetch(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (d?.error || !d?.preview) return null;
    return {
      preview_url: d.preview,
      artwork_url: d.album?.cover_big ?? d.album?.cover_medium ?? null,
      source: "deezer-isrc",
    };
  } catch {
    return null;
  }
}

async function deezerByText(artist: string, title: string): Promise<Preview | null> {
  try {
    const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=5`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const wanted = artist.toLowerCase();
    const items: { preview?: string; artist?: { name?: string }; album?: { cover_big?: string; cover_medium?: string } }[] =
      d?.data ?? [];
    const hit =
      items.find((r) => r.preview && (r.artist?.name ?? "").toLowerCase().includes(wanted)) ??
      items.find((r) => r.preview);
    if (!hit?.preview) return null;
    return {
      preview_url: hit.preview,
      artwork_url: hit.album?.cover_big ?? hit.album?.cover_medium ?? null,
      source: "deezer-text",
    };
  } catch {
    return null;
  }
}

async function itunesByText(artist: string, title: string): Promise<Preview | null> {
  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results: { previewUrl?: string; artworkUrl100?: string; artistName?: string }[];
    };
    const wanted = artist.toLowerCase();
    const hit =
      (data.results ?? []).find(
        (r) => r.previewUrl && (r.artistName ?? "").toLowerCase().includes(wanted),
      ) ?? (data.results ?? []).find((r) => r.previewUrl);
    if (!hit?.previewUrl) return null;
    return {
      preview_url: hit.previewUrl,
      artwork_url: hit.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
      source: "itunes-text",
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isrc = searchParams.get("isrc")?.trim() ?? "";
  const artist = searchParams.get("artist")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";

  if (!isrc && (!artist || !title)) {
    return NextResponse.json({ error: "isrc, or artist+title, required" }, { status: 400 });
  }

  // 1) exact: ISRC via Deezer
  if (isrc) {
    const hit = await deezerByIsrc(isrc);
    if (hit) return NextResponse.json(hit);
  }
  // 2) + 3) text fallbacks (Deezer, then iTunes)
  if (artist && title) {
    const hit = (await deezerByText(artist, title)) ?? (await itunesByText(artist, title));
    if (hit) return NextResponse.json(hit);
  }

  return NextResponse.json({ preview_url: null, artwork_url: null, source: "none" });
}
