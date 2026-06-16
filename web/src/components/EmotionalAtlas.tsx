"use client";

// La ruota emotiva: le 12 emozioni disposte in cerchio (circumplex di Russell —
// valenza/arousal), il viaggio tracciato come un filo di luce che attraversa la
// ruota, la posizione corrente che pulsa. Sobrio: geometria pulita, glow viola,
// nessun orpello. È il visual-hero del demo.

import { motion } from "motion/react";
import { useMemo } from "react";

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode, Trajectory } from "@/lib/types";

const CX = 50;
const CY = 50;
const R = 34; // raggio della ruota

// ordine attorno al cerchio (circumplex): caldo/positivo a destra, alta energia
// in alto, negativo a sinistra, introspettivo in basso.
const WHEEL_ORDER: MacroNode[] = [
  "Tenderness", "Hope", "Joy", "Empowerment",
  "Awe", "Defiance", "Anger", "Anxiety",
  "Melancholia", "Solitude", "Reflection", "Nostalgia",
];

const ANGLE: Record<string, number> = Object.fromEntries(
  WHEEL_ORDER.map((name, i) => [name, (i * 360) / WHEEL_ORDER.length]),
);

function rimPos(name: MacroNode, radius = R) {
  const rad = (ANGLE[name] * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

// punto della traiettoria = combinazione convessa delle posizioni sulla ruota
// (concentrato su un'emozione → vicino al suo nodo; misto → verso il centro).
function stepPos(weights: Partial<Record<MacroNode, number>>) {
  let x = 0, y = 0, tot = 0;
  for (const [n, w] of Object.entries(weights) as [MacroNode, number][]) {
    const p = rimPos(n);
    x += p.x * w; y += p.y * w; tot += w;
  }
  if (!tot) return { x: CX, y: CY };
  return { x: x / tot, y: y / tot };
}

export default function EmotionalAtlas({
  trajectory,
  currentIndex,
  onSelectStep,
}: {
  trajectory: Trajectory | null;
  currentIndex: number;
  onSelectStep?: (i: number) => void;
}) {
  const points = useMemo(
    () => (trajectory?.steps ?? []).map((s) => stepPos(s.target_distribution.weights)),
    [trajectory],
  );
  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    : "";
  const current = points[currentIndex];

  const activeNodes = new Set<MacroNode>(
    Object.keys(trajectory?.steps[currentIndex]?.target_distribution.weights ?? {}) as MacroNode[],
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-bg-elev/50">
      <div className="pointer-events-none absolute left-5 top-4 z-10">
        <div className="font-display text-sm tracking-[0.25em] text-muted">
          THE EMOTIONAL WHEEL
        </div>
      </div>

      <svg viewBox="-14 -10 128 120" className="h-full w-full">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="thread" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8a93d8" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>

        {/* cerchi guida (arousal) */}
        {[R, R * 0.62, R * 0.28].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={r} fill="none"
            stroke="var(--border)" strokeWidth={0.4} />
        ))}

        {/* nodi emozione sulla ruota */}
        {WHEEL_ORDER.map((name) => {
          const p = rimPos(name);
          const lp = rimPos(name, R + 7);
          const active = activeNodes.has(name);
          const color = TAXONOMY[name].color;
          const anchor = lp.x > CX + 1 ? "start" : lp.x < CX - 1 ? "end" : "middle";
          return (
            <g key={name}>
              <title>{name}</title>
              {active && (
                <circle cx={p.x} cy={p.y} r={3.4} fill="none" stroke={color}
                  strokeWidth={0.6} opacity={0.7} />
              )}
              <circle cx={p.x} cy={p.y} r={active ? 2.6 : 2}
                fill={color} opacity={active ? 1 : 0.5} />
              <text x={lp.x} y={lp.y + 1} textAnchor={anchor} fontSize={2.7}
                fill={active ? "var(--fg)" : "var(--muted)"}
                style={{ pointerEvents: "none" }}>
                {name}
              </text>
            </g>
          );
        })}

        {/* filo del viaggio */}
        {pathD && (
          <motion.path
            key={trajectory?.shape}
            d={pathD}
            fill="none"
            stroke="url(#thread)"
            strokeWidth={1}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.95 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
        )}

        {/* waypoint */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i <= currentIndex ? 1.5 : 1}
            fill={i <= currentIndex ? "var(--accent)" : "var(--muted-2)"}
            opacity={i <= currentIndex ? 1 : 0.6}
            style={{ cursor: onSelectStep ? "pointer" : "default" }}
            onClick={() => onSelectStep?.(i)}>
            <title>Step {i + 1}</title>
          </circle>
        ))}

        {/* posizione corrente */}
        {current && (
          <>
            <motion.circle
              animate={{ cx: current.x, cy: current.y }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              r={6} fill="url(#glow)"
            />
            <motion.circle
              animate={{ cx: current.x, cy: current.y, opacity: [0.6, 1, 0.6] }}
              transition={{
                cx: { type: "spring", stiffness: 120, damping: 18 },
                cy: { type: "spring", stiffness: 120, damping: 18 },
                opacity: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
              }}
              r={2} fill="var(--accent)"
            />
          </>
        )}
      </svg>
    </div>
  );
}
