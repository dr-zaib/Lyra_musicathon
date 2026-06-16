"use client";

// Landing = an interactive radial selector. The 12 emotions ARE the clickable
// nodes on the wheel (selection happens on the wheel — no separate list). Nodes
// are fixed and easy to click; only decorative elements (outer ring, comet)
// rotate, so the wheel feels alive but stays usable. The center hole is a clean
// focal CTA: pick an emotion -> choose a direction -> start.

import { useState } from "react";

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode, TrajectoryShape } from "@/lib/types";

const CX = 50;
const CY = 50;
const R_NODE = 40;
const R_LABEL = 46.5;

// circumplex order: warm/positive right, high energy top, negative left, calm bottom.
const WHEEL_ORDER: MacroNode[] = [
  "Tenderness", "Hope", "Joy", "Empowerment",
  "Awe", "Defiance", "Anger", "Anxiety",
  "Melancholia", "Solitude", "Reflection", "Nostalgia",
];

// mock data only has authored journeys from a melancholic zone; these are
// highlighted as ready, others are dimmed (still selectable).
const READY: MacroNode[] = ["Melancholia", "Nostalgia", "Solitude"];

// round to 3 decimals so server and client render identical strings (no hydration mismatch)
const r3 = (v: number) => Math.round(v * 1000) / 1000;
function pos(i: number, radius: number) {
  const ang = (i * 2 * Math.PI) / WHEEL_ORDER.length;
  return { x: r3(CX + radius * Math.cos(ang)), y: r3(CY - radius * Math.sin(ang)) };
}

export default function MoodPicker({
  onStart,
}: {
  onStart: (seed: MacroNode, shape: TrajectoryShape) => void;
}) {
  const [seed, setSeed] = useState<MacroNode | null>(null);

  return (
    <div className="relative z-10 flex min-h-[92vh] items-center justify-center px-6">
      <div className="relative aspect-square w-[min(82vh,94vw)]">
        {/* decorative rotating layer (does not move the click targets) */}
        <svg viewBox="-16 -16 132 132" className="absolute inset-0 h-full w-full"
          aria-hidden="true">
          <defs>
            <radialGradient id="cometGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="wheel-comet">
            <circle cx={CX} cy={CY - 48} r={5} fill="url(#cometGlow)" />
          </g>
          <circle className="wheel-comet" cx={CX} cy={CY} r={48} fill="none"
            stroke="var(--border)" strokeWidth={0.4} strokeDasharray="0.4 3" />
        </svg>

        {/* static rings + clickable emotion nodes */}
        <svg viewBox="-16 -16 132 132" className="absolute inset-0 h-full w-full">
          <circle cx={CX} cy={CY} r={R_NODE} fill="none"
            stroke="var(--border)" strokeWidth={0.4} />
          <circle cx={CX} cy={CY} r={R_NODE * 0.42} fill="none"
            stroke="var(--border)" strokeWidth={0.3} />

          {WHEEL_ORDER.map((name, i) => {
            const p = pos(i, R_NODE);
            const lp = pos(i, R_LABEL);
            const color = TAXONOMY[name].color;
            const active = seed === name;
            const ready = READY.includes(name);
            const anchor = lp.x > CX + 1 ? "start" : lp.x < CX - 1 ? "end" : "middle";
            return (
              <g
                key={name}
                className="emotion-node"
                onClick={() => setSeed(name)}
                role="button"
                aria-label={name}
              >
                {/* hit area */}
                <circle cx={p.x} cy={p.y} r={6} fill="transparent" />
                {active && (
                  <circle cx={p.x} cy={p.y} r={4} fill="none" stroke={color}
                    strokeWidth={0.8} />
                )}
                <circle
                  className="dot"
                  cx={p.x}
                  cy={p.y}
                  r={active ? 3 : 2}
                  fill={color}
                  opacity={active || ready ? 1 : 0.5}
                />
                <text
                  x={lp.x}
                  y={lp.y + 1}
                  textAnchor={anchor}
                  fontSize={2.7}
                  fill={active ? "var(--fg)" : "var(--muted)"}
                  opacity={active || ready ? 1 : 0.55}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* center focal CTA */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[42%] text-center">
            <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
              Lyra
            </h1>
            {!seed ? (
              <p className="mx-auto mt-3 text-balance text-sm text-muted">
                How do you feel right now?
                <br />
                <span className="text-muted-2">Pick an emotion on the wheel.</span>
              </p>
            ) : (
              <div className="animate-fade-up">
                <div
                  className="mt-2 font-display text-2xl"
                  style={{ color: TAXONOMY[seed].color }}
                >
                  {seed}
                </div>
                <div className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-2">
                  Where do you want to go?
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  <button
                    onClick={() => onStart(seed, "deepen")}
                    className="rounded-xl border border-border bg-bg-elev/70 px-4 py-2 text-sm backdrop-blur-sm transition hover:border-accent hover:text-accent"
                  >
                    Stay here, go deeper
                  </button>
                  <button
                    onClick={() => onStart(seed, "evolve")}
                    className="rounded-xl border border-border bg-bg-elev/70 px-4 py-2 text-sm backdrop-blur-sm transition hover:border-accent hover:text-accent"
                  >
                    Take me somewhere new
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
