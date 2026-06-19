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
const R = 36; // -10% (was 40) — pulls the ring, nodes, radar + labels inward

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

// closed Catmull-Rom → cubic bézier: turns the 12 radar points into one smooth, organic
// outline (no jagged "broken line" between non-adjacent spikes).
function smoothClosed(p: { x: number; y: number }[]): string {
  const n = p.length;
  let d = `M ${p[0].x},${p[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1x = rd(p1.x + (p2.x - p0.x) / 6), c1y = rd(p1.y + (p2.y - p0.y) / 6);
    const c2x = rd(p2.x - (p3.x - p1.x) / 6), c2y = rd(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d + " Z";
}

export default function EmotionWheel({
  distribution,
  comprehension = 0,
  currentEmotion = null,
  showLabels = true,
  shape = false,
  faintShape = false,
  big = false,
  onSelect,
}: {
  distribution?: Partial<Record<MacroNode, number>>;
  comprehension?: number;
  currentEmotion?: MacroNode | null;
  showLabels?: boolean;
  shape?: boolean;
  faintShape?: boolean; // dim the radar polygon (mobile background, so labels read over it)
  big?: boolean;        // larger labels (desktop)
  onSelect?: (m: MacroNode) => void;
}) {
  const [hovered, setHovered] = useState<MacroNode | null>(null);
  const [focused, setFocused] = useState<MacroNode | null>(null);

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
      const e = 1 - Math.pow(1 - t, 3); // smooth ease-out, no overshoot
      const cur: Partial<Record<MacroNode, number>> = {};
      for (const k of keys) cur[k] = (from[k] ?? 0) + ((to[k] ?? 0) - (from[k] ?? 0)) * e;
      setDisp(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [distribution]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // shape-only (mobile): the 12 emotion labels CURVED along a ring just outside the wheel.
  // Each label is an arc segment with text on a path. Readable on both halves like a coin:
  // top arcs drawn clockwise (ascenders point outward), bottom arcs drawn counter-clockwise
  // (ascenders point inward) — so nothing is upside-down. Curving also tucks the side
  // labels along the arc instead of radiating them off the screen edges.
  const RC = 40.5; // label-ring radius (-10%, was 45), just outside the wheel ring
  const labelArcs = useMemo(() => {
    const spread = (18 * Math.PI) / 180; // arc half-width per label
    const pt = (a: number) => `${rd(CX + RC * Math.cos(a))},${rd(CY - RC * Math.sin(a))}`;
    return WHEEL_ORDER.map((name, i) => {
      const theta = (i * 2 * Math.PI) / WHEEL_ORDER.length; // math angle (CCW from +x)
      const topHalf = Math.sin(theta) >= -0.001;
      const a1 = theta + spread, a2 = theta - spread;
      const d = topHalf
        ? `M ${pt(a1)} A ${RC} ${RC} 0 0 1 ${pt(a2)}` // clockwise → reads outward
        : `M ${pt(a2)} A ${RC} ${RC} 0 0 0 ${pt(a1)}`; // counter-clockwise → reads inward
      return { name, id: `lw-arc-${i}`, d };
    });
  }, []);

  // the radar polygon: one cohesive angular shape through all 12 nodes, each pushed out
  // by its weight (floor keeps a small core). One mood → a rhombus/arrow at it.
  const radar = useMemo(() => {
    if (!disp) return null;
    const n = WHEEL_ORDER.length;
    const ws = WHEEL_ORDER.map((m) => disp[m] ?? 0);
    const dom = WHEEL_ORDER[ws.indexOf(Math.max(...ws))];
    // each node's radius is a smooth "field": its own weight plus spill from neighbours
    // (gaussian over circular distance). The outline bulges toward the picks and rounds
    // out between them — a high floor keeps a full body so it never collapses inward.
    const SIGMA = 0.9; // spill width, in node-steps
    const field = WHEEL_ORDER.map((_, i) => {
      let f = 0;
      for (let j = 0; j < n; j++) {
        const dd = Math.min(Math.abs(i - j), n - Math.abs(i - j)); // circular distance
        f += ws[j] * Math.exp(-(dd * dd) / (2 * SIGMA * SIGMA));
      }
      return f;
    });
    const maxF = Math.max(...field, 0.0001);
    const FLOOR = 0.33, SPAN = 0.67; // dominant spike → the ring; valleys stay ≥ 0.33·R (no deep notch)
    const pts = WHEEL_ORDER.map((_, i) => at(i, R * (FLOOR + SPAN * (field[i] / maxF))));
    return { d: smoothClosed(pts), color: TAXONOMY[dom].color };
  }, [disp]);

  // the centre "core" — a soft breathing orb that gives the empty middle some life and
  // warms toward the dominant emotion as picks accumulate (violet at rest).
  const coreColor = radar?.color ?? "#7a6ad6";

  const interactive = !!onSelect;

  return (
    <svg viewBox={big ? "-10 -10 120 120" : "-16 -16 132 132"} className="h-full w-full" role="img" aria-label="emotional wheel">
      {/* shared decorative defs: the core's radial glow + a soft blur for the radar */}
      <defs>
        <radialGradient id="lw-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={coreColor} stopOpacity={0.82} />
          <stop offset="48%" stopColor={coreColor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={coreColor} stopOpacity={0} />
        </radialGradient>
        <filter id="lw-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={faintShape ? 0.6 : 0.9} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* the radar glows from the wheel centre outward, instead of a flat fill */}
        <radialGradient id="lw-radar" gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={rd(R * 0.72)}>
          <stop offset="0%" stopColor={coreColor} stopOpacity={0.95} />
          <stop offset="68%" stopColor={coreColor} stopOpacity={0.4} />
          <stop offset="100%" stopColor={coreColor} stopOpacity={0.12} />
        </radialGradient>
      </defs>

      {/* the breathing core — empty middle gets a soft orb that grows + warms with picks */}
      {shape && (
        <g style={{ opacity: rd((0.72 + comprehension * 0.28) * (faintShape ? 0.7 : 1)), transition: "opacity .6s ease" }} pointerEvents="none">
          <circle className="lyra-core" cx={CX} cy={CY} r={rd(R * 0.9)} fill="url(#lw-core)" />
        </g>
      )}

      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={0.4} />
      <circle cx={CX} cy={CY} r={R * 0.4} fill="none" stroke="var(--border)" strokeWidth={0.3} />

      {/* the directional graph — one cohesive angular shape that morphs as moods accumulate;
          confidence controls its sharpness (faint when unsure, crisp when confident) */}
      {shape && radar && (
        <path
          d={radar.d}
          fill="url(#lw-radar)" fillOpacity={rd((0.16 + comprehension * 0.22) * (faintShape ? 0.4 : 1))}
          stroke={radar.color} strokeOpacity={rd((0.3 + comprehension * 0.4) * (faintShape ? 0.5 : 1))} strokeWidth={faintShape ? 0.6 : 0.8} strokeLinejoin="round"
          filter="url(#lw-glow)"
          style={{ transition: "fill .4s ease, stroke .4s ease, fill-opacity .5s ease, stroke-opacity .5s ease" }}
        />
      )}

      {/* the 12 emotion labels — curved around the ring, coloured by emotion, and
          clickable (when onSelect) to steer. The label IS the control now (no dot-nodes).
          A wide transparent arc behind each gives a comfortable tap/click area. */}
      {shape && showLabels && (
        <>
          <defs>
            {labelArcs.map((l) => <path key={l.id} id={l.id} d={l.d} fill="none" />)}
          </defs>
          {labelArcs.map((l) => {
            const color = TAXONOMY[l.name].color;
            const picked = (disp?.[l.name] ?? 0) > 0.04 || currentEmotion === l.name;
            const hot = hovered === l.name || focused === l.name;
            const lit = picked || hot;
            return (
              <g
                key={`lw-${l.name}`}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? `steer toward ${l.name}` : undefined}
                style={interactive ? { cursor: "pointer", outline: "none" } : undefined}
                onMouseEnter={interactive ? () => setHovered(l.name) : undefined}
                onMouseLeave={interactive ? () => setHovered(null) : undefined}
                onFocus={interactive ? () => setFocused(l.name) : undefined}
                onBlur={interactive ? () => setFocused(null) : undefined}
                onClick={interactive ? () => onSelect?.(l.name) : undefined}
                onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(l.name); } } : undefined}
              >
                {interactive && <path d={l.d} fill="none" stroke="transparent" strokeWidth={9} strokeLinecap="round" />}
                <text
                  fontSize={rd((big ? 4.3 : 2.9) * (hot ? 1.08 : 1))}
                  className="font-display"
                  dominantBaseline="central"
                  fill={color}
                  opacity={lit ? 1 : 0.72}
                  style={{
                    transition: "opacity .35s ease, font-size .2s ease",
                    fontWeight: picked ? 600 : 400,
                    filter: lit ? `drop-shadow(0 0 1.3px ${color})` : "none",
                  }}
                >
                  <textPath href={`#${l.id}`} startOffset="50%" textAnchor="middle">{l.name.toLowerCase()}</textPath>
                </text>
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}
