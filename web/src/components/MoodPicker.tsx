"use client";

// Entry screen: "how do you feel?" -> pick a seed mood and a direction.
// The direction (deepen/evolve) is the trajectory shape that drives the journey.

import { useState } from "react";

import { ALL_NODES } from "@/lib/taxonomy";
import type { MacroNode, TrajectoryShape } from "@/lib/types";

// For the skeleton the mock data starts in a melancholic zone: these seeds are
// the ones coherent with the authored journeys. The others stay visible but soft.
const SUGGESTED: MacroNode[] = ["Melancholia", "Nostalgia", "Solitude"];

export default function MoodPicker({
  onStart,
}: {
  onStart: (seed: MacroNode, shape: TrajectoryShape) => void;
}) {
  const [seed, setSeed] = useState<MacroNode>("Melancholia");

  return (
    <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-up">
        <h1 className="font-display text-7xl font-medium tracking-tight">Lyra</h1>
        <p className="mx-auto mt-3 max-w-md text-balance text-muted">
          Discover music by what it actually says. Tell me how you feel — I'll
          walk you through the emotions, and show you the line that marks each
          passage.
        </p>
      </div>

      <div className="mt-12 w-full animate-fade-up">
        <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-2">
          How do you feel right now?
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {ALL_NODES.map((n) => {
            const active = seed === n.name;
            const suggested = SUGGESTED.includes(n.name);
            return (
              <button
                key={n.name}
                onClick={() => setSeed(n.name)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  active
                    ? "border-accent text-fg"
                    : "border-border text-muted hover:text-fg"
                } ${!suggested && !active ? "opacity-40" : ""}`}
                style={active ? { background: n.color + "22" } : undefined}
              >
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: n.color }}
                />
                {n.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-12 w-full animate-fade-up">
        <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-2">
          Where do you want to go?
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DirectionCard
            title="Stay here, go deeper"
            subtitle="Same feeling — stripped down to its core."
            onClick={() => onStart(seed, "deepen")}
          />
          <DirectionCard
            title="Take me somewhere new"
            subtitle="Drift to an adjacent feeling, one coherent step at a time."
            onClick={() => onStart(seed, "evolve")}
          />
        </div>
      </div>
    </div>
  );
}

function DirectionCard({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group rounded-2xl border border-border bg-bg-elev/60 p-5 text-left transition hover:border-accent hover:bg-bg-elev"
    >
      <div className="font-medium text-fg group-hover:text-accent">{title}</div>
      <div className="mt-1 text-sm text-muted">{subtitle}</div>
    </button>
  );
}
