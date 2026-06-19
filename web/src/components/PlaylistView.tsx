"use client";

// The playlist Lyra is building — so it's tangible that you're creating one, not just
// fed tracks. Shows what's played, what's on now, and what's next; tap a row to jump.
// (We don't hide upcoming tracks here on purpose: this view IS the "you have a playlist"
// signal — the wheel + narration carry the mystery during normal playback.)

import { motion } from "motion/react";

import type { TrackCandidate } from "@/lib/types";

type QueueItem = { track: TrackCandidate; verse: string | null; reason: string | null };

export default function PlaylistView({
  items,
  index,
  onJump,
  onClose,
}: {
  items: QueueItem[];
  index: number;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-label="your playlist">
      <button className="absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="close playlist" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-sm flex-col rounded-t-2xl border border-border bg-bg-elev p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">your playlist</div>
            <div className="text-[11px] text-muted-2">{items.length} {items.length === 1 ? "track" : "tracks"} · tap to jump</div>
          </div>
          <button onClick={onClose} aria-label="close" className="text-muted-2 transition hover:text-fg">✕</button>
        </div>

        <ol className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.map((it, i) => {
            const current = i === index;
            const played = i < index;
            return (
              <motion.li
                key={`${it.track.track_id}-${i}`}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut", delay: Math.min(i, 12) * 0.03 }}
              >
                <button
                  onClick={() => onJump(i)}
                  aria-current={current ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                    current ? "bg-accent/10" : "hover:bg-bg-elev-2"
                  }`}
                >
                  <span className={`w-4 shrink-0 text-center text-[11px] tabular-nums ${current ? "text-accent" : "text-muted-2"}`}>
                    {current ? "▶" : i + 1}
                  </span>
                  {it.track.artwork_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.track.artwork_url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded bg-bg-elev-2" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${played ? "text-muted" : "text-fg"}`}>{it.track.title}</span>
                    <span className="block truncate text-[11px] text-muted-2">{it.track.artist}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
