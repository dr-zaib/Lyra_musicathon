// GET /api/preview?artist=...&title=...  — audio preview reale via iTunes Search API.
//
// Pubblica, senza auth, NON contenuto Musixmatch -> nessun problema con le regole
// del contest sullo storage. Ritorna l'URL della preview da 30s + artwork.
// Questo è già "vero" stasera, non è un mock.

import { NextResponse } from "next/server";

export const revalidate = 3600; // cache 1h, gli URL preview sono stabili

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
      { error: "artist e title richiesti" },
      { status: 400 },
    );
  }

  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`iTunes ${res.status}`);
    const data = (await res.json()) as { results: ItunesResult[] };
    const hit = data.results?.[0];

    if (!hit?.previewUrl) {
      return NextResponse.json({ preview_url: null, artwork_url: null });
    }

    // artwork a risoluzione più alta (iTunes torna 100x100 di default)
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
