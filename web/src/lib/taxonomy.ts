// Lyra — emotional macro-node taxonomy.
//
// Positions on a Russell-circumplex-style plane: x = valence (neg -> pos),
// y = intensity/arousal (low -> high). Used by the graph view to lay the nodes
// out so that "deep dive" (stay, narrow in) and "evolve" (move) read spatially.

import type { MacroNode } from "./types";

export interface NodeMeta {
  name: MacroNode;
  x: number; // 0..1  valence
  y: number; // 0..1  intensity
  color: string; // emotional hue
}

export const TAXONOMY: Record<MacroNode, NodeMeta> = {
  Solitude: { name: "Solitude", x: 0.3, y: 0.2, color: "#5b6b9e" },
  Reflection: { name: "Reflection", x: 0.42, y: 0.26, color: "#6d83b8" },
  Melancholia: { name: "Melancholia", x: 0.24, y: 0.36, color: "#7b6fae" },
  Nostalgia: { name: "Nostalgia", x: 0.46, y: 0.38, color: "#b08fb8" },
  Tenderness: { name: "Tenderness", x: 0.62, y: 0.36, color: "#e0a3b0" },
  Hope: { name: "Hope", x: 0.68, y: 0.56, color: "#e8c06a" },
  Joy: { name: "Joy", x: 0.8, y: 0.7, color: "#f2b33d" },
  Awe: { name: "Awe", x: 0.6, y: 0.76, color: "#6fc3c9" },
  Anxiety: { name: "Anxiety", x: 0.24, y: 0.7, color: "#8a7bd8" },
  Anger: { name: "Anger", x: 0.17, y: 0.82, color: "#d96b6b" },
  Defiance: { name: "Defiance", x: 0.36, y: 0.84, color: "#e0855a" },
  Empowerment: { name: "Empowerment", x: 0.6, y: 0.86, color: "#e6a23c" },
};

export const ALL_NODES: NodeMeta[] = Object.values(TAXONOMY);

/** Dominant node of a distribution (max weight). */
export function dominantNode(weights: Partial<Record<MacroNode, number>>): MacroNode {
  let best: MacroNode = "Melancholia";
  let bestW = -1;
  for (const [node, w] of Object.entries(weights) as [MacroNode, number][]) {
    if (w > bestW) {
      bestW = w;
      best = node;
    }
  }
  return best;
}

/** Weighted centroid on the plane (to draw the current position on the map). */
export function centroid(weights: Partial<Record<MacroNode, number>>): {
  x: number;
  y: number;
} {
  let x = 0;
  let y = 0;
  let total = 0;
  for (const [node, w] of Object.entries(weights) as [MacroNode, number][]) {
    const meta = TAXONOMY[node];
    if (!meta) continue;
    x += meta.x * w;
    y += meta.y * w;
    total += w;
  }
  if (total === 0) return { x: 0.5, y: 0.5 };
  return { x: x / total, y: y / total };
}
