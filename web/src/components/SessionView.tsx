"use client";

// Orchestratore del frontend: tiene lo stato di sessione, l'elemento <audio>
// reale, e fa il fetch di traiettoria (mock) + preview audio (iTunes, vere).
// MoodPicker -> loading -> sessione che suona e si auto-avanza.

import { useCallback, useEffect, useRef, useState } from "react";

import EmotionalAtlas from "./EmotionalAtlas";
import MoodPicker from "./MoodPicker";
import PlayerBar from "./PlayerBar";
import StepCard from "./StepCard";
import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode, Trajectory, TrajectoryShape } from "@/lib/types";

type Phase = "picking" | "loading" | "session";

async function fetchTrajectory(
  seed: MacroNode,
  shape: TrajectoryShape,
): Promise<Trajectory> {
  const res = await fetch("/api/trajectory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed_mood: seed, shape }),
  });
  return res.json();
}

async function enrichWithAudio(traj: Trajectory): Promise<Trajectory> {
  const steps = await Promise.all(
    traj.steps.map(async (s) => {
      const { artist, title } = s.selected_track;
      try {
        const r = await fetch(
          `/api/preview?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
        );
        const d = await r.json();
        return {
          ...s,
          selected_track: {
            ...s.selected_track,
            preview_url: d.preview_url ?? null,
            artwork_url: d.artwork_url ?? null,
          },
        };
      } catch {
        return s;
      }
    }),
  );
  return { ...traj, steps };
}

export default function SessionView() {
  const [phase, setPhase] = useState<Phase>("picking");
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);

  const start = useCallback(
    async (seed: MacroNode, shape: TrajectoryShape) => {
      setPhase("loading");
      const traj = await fetchTrajectory(seed, shape);
      const enriched = await enrichWithAudio(traj);
      setTrajectory(enriched);
      setIndex(0);
      setPhase("session");
    },
    [],
  );

  // carica e riproduce il brano corrente a ogni cambio di step
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !trajectory) return;
    const url = trajectory.steps[index]?.selected_track.preview_url;
    if (!url) {
      setIsPlaying(false);
      return;
    }
    audio.src = url;
    audio.load();
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false)); // autoplay bloccato -> mostra play
  }, [index, trajectory]);

  const steps = trajectory?.steps ?? [];
  const currentStep = steps[index] ?? null;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else {
      a.pause();
      setIsPlaying(false);
    }
  };
  const go = (i: number) => setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  const seek = (t: number) => {
    const a = audioRef.current;
    if (a) a.currentTime = t;
  };

  if (phase === "picking") {
    return <MoodPicker onStart={start} />;
  }

  if (phase === "loading") {
    return (
      <div className="relative z-10 flex min-h-[80vh] items-center justify-center">
        <div className="animate-pulse text-muted">Composing your journey…</div>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (index < steps.length - 1) setIndex(index + 1);
          else setIsPlaying(false);
        }}
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-tight">Lyra</span>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-2">
            {trajectory?.shape === "evolve" ? "Evolving" : "Going deeper"}
          </span>
        </div>
        <button
          onClick={() => {
            audioRef.current?.pause();
            setPhase("picking");
            setTrajectory(null);
            setIsPlaying(false);
          }}
          className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
        >
          New session
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 pb-6 lg:grid-cols-2">
        <div className="min-h-[340px] lg:min-h-0">
          <EmotionalAtlas trajectory={trajectory} currentIndex={index} />
        </div>

        <div className="flex flex-col gap-6">
          {currentStep && (
            <StepCard step={currentStep} index={index} total={steps.length} />
          )}

          <div className="rounded-2xl border border-border bg-bg-elev/40 p-2">
            {steps.map((s, i) => {
              const active = i === index;
              const dom = Object.entries(s.target_distribution.weights).sort(
                (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
              )[0]?.[0] as MacroNode | undefined;
              const color = dom ? TAXONOMY[dom]?.color : "var(--muted)";
              return (
                <button
                  key={s.selected_track.track_id}
                  onClick={() => go(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                    active ? "bg-bg-elev" : "hover:bg-bg-elev/60"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {s.selected_track.title}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {s.selected_track.artist}
                    </span>
                  </span>
                  {active && isPlaying && (
                    <span className="text-xs text-accent">♪</span>
                  )}
                  {!s.selected_track.preview_url && (
                    <span className="text-[10px] text-muted-2">no preview</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <PlayerBar
        track={currentStep?.selected_track ?? null}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        hasPrev={index > 0}
        hasNext={index < steps.length - 1}
        onToggle={toggle}
        onPrev={() => go(index - 1)}
        onNext={() => go(index + 1)}
        onSeek={seek}
      />
    </div>
  );
}
