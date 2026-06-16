"use client";

// Player sticky in basso. Riproduce la preview da 30s (iTunes). L'<audio> reale
// vive in SessionView; qui è solo presentazione + controlli.

import type { TrackCandidate } from "@/lib/types";

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function PlayerBar({
  track,
  isPlaying,
  currentTime,
  duration,
  hasPrev,
  hasNext,
  onToggle,
  onPrev,
  onNext,
  onSeek,
}: {
  track: TrackCandidate | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  hasPrev: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
}) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-bg-elev/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
        <div className="hidden min-w-0 flex-1 sm:block">
          {track && (
            <>
              <div className="truncate text-sm font-medium">{track.title}</div>
              <div className="truncate text-xs text-muted">{track.artist}</div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="rounded-full p-2 text-muted transition hover:text-fg disabled:opacity-30"
            aria-label="Previous"
          >
            ⏮
          </button>
          <button
            onClick={onToggle}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-bg transition hover:brightness-110"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="rounded-full p-2 text-muted transition hover:text-fg disabled:opacity-30"
            aria-label="Next"
          >
            ⏭
          </button>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <span className="w-9 text-right font-mono text-[11px] text-muted-2">
            {fmt(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 30}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
            style={{
              background: `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-elev-2) ${pct}%)`,
            }}
          />
          <span className="w-9 font-mono text-[11px] text-muted-2">
            {fmt(duration || 30)}
          </span>
        </div>
      </div>
    </div>
  );
}
