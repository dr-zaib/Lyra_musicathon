"use client";

// Sticky bottom player. Plays the 30s preview (Deezer/iTunes). The real <audio> lives
// in SplitView; this is presentation + controls. Lyrics-first: the cited line rides on
// top, the artwork carries a now-playing equalizer, the queue opens from here.

import type { TrackCandidate } from "@/lib/types";

const PrevIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6h2v12H7zM20 6v12L9 12z" /></svg>
);
const NextIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 6h2v12h-2zM4 6l11 6L4 18z" /></svg>
);
const PlayIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" /></svg>
);
const QueueIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="15" y2="7" /><line x1="4" y1="12" x2="15" y2="12" /><line x1="4" y1="17" x2="11" y2="17" />
    <circle cx="18" cy="16" r="2.5" /><line x1="20.5" y1="16" x2="20.5" y2="8.5" /><path d="M20.5 8.5 L16.5 9.7" />
  </svg>
);
const NoteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="17" r="2.4" /><circle cx="18" cy="15" r="2.4" /><path d="M10.4 17V6l10-2v11" />
  </svg>
);

export default function PlayerBar({
  track,
  verse,
  isPlaying,
  currentTime,
  duration,
  hasPrev,
  hasNext,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onOpenPlaylist,
}: {
  track: TrackCandidate | null;
  verse?: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  hasPrev: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onOpenPlaylist: () => void;
}) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const ctrl = "flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:text-fg disabled:opacity-30";

  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-bg-elev/90 backdrop-blur">
      {/* slim seek line across the very top edge (no stock mono timestamps) */}
      <input
        type="range"
        min={0}
        max={duration || 30}
        step={0.1}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="seek"
        className="block h-1 w-full cursor-pointer appearance-none bg-transparent"
        style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-elev-2) ${pct}%)` }}
      />

      <div className="mx-auto max-w-6xl px-4">
        {/* the cited line — the lyrics-first signature (Musixmatch richsync) */}
        {verse && (
          <div className="flex items-center justify-center gap-2 pt-2 text-center">
            <span className="truncate text-xs italic text-fg/80">“{verse}”</span>
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-2">richsync</span>
          </div>
        )}

        <div className="flex items-center gap-3 py-2.5">
          {/* artwork + now-playing equalizer */}
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-bg-elev-2">
            {track?.artwork_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.artwork_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-2"><NoteIcon /></span>
            )}
            {isPlaying && (
              <span className="absolute bottom-0 right-0 flex h-[15px] items-end gap-[2px] rounded-tl-md bg-bg/70 px-1 pb-[2px]">
                <i className="lyra-eq-bar" /><i className="lyra-eq-bar" /><i className="lyra-eq-bar" />
              </span>
            )}
          </div>

          {/* identity — now visible on mobile too */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{track?.title ?? "—"}</div>
            <div className="truncate text-xs text-muted">
              {track?.artist}
              <span className="text-muted-2"> · 30s preview</span>
            </div>
          </div>

          {/* transport + queue */}
          <div className="flex items-center gap-0.5">
            <button onClick={onPrev} disabled={!hasPrev} className={ctrl} aria-label="Previous"><PrevIcon /></button>
            <button
              onClick={onToggle}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-bg transition hover:brightness-110"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={onNext} disabled={!hasNext} className={ctrl} aria-label="Next"><NextIcon /></button>
            <button onClick={onOpenPlaylist} className={`${ctrl} ml-1`} aria-label="View playlist" title="view playlist"><QueueIcon /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
