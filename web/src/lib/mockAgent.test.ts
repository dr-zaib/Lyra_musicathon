import { describe, it, expect } from "vitest";

import { mockAgentTurn } from "./mockAgent";

// Each test uses a fresh session_id — the mock keeps in-memory per-session state.
let n = 0;
const sid = () => `test-${++n}`;
const sumWeights = (w: Record<string, number | undefined>) =>
  Object.values(w).reduce<number>((a, b) => a + (b ?? 0), 0);

describe("mockAgentTurn — the agent-turn contract", () => {
  it("reads a clear mood: confidence rises, distribution carries it, no journey yet", () => {
    const t = mockAgentTurn({ message: "i feel joyful", session_id: sid() });
    expect(t.trajectory ?? null).toBeNull();
    expect(t.confidence).toBeGreaterThan(0);
    expect(Object.keys(t.distribution.weights)).toContain("Joy");
  });

  it("distress is never soundtracked — responds with care, never proceeds (safety)", () => {
    const t = mockAgentTurn({ message: "i want to die", session_id: sid() });
    expect(t.trajectory ?? null).toBeNull();
    expect(t.message.toLowerCase()).toMatch(/helpline|reach out|here/);
  });

  it("'ok' after a mood goes straight to a journey at full confidence", () => {
    const s = sid();
    mockAgentTurn({ message: "i feel joyful", session_id: s });
    const t = mockAgentTurn({ message: "ok", session_id: s });
    expect(t.trajectory).toBeTruthy();
    expect(t.confidence).toBe(1);
  });

  it("first mood mentioned is the strongest, the second weaker", () => {
    const s = sid();
    mockAgentTurn({ message: "i feel joyful", session_id: s }); // Joy first
    const t = mockAgentTurn({ message: "but also nostalgic", session_id: s }); // Nostalgia second
    const w = t.distribution.weights;
    expect(w.Joy ?? 0).toBeGreaterThan(w.Nostalgia ?? 0);
  });

  it("distribution weights + shuffle always sum to 1", () => {
    const t = mockAgentTurn({ message: "i feel joyful and excited", session_id: sid() });
    expect(sumWeights(t.distribution.weights) + t.shuffle).toBeCloseTo(1, 1);
  });

  it("no input → shuffle is 1 (pure serendipity)", () => {
    const t = mockAgentTurn({ message: "", session_id: sid() });
    expect(t.shuffle).toBeCloseTo(1, 5);
    expect(sumWeights(t.distribution.weights)).toBeCloseTo(0, 5);
  });

  it("ambiguous input → a guess to confirm, no journey", () => {
    const t = mockAgentTurn({ message: "everything is just a lot lately honestly", session_id: sid() });
    expect(t.trajectory ?? null).toBeNull();
    expect(t.message.toLowerCase()).toMatch(/does that land|am i off/);
  });

  it("click-a-node shortcut (seed_mood) emits a journey immediately", () => {
    const t = mockAgentTurn({ seed_mood: "Anger", session_id: sid() });
    expect(t.trajectory).toBeTruthy();
  });

  it("evolve shape produces the evolve trajectory", () => {
    const t = mockAgentTurn({ shape: "evolve", session_id: sid() });
    expect(t.trajectory?.shape).toBe("evolve");
  });
});
