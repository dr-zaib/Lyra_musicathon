"use client";

// L'atlante emotivo: i 12 macro-nodi disposti su un piano valenza x intensità,
// con la traiettoria tracciata come percorso e la posizione corrente che pulsa.
// I nodi che compongono lo step corrente si accendono (anello) -> collega la
// mappa alle percentuali mood nella StepCard. Waypoint cliccabili per saltare.
// È il visual-hero del demo; sostituibile con react-flow se serve drag/zoom.

import { useMemo } from "react";

import { ALL_NODES, centroid } from "@/lib/taxonomy";
import type { MacroNode, Trajectory } from "@/lib/types";

const px = (x: number) => x * 100;
const py = (y: number) => (1 - y) * 100; // intensità alta = in alto

export default function EmotionalAtlas({
  trajectory,
  currentIndex,
  onSelectStep,
}: {
  trajectory: Trajectory | null;
  currentIndex: number;
  onSelectStep?: (i: number) => void;
}) {
  const points = useMemo(() => {
    if (!trajectory) return [];
    return trajectory.steps.map((s) => {
      const c = centroid(s.target_distribution.weights);
      return { x: px(c.x), y: py(c.y) };
    });
  }, [trajectory]);

  const pathD = useMemo(() => {
    if (points.length < 2) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }, [points]);

  const current = points[currentIndex];

  // nodi che compongono lo step corrente (per accenderli)
  const activeNodes = new Set<MacroNode>(
    Object.keys(trajectory?.steps[currentIndex]?.target_distribution.weights ?? {}) as MacroNode[],
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-bg-elev/60">
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-2">
          Emotional atlas
        </div>
        <div className="mt-1 flex gap-4 text-[10px] text-muted-2">
          <span>← darker · brighter →</span>
          <span>↑ more intense</span>
        </div>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <defs>
          <radialGradient id="here" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="trail" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d83b8" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>

        {/* nodi di sfondo */}
        {ALL_NODES.map((n) => {
          const cx = px(n.x);
          const cy = py(n.y);
          const active = activeNodes.has(n.name);
          return (
            <g key={n.name}>
              <title>{n.name}</title>
              {active && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="none"
                  stroke={n.color}
                  strokeWidth={0.5}
                  opacity={0.7}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={active ? 2.8 : 2.4}
                fill={n.color}
                opacity={active ? 1 : 0.45}
              />
              <text
                x={cx}
                y={cy - 3.6}
                textAnchor="middle"
                fontSize={2.6}
                fill={active ? "var(--fg)" : "var(--muted)"}
                style={{ pointerEvents: "none" }}
              >
                {n.name}
              </text>
            </g>
          );
        })}

        {/* traiettoria */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="url(#trail)"
            strokeWidth={0.9}
            strokeLinecap="round"
            strokeDasharray="0.1 2"
            opacity={0.9}
          />
        )}

        {/* waypoint percorsi (cliccabili) */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i <= currentIndex ? 1.6 : 1.1}
            fill={i <= currentIndex ? "var(--accent)" : "var(--muted-2)"}
            opacity={i <= currentIndex ? 1 : 0.6}
            style={{ cursor: onSelectStep ? "pointer" : "default" }}
            onClick={() => onSelectStep?.(i)}
          >
            <title>Step {i + 1}</title>
          </circle>
        ))}

        {/* posizione corrente */}
        {current && (
          <>
            <circle cx={current.x} cy={current.y} r={6} fill="url(#here)" />
            <circle
              cx={current.x}
              cy={current.y}
              r={2.1}
              fill="var(--accent)"
              style={{
                transformOrigin: `${current.x}px ${current.y}px`,
                animation: "pulse-dot 1.8s ease-in-out infinite",
              }}
            />
          </>
        )}
      </svg>
    </div>
  );
}
