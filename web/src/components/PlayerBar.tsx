"use client";

// Sticky bottom player. Plays the 30s preview (Deezer/iTunes). The real <audio> lives
// in SplitView; this is presentation + controls. Layout follows desktop-player
// convention (Spotify-style): identity left · transport centered · actions right, with
// the seek bar under the transport. On mobile it collapses to a compact row with the
// progress as a slim line at the top edge.

import type { TrackCandidate } from "@/lib/types";

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const PrevIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6h2v12H7zM20 6v12L9 12z" /></svg>
);
const NextIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 6h2v12h-2zM4 6l11 6L4 18z" /></svg>
);
const PlayIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" /></svg>
);
const QueueIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="15" y2="7" /><line x1="4" y1="12" x2="15" y2="12" /><line x1="4" y1="17" x2="11" y2="17" />
    <circle cx="18" cy="16" r="2.5" /><line x1="20.5" y1="16" x2="20.5" y2="8.5" /><path d="M20.5 8.5 L16.5 9.7" />
  </svg>
);
const NoteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="17" r="2.4" /><circle cx="18" cy="15" r="2.4" /><path d="M10.4 17V6l10-2v11" />
  </svg>
);

// A seek bar that animates smoothly between the audio's ~4Hz timeupdate ticks: a
// transitioned fill div over a track, with an invisible range on top for interaction
// (so there's no native thumb to inherit the OS accent colour).
function Seek({
  currentTime,
  duration,
  onSeek,
  className = "",
}: {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  className?: string;
}) {
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div className={`group relative h-1 ${className}`}>
      <div className="absolute inset-0 rounded-full bg-bg-elev-2" />
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-[280ms] ease-linear group-hover:bg-accent"
        style={{ width: `${pct}%` }}
      />
      <input
        type="range"
        min={0}
        max={duration || 30}
        step={0.1}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="seek"
        className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent p-0 opacity-0"
      />
    </div>
  );
}

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
  const ctrl = "flex h-12 w-12 items-center justify-center rounded-full text-muted transition hover:text-fg disabled:opacity-30";

  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-bg-elev/90 backdrop-blur">
      {/* MOBILE: a slim seek line flush at the top edge */}
      <Seek currentTime={currentTime} duration={duration} onSeek={onSeek} className="w-full md:hidden" />

      <div className="mx-auto max-w-6xl px-4">
        {/* the cited line — the lyrics-first signature (Musixmatch richsync) */}
        {verse && (
          <div className="flex items-center justify-center gap-2 pt-2 text-center">
            <span className="truncate text-xs italic text-fg/80">“{verse}”</span>
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-2">richsync</span>
          </div>
        )}

        <div className="flex items-center gap-3 py-2.5 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
          {/* LEFT — identity */}
          <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
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
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{track?.title ?? "—"}</div>
              <div className="truncate text-xs text-muted">
                {track?.artist}
                <span className="text-muted-2"> · 30s preview</span>
              </div>
            </div>
          </div>

          {/* CENTER — transport + (desktop) seek */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1">
              <button onClick={onPrev} disabled={!hasPrev} className={ctrl} aria-label="Previous"><PrevIcon /></button>
              <button
                onClick={onToggle}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg transition hover:scale-105 hover:brightness-110"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button onClick={onNext} disabled={!hasNext} className={ctrl} aria-label="Next"><NextIcon /></button>
            </div>
            <div className="hidden w-[min(42vw,540px)] items-center gap-2 md:flex">
              <span className="w-9 text-right font-mono text-[11px] text-muted-2">{fmt(currentTime)}</span>
              <Seek currentTime={currentTime} duration={duration} onSeek={onSeek} className="flex-1" />
              <span className="w-9 font-mono text-[11px] text-muted-2">{fmt(duration || 30)}</span>
            </div>
          </div>

          {/* RIGHT — actions */}
          <div className="flex items-center justify-end gap-1">
            <button onClick={onOpenPlaylist} className={ctrl} aria-label="View playlist" title="view playlist"><QueueIcon /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
