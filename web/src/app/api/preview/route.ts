// GET /api/preview?artist=...&title=...  — real audio preview via the iTunes Search API.
//
// Public, no auth, NOT Musixmatch content -> no conflict with the contest's
// storage rule. Returns the 30s preview URL + artwork. This is already "real",
// not a mock.

import { NextResponse } from "next/server";

export const revalidate = 3600; // cache 1h, preview URLs are stable

interface ItunesResult {
  previewUrl?: string;
  artworkUrl100?: string;
  trackName?: string;
  artistName?: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";

  if (!artist || !title) {
    return NextResponse.json(
      { error: "artist and title required" },
      { status: 400 },
    );
  }

  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`iTunes ${res.status}`);
    const data = (await res.json()) as { results: ItunesResult[] };
    const results = data.results ?? [];

    // prefer the result whose artist matches (avoids covers / namesakes),
    // then any with a preview. The real product will use ISRC via Musixmatch.
    const wanted = artist.toLowerCase();
    const hit =
      results.find(
        (r) => r.previewUrl && (r.artistName ?? "").toLowerCase().includes(wanted),
      ) ?? results.find((r) => r.previewUrl);

    if (!hit?.previewUrl) {
      return NextResponse.json({ preview_url: null, artwork_url: null });
    }

    // higher-res artwork (iTunes returns 100x100 by default)
    const artwork = hit.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null;

    return NextResponse.json({
      preview_url: hit.previewUrl,
      artwork_url: artwork,
      matched: { artist: hit.artistName, title: hit.trackName },
    });
  } catch (err) {
    return NextResponse.json(
      { preview_url: null, artwork_url: null, error: String(err) },
      { status: 502 },
    );
  }
}
