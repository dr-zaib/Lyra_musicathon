"use client";

// La card del passo corrente: copertina, brano, la spiegazione dell'agente e —
// il cuore di Lyra — il verso citato che marca questo passaggio emotivo.
//
// Il verso è reso "karaoke": le parole si illuminano in sequenza mentre l'audio
// suona. È un PLACEHOLDER dell'esperienza richsync: con i timestamp word-level
// veri (track.richsync.get) la sweep userà i tempi reali invece di un loop.

import Image from "next/image";

import { TAXONOMY } from "@/lib/taxonomy";
import type { TrajectoryStep } from "@/lib/types";

function fmt(ts: number | null | undefined): string | null {
  if (ts == null) return null;
  const m = Math.floor(ts / 60);
  const s = Math.floor(ts % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StepCard({
  step,
  index,
  total,
  currentTime,
  isPlaying,
}: {
  step: TrajectoryStep;
  index: number;
  total: number;
  currentTime: number;
  isPlaying: boolean;
}) {
  const t = step.selected_track;
  const dominant = Object.entries(step.target_distribution.weights).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
  );
  const stamp = fmt(step.timestamp_in_song);

  // karaoke: posizione 0..1 nel loop -> indice parola attiva
  const words = step.citable_verse ? step.citable_verse.split(" ") : [];
  const loopSec = Math.max(4, words.length * 0.5);
  const pos = isPlaying ? (currentTime % loopSec) / loopSec : 1;
  const activeIdx = Math.floor(pos * words.length);

  return (
    <div key={t.track_id} className="animate-fade-up">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-2">
        Step {index + 1} of {total}
      </div>

      <div className="mt-4 flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-bg-elev-2">
          {t.artwork_url ? (
            <Image
              src={t.artwork_url}
              alt={`${t.title} artwork`}
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-2xl font-medium">{t.title}</div>
          <div className="truncate text-muted">{t.artist}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dominant.slice(0, 3).map(([node, w]) => (
              <span
                key={node}
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background:
                    (TAXONOMY[node as keyof typeof TAXONOMY]?.color ?? "#888") +
                    "26",
                  color: TAXONOMY[node as keyof typeof TAXONOMY]?.color ?? "#aaa",
                }}
              >
                {node} {Math.round((w ?? 0) * 100)}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* voce dell'agente */}
      <p className="mt-5 text-[15px] leading-relaxed text-fg/90">
        {step.transition_reason}
      </p>

      {/* il verso citato — il momento richsync, reso karaoke */}
      {step.citable_verse && (
        <figure className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-accent/80">
            <span>The line that marks this passage</span>
            {stamp && (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono">
                {stamp}
              </span>
            )}
          </div>
          <blockquote className="text-lg italic">
            <span className="text-fg/40">“</span>
            {words.map((w, i) => {
              const passed = i < activeIdx;
              const current = i === activeIdx && isPlaying;
              return (
                <span
                  key={i}
                  className={
                    current
                      ? "text-accent"
                      : passed
                        ? "text-fg"
                        : "text-fg/35"
                  }
                  style={{ transition: "color 0.25s ease" }}
                >
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </span>
              );
            })}
            <span className="text-fg/40">”</span>
          </blockquote>
        </figure>
      )}
    </div>
  );
}
