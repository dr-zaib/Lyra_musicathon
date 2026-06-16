"use client";

// The emotional wheel — the persistent emotional map.
// It renders the agent's intent `distribution` as an angular "radar" shape that morphs
// (rAF-tweened) as moods accumulate: a single mood is a rhombus pointing at it, a blend
// a multi-spike form, the first/strongest mood the longest spike. `confidence` controls
// the shape's sharpness/fog (faint when unsure, crisp when confident).
//   - mobile (shape, no onSelect): just the shape + active labels (background map).
//   - desktop (shape + onSelect): the shape over the 12 clickable, labelled nodes, so
//     you can click an emotion to steer the journey.
// Resolution-independent (SVG geometry) → works at any panel size.

import { useEffect, useMemo, useRef, useState } from "react";

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
  showLabels = true,
  shape = false,
  onSelect,
}: {
  distribution?: Partial<Record<MacroNode, number>>;
  comprehension?: number;
  currentEmotion?: MacroNode | null;
  showLabels?: boolean;
  shape?: boolean;
  onSelect?: (m: MacroNode) => void;
}) {
  const [hovered, setHovered] = useState<MacroNode | null>(null);

  // Tween the shape's distribution so it morphs (adapts) instead of jumping when a mood
  // is added. Plain rAF — reliable, unlike animating SVG points/d. Snaps for hidden tabs
  // and reduced motion.
  const [disp, setDisp] = useState(distribution);
  const dispRef = useRef(distribution);
  useEffect(() => { dispRef.current = disp; }, [disp]);
  /* eslint-disable react-hooks/set-state-in-effect -- this effect drives an rAF tween (animation) */
  useEffect(() => {
    if (!distribution) { setDisp(undefined); return; }
    const from = dispRef.current;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!from || Object.keys(from).length === 0 || document.hidden || reduced) { setDisp(distribution); return; }
    const to = distribution;
    const keys = Array.from(new Set([...Object.keys(from), ...Object.keys(to)])) as MacroNode[];
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const e = 1 - Math.pow(1 - t, 3);
      const cur: Partial<Record<MacroNode, number>> = {};
      for (const k of keys) cur[k] = (from[k] ?? 0) + ((to[k] ?? 0) - (from[k] ?? 0)) * e;
      setDisp(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [distribution]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // active mood labels (top 3), placed beyond their spike tips — used in shape-only
  // (mobile) mode where the 12 nodes aren't drawn.
  const verts = useMemo(() => {
    if (!disp) return [] as { name: MacroNode; lx: number; ly: number; anchor: "start" | "middle" | "end"; op: number }[];
    const top = (Object.entries(disp) as [MacroNode, number][])
      .filter(([, w]) => w > 0.04)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const maxW = top[0]?.[1] ?? 1;
    return top.map(([name, w]) => {
      const norm = w / maxW;
      const ang = (WHEEL_ORDER.indexOf(name) * 2 * Math.PI) / WHEEL_ORDER.length;
      const lr = R * (0.15 + 0.85 * norm) + 4;
      const lx = rd(CX + lr * Math.cos(ang));
      const ly = rd(CY - lr * Math.sin(ang));
      const anchor: "start" | "middle" | "end" = lx > CX + 1 ? "start" : lx < CX - 1 ? "end" : "middle";
      return { name, lx, ly, anchor, op: rd(0.55 + 0.45 * norm) };
    });
  }, [disp]);

  // the radar polygon: one cohesive angular shape through all 12 nodes, each pushed out
  // by its weight (floor keeps a small core). One mood → a rhombus/arrow at it.
  const radar = useMemo(() => {
    if (!disp) return null;
    const ws = WHEEL_ORDER.map((n) => disp[n] ?? 0);
    const maxW = Math.max(...ws, 0.0001);
    const dom = WHEEL_ORDER[ws.indexOf(Math.max(...ws))];
    const points = WHEEL_ORDER.map((n, i) => {
      const p = at(i, R * (0.15 + 0.85 * ((disp[n] ?? 0) / maxW)));
      return `${p.x},${p.y}`;
    }).join(" ");
    return { points, color: TAXONOMY[dom].color };
  }, [disp]);

  function nodeStyle(name: MacroNode): { op: number; r: number } {
    const w = disp?.[name] ?? 0;
    if (hovered === name) return { op: 1, r: 3.2 };
    if (currentEmotion === name) return { op: 1, r: 3 };
    if (w > 0.04) return { op: rd(Math.min(1, 0.55 + w * 0.6)), r: rd(2 + w * 1.6) };
    if (hovered) return { op: 0.12, r: 2 };
    return { op: 0.4, r: 2 };
  }

  const interactive = !!onSelect;

  return (
    <svg viewBox="-16 -16 132 132" className="h-full w-full" role="img" aria-label="emotional wheel">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={0.4} />
      <circle cx={CX} cy={CY} r={R * 0.4} fill="none" stroke="var(--border)" strokeWidth={0.3} />

      {/* the directional graph — one cohesive angular shape that morphs as moods accumulate;
          confidence controls its sharpness (faint when unsure, crisp when confident) */}
      {shape && radar && (
        <polygon
          points={radar.points}
          fill={radar.color} fillOpacity={rd(0.08 + comprehension * 0.16)}
          stroke={radar.color} strokeOpacity={rd(0.3 + comprehension * 0.4)} strokeWidth={0.8} strokeLinejoin="round"
          style={{ transition: "fill .4s ease, stroke .4s ease, fill-opacity .5s ease, stroke-opacity .5s ease" }}
        />
      )}

      {/* desktop: the 12 clickable, labelled nodes (orientation + steering) */}
      {interactive && WHEEL_ORDER.map((name, i) => {
        const p = at(i, R);
        const lp = at(i, RL);
        const { op, r } = nodeStyle(name);
        const color = TAXONOMY[name].color;
        const anchor = lp.x > CX + 1 ? "start" : lp.x < CX - 1 ? "end" : "middle";
        const active = (disp?.[name] ?? 0) > 0.04 || hovered === name || currentEmotion === name;
        return (
          <g
            key={name}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered(name)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect?.(name)}
          >
            <circle cx={p.x} cy={p.y} r={7} fill="transparent" />
            <circle
              cx={p.x} cy={p.y} r={r} fill={color} opacity={op}
              style={{ transition: "r .4s cubic-bezier(.22,.9,.25,1), opacity .5s ease" }}
            />
            {showLabels && (
              <text
                x={lp.x} y={lp.y + 1} textAnchor={anchor} fontSize={2.7}
                fill={active ? "var(--fg)" : "var(--muted)"}
                opacity={active ? 1 : 0.5}
                style={{ transition: "opacity .5s ease, fill .3s ease" }}
              >
                {name}
              </text>
            )}
          </g>
        );
      })}

      {/* shape-only (mobile): label just the active moods */}
      {shape && !interactive && showLabels && verts.map((v) => (
        <text
          key={`lab-${v.name}`}
          x={v.lx} y={v.ly} textAnchor={v.anchor} fontSize={2.7}
          fill="var(--fg)" opacity={v.op}
          style={{ transition: "x .6s cubic-bezier(.22,.9,.25,1), y .6s cubic-bezier(.22,.9,.25,1), opacity .5s ease" }}
        >
          {v.name}
        </text>
      ))}
    </svg>
  );
}
