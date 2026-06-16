"use client";

// The emotional wheel — the persistent left-panel map.
// Reacts to the agent's understanding: at low comprehension several emotions glow
// (a cloud); as comprehension rises, it collapses onto the dominant emotion and a
// marker sharpens from a wide faint disc to a precise point. Click a node to
// redirect the journey. Resolution-independent: animates SVG geometry (cx/cy/r)
// via CSS transitions, so it works at any panel size.

import { useMemo, useState } from "react";

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode } from "@/lib/types";

const CX = 50;
const CY = 50;
const R = 40;
const RL = 47;

const WHEEL_ORDER: MacroNode[] = [
  "Tenderness", "Hope", "Joy", "Empowerment",
  "Awe", "Defiance", "Anger", "Anxiety",
  "Melancholia", "Solitude", "Reflection", "Nostalgia",
];

const rd = (v: number) => Math.round(v * 100) / 100;
function at(i: number, radius: number) {
  const a = (i * 2 * Math.PI) / WHEEL_ORDER.length;
  return { x: rd(CX + radius * Math.cos(a)), y: rd(CY - radius * Math.sin(a)) };
}

export default function EmotionWheel({
  distribution,
  comprehension = 0,
  currentEmotion = null,
  onSelect,
}: {
  distribution?: Partial<Record<MacroNode, number>>;
  comprehension?: number;
  currentEmotion?: MacroNode | null;
  onSelect?: (m: MacroNode) => void;
}) {
  const [hovered, setHovered] = useState<MacroNode | null>(null);

  const dominant = useMemo<MacroNode | null>(() => {
    if (currentEmotion) return currentEmotion;
    if (!distribution) return null;
    let best: MacroNode | null = null;
    let bw = 0;
    for (const [n, w] of Object.entries(distribution) as [MacroNode, number][]) {
      if (w > bw) { bw = w; best = n; }
    }
    return best;
  }, [distribution, currentEmotion]);

  const marker = useMemo(() => {
    if (!dominant || currentEmotion) return null;
    const i = WHEEL_ORDER.indexOf(dominant);
    const p = at(i, R);
    return {
      x: rd(CX + (p.x - CX) * comprehension),
      y: rd(CY + (p.y - CY) * comprehension),
      r: rd(13 - comprehension * 9),
      opacity: rd(0.14 + comprehension * 0.55),
      color: TAXONOMY[dominant].color,
    };
  }, [dominant, comprehension, currentEmotion]);

  function nodeStyle(name: MacroNode) {
    const w = distribution?.[name] ?? 0;
    let op: number;
    let r = 2;
    if (hovered) {
      op = name === hovered ? 1 : 0.1;
      r = name === hovered ? 3.4 : 2;
    } else if (currentEmotion) {
      op = name === currentEmotion ? 1 : 0.18;
      r = name === currentEmotion ? 3.2 : 2;
    } else if (dominant) {
      if (name === dominant) { op = Math.min(1, 0.5 + comprehension * 0.5); r = rd(2.4 + comprehension * 1.4); }
      else if (w > 0) op = Math.max(0.12, (0.4 + w * 0.4) * (1 - comprehension * 0.85));
      else op = Math.max(0.08, 0.25 * (1 - comprehension));
    } else {
      op = 0.55;
    }
    return { op: rd(op), r };
  }

  return (
    <svg viewBox="-16 -16 132 132" className="h-full w-full" role="img" aria-label="emotional wheel">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={0.4} />
      <circle cx={CX} cy={CY} r={R * 0.4} fill="none" stroke="var(--border)" strokeWidth={0.3} />

      {marker && (
        <circle
          cx={marker.x} cy={marker.y} r={marker.r} fill={marker.color} opacity={marker.opacity}
          style={{ transition: "cx .65s cubic-bezier(.22,.9,.25,1), cy .65s cubic-bezier(.22,.9,.25,1), r .65s ease, opacity .65s ease, fill .4s ease" }}
        />
      )}

      {WHEEL_ORDER.map((name, i) => {
        const p = at(i, R);
        const lp = at(i, RL);
        const { op, r } = nodeStyle(name);
        const color = TAXONOMY[name].color;
        const anchor = lp.x > CX + 1 ? "start" : lp.x < CX - 1 ? "end" : "middle";
        return (
          <g
            key={name}
            style={{ cursor: onSelect ? "pointer" : "default" }}
            onMouseEnter={() => setHovered(name)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect?.(name)}
          >
            <circle cx={p.x} cy={p.y} r={7} fill="transparent" />
            <circle
              cx={p.x} cy={p.y} r={r} fill={color} opacity={op}
              style={{ transition: "r .4s cubic-bezier(.22,.9,.25,1), opacity .5s ease" }}
            />
            <text
              x={lp.x} y={lp.y + 1} textAnchor={anchor} fontSize={2.7}
              fill={hovered === name || currentEmotion === name ? "var(--fg)" : "var(--muted)"}
              opacity={op < 0.2 ? 0.4 : 1}
              style={{ transition: "opacity .5s ease, fill .3s ease" }}
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
