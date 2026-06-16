"use client";

// Dynamic landing wheel: the 12 emotions orbit clockwise on a continuous ring;
// labels counter-rotate to stay upright (CSS, see globals.css). A brighter comet
// runs clockwise as a living accent. Purely decorative backdrop for the landing —
// the questions sit in the center hole.

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode } from "@/lib/types";

const CX = 50;
const CY = 50;
const R = 38;

// circumplex order: warm/positive right, high energy top, negative left, calm bottom.
const WHEEL_ORDER: MacroNode[] = [
  "Tenderness", "Hope", "Joy", "Empowerment",
  "Awe", "Defiance", "Anger", "Anxiety",
  "Melancholia", "Solitude", "Reflection", "Nostalgia",
];

function pos(i: number, radius: number) {
  const ang = (i * 2 * Math.PI) / WHEEL_ORDER.length;
  return { x: CX + radius * Math.cos(ang), y: CY - radius * Math.sin(ang) };
}

export default function RotatingWheel({ selected }: { selected?: MacroNode }) {
  return (
    <svg
      viewBox="-14 -14 128 128"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6d6aa8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="cometGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* faint inner guide */}
      <circle cx={CX} cy={CY} r={R * 0.55} fill="none"
        stroke="var(--border)" strokeWidth={0.3} />

      {/* orbiting group (clockwise) */}
      <g className="wheel-orbit">
        {/* continuous ring line */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="url(#rim)" strokeWidth={0.6} />

        {WHEEL_ORDER.map((name, i) => {
          const p = pos(i, R);
          const lp = pos(i, R + 6);
          const color = TAXONOMY[name].color;
          const active = selected === name;
          return (
            <g key={name}>
              {active && (
                <circle cx={p.x} cy={p.y} r={3.4} fill="none" stroke={color}
                  strokeWidth={0.6} opacity={0.8} />
              )}
              <circle cx={p.x} cy={p.y} r={active ? 2.4 : 1.7}
                fill={color} opacity={active ? 1 : 0.7} />
              <text
                className="wheel-label"
                x={lp.x}
                y={lp.y + 1}
                textAnchor="middle"
                fontSize={2.6}
                fill={active ? "var(--fg)" : "var(--muted)"}
              >
                {name}
              </text>
            </g>
          );
        })}
      </g>

      {/* comet running clockwise on the rim */}
      <g className="wheel-comet">
        <circle cx={CX} cy={CY - R} r={4} fill="url(#cometGlow)" />
        <circle cx={CX} cy={CY - R} r={1.1} fill="var(--accent)" />
      </g>
    </svg>
  );
}
