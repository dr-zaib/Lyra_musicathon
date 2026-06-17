"use client";

// The agent conversation: thread (messages + path cards) + comprehension bar +
// quick actions + composer. Shared by both layouts:
//  - variant "panel"    → desktop split (bordered card)
//  - variant "floating" → mobile living-background (frosted, over the scrim)

import { useEffect, useState } from "react";

import type { Trajectory } from "@/lib/types";

export type Msg = { role: "agent" | "user"; text: string };

// While a turn is in flight (~14s on the real backend) Lyra "thinks" — dots + a
// rotating status line so the wait never looks stuck.
const THINKING = ["reading the feeling…", "walking the catalog…", "citing the line…"];
function ThinkingIndicator({ floating }: { floating: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % THINKING.length), 2500);
    return () => clearInterval(id);
  }, []);
  const bubble = floating
    ? "border border-white/10 bg-white/[0.04]"
    : "bg-bg-elev/70";
  return (
    <div
      className={`flex max-w-[80%] items-center gap-2 rounded-xl px-3 py-2.5 ${bubble}`}
      role="status"
      aria-live="polite"
      aria-label="lyra is thinking"
    >
      <span className="flex gap-1">
        <span className="lyra-typing-dot" />
        <span className="lyra-typing-dot" />
        <span className="lyra-typing-dot" />
      </span>
      <span className="text-xs text-muted">{THINKING[i]}</span>
    </div>
  );
}

export default function ConversationPanel({
  variant,
  messages,
  comprehension,
  canStart,
  trajectory,
  pending,
  draft,
  setDraft,
  onSubmit,
  onDeepen,
  onEvolve,
}: {
  variant: "panel" | "floating";
  messages: Msg[];
  comprehension: number;
  canStart: boolean;
  trajectory: Trajectory | null;
  pending: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  onDeepen: () => void;
  onEvolve: () => void;
}) {
  const floating = variant === "floating";

  const agentBubble = floating
    ? "bg-white/[0.04] border border-white/10 text-fg/90"
    : "bg-bg-elev/70 text-fg/90";
  const userBubble = floating
    ? "ml-auto border border-accent/25 bg-accent/10 text-fg"
    : "ml-auto bg-bg-elev-2 text-fg";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              m.role === "agent" ? agentBubble : userBubble
            }`}
          >
            {m.text}
          </div>
        ))}

        {pending && <ThinkingIndicator floating={floating} />}
      </div>

      <div className={`px-4 pt-3 ${floating ? "" : "border-t border-border"}`}>
        <div className="mb-1 flex justify-between text-[11px] text-muted-2">
          <span>how well lyra understands you</span>
          <span>{Math.round(comprehension * 100)}%</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-bg-elev-2"
          role="progressbar"
          aria-label="how well lyra understands you"
          aria-valuenow={Math.round(comprehension * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(comprehension * 100)}%` }} />
        </div>

        {!trajectory ? (
          // before the journey: one clear way to proceed. (At 100% it auto-starts.)
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={onDeepen}
              disabled={!canStart}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-bg-elev-2 disabled:text-muted-2"
            >
              <span aria-hidden>▶</span> play my journey
            </button>
            <button
              onClick={onEvolve}
              className="text-center text-xs text-muted transition hover:text-fg"
            >
              i can&apos;t describe my mood
            </button>
          </div>
        ) : (
          // mid-journey: reshape it
          <div className="mt-3 flex gap-2">
            <button
              onClick={onDeepen}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
            >
              go deeper
            </button>
            <button
              onClick={onEvolve}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
            >
              take me somewhere new
            </button>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="my-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="describe your mood"
            aria-label="describe your mood"
            className={`h-10 flex-1 rounded-xl border px-3 text-sm outline-none focus:border-accent ${
              floating ? "border-white/15 bg-white/[0.06] backdrop-blur-sm" : "border-border bg-transparent"
            }`}
          />
          <button type="submit" className="rounded-xl bg-accent px-4 text-sm text-bg transition hover:brightness-110">
            send
          </button>
        </form>
      </div>
    </div>
  );
}
