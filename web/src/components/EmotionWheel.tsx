"use client";

// The emotional wheel — the persistent left-panel map.
// Reacts to the agent's understanding: at low comprehension several emotions glow
// (a cloud); as comprehension rises, it collapses onto the dominant emotion and a
// marker sharpens from a wide faint disc to a precise point. Click a node to
// redirect the journey. Resolution-independent: animates SVG geometry (cx/cy/r)
// via CSS transitions, so it works at any panel size.

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
  labelsActiveOnly = false,
  onSelect,
}: {
  distribution?: Partial<Record<MacroNode, number>>;
  comprehension?: number;
  currentEmotion?: MacroNode | null;
  showLabels?: boolean;
  shape?: boolean;
  labelsActiveOnly?: boolean;
  onSelect?: (m: MacroNode) => void;
}) {
  const [hovered, setHovered] = useState<MacroNode | null>(null);

  // Smoothly tween the shape's distribution so it morphs (adapts) instead of jumping
  // when a new mood is added. Plain rAF — reliable, unlike animating SVG points/d.
  const [disp, setDisp] = useState(distribution);
  const dispRef = useRef(distribution);
  useEffect(() => { dispRef.current = disp; }, [disp]);
  /* eslint-disable react-hooks/set-state-in-effect -- this effect drives an rAF tween (animation) */
  useEffect(() => {
    if (!distribution) { setDisp(undefined); return; }
    const from = dispRef.current;
    // first appearance, hidden tab, or reduced motion → show it at once (no tween)
    if (!from || Object.keys(from).length === 0 || document.hidden) { setDisp(distribution); return; }
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

  // The "emotional signature": the top weighted moods drawn as a morphing shape.
  // Dominant vertex sits near the rim and is largest; the others pull inward and
  // shrink by weight — so a single mood reads as one bright point, a blend as a
  // few-pointed form that builds itself as the conversation sharpens.
  // Persistent labels for the active moods (top 3), placed just beyond their spike
  // tips. No dots — the shape itself carries the meaning.
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
  const activeNames = useMemo(() => new Set(verts.map((v) => v.name)), [verts]);

  // The directional graph: an angular polygon through all 12 nodes, each pushed out
  // from the center by its weight (inactive collapse toward the center). One mood → a
  // tight rhombus/arrow at it; a blend → a multi-spike form toward the dominant.
  const radar = useMemo(() => {
    if (!disp) return null;
    const ws = WHEEL_ORDER.map((n) => disp[n] ?? 0);
    const maxW = Math.max(...ws, 0.0001);
    const dom = WHEEL_ORDER[ws.indexOf(Math.max(...ws))];
    const points = WHEEL_ORDER.map((n, i) => {
      // floor keeps the polygon one cohesive shape (a small core) that bulges toward moods
      const p = at(i, R * (0.15 + 0.85 * ((disp[n] ?? 0) / maxW)));
      return `${p.x},${p.y}`;
    }).join(" ");
    return { points, color: TAXONOMY[dom].color };
  }, [disp]);

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

      {marker && !shape && (
        <circle
          cx={marker.x} cy={marker.y} r={marker.r} fill={marker.color} opacity={marker.opacity}
          style={{ transition: "cx .65s cubic-bezier(.22,.9,.25,1), cy .65s cubic-bezier(.22,.9,.25,1), r .65s ease, opacity .65s ease, fill .4s ease" }}
        />
      )}

      {!shape && WHEEL_ORDER.map((name, i) => {
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
            {showLabels && !shape && (!labelsActiveOnly || activeNames.has(name)) && (
              <text
                x={lp.x} y={lp.y + 1} textAnchor={anchor} fontSize={2.7}
                fill={hovered === name || currentEmotion === name ? "var(--fg)" : "var(--muted)"}
                opacity={op < 0.2 ? 0.4 : 1}
                style={{ transition: "opacity .5s ease, fill .3s ease" }}
              >
                {name}
              </text>
            )}
          </g>
        );
      })}

      {shape && radar && (
        <g>
          {/* the directional graph — an angular shape that morphs as moods accumulate
              (point positions are tweened in `disp`, so it adapts instead of jumping) */}
          <polygon
            points={radar.points}
            fill={radar.color} fillOpacity={0.2}
            stroke={radar.color} strokeOpacity={0.55} strokeWidth={0.8} strokeLinejoin="round"
            style={{ transition: "fill .4s ease, stroke .4s ease" }}
          />
          {showLabels && verts.map((v) => (
            <text
              key={`lab-${v.name}`}
              x={v.lx} y={v.ly} textAnchor={v.anchor} fontSize={2.7}
              fill="var(--fg)" opacity={v.op}
              style={{ transition: "x .6s cubic-bezier(.22,.9,.25,1), y .6s cubic-bezier(.22,.9,.25,1), opacity .5s ease" }}
            >
              {v.name}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
