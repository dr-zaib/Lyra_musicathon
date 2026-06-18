"use client";

// The agent panel: a big "describe your mood" box up top (the invitation to write),
// the 3-emotion progress (pips — show don't tell), the steer pills while playing, the
// narration feed, and the "lyra's read" bar pinned last. Shared by both layouts:
//  - variant "panel"    → desktop split (bordered card)
//  - variant "floating" → mobile living-background (frosted, over the scrim)

import { useEffect, useState } from "react";

import type { TrajectoryShape } from "@/lib/types";

export type Msg = { role: "agent" | "user"; text: string };

const EXAMPLES = ["restless and wired", "missing someone", "quietly hopeful"];

const MODES: { key: TrajectoryShape; label: string }[] = [
  { key: "deepen", label: "more like this" },
  { key: "evolve", label: "change the mood" },
  { key: "escalate", label: "raise the energy" },
];

function readLabel(c: number): string {
  if (c <= 0) return "listening";
  if (c < 0.34) return "tuning in";
  if (c < 0.7) return "getting it";
  if (c < 1) return "almost there";
  return "got it";
}

// While a turn is in flight Lyra "thinks" — dots + a rotating status line.
const THINKING = ["reading the feeling…", "walking the catalog…", "citing the line…"];
function ThinkingIndicator({ floating }: { floating: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % THINKING.length), 2500);
    return () => clearInterval(id);
  }, []);
  const bubble = floating ? "border border-white/10 bg-white/[0.07] backdrop-blur-sm" : "bg-bg-elev/70";
  return (
    <div className={`flex max-w-[80%] items-center gap-2 rounded-xl px-3 py-2.5 ${bubble}`} role="status" aria-live="polite" aria-label="lyra is thinking">
      <span className="flex gap-1">
        <span className="lyra-typing-dot" /><span className="lyra-typing-dot" /><span className="lyra-typing-dot" />
      </span>
      <span className="text-xs text-muted">{THINKING[i]}</span>
    </div>
  );
}

export default function ConversationPanel({
  variant,
  messages,
  picksCount,
  maxPicks,
  comprehension,
  playing,
  pending,
  building,
  mode,
  draft,
  setDraft,
  onSubmit,
  onExample,
  onSurprise,
  onMode,
  onReset,
  canReset,
}: {
  variant: "panel" | "floating";
  messages: Msg[];
  picksCount: number;
  maxPicks: number;
  comprehension: number;
  playing: boolean;
  pending: boolean;
  building: boolean;
  mode: TrajectoryShape;
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  onExample: (text: string) => void;
  onSurprise: () => void;
  onMode: (shape: TrajectoryShape) => void;
  onReset: () => void;
  canReset: boolean;
}) {
  const floating = variant === "floating";
  const cold = !playing && messages.length <= 1 && picksCount === 0;

  const agentBubble = floating ? "bg-white/[0.07] border border-white/10 text-fg/90 backdrop-blur-sm" : "bg-bg-elev/70 text-fg/90";
  const userBubble = floating ? "ml-auto border border-accent/25 bg-accent/15 text-fg backdrop-blur-sm" : "ml-auto bg-bg-elev-2 text-fg";
  const inputBase = floating ? "border-white/15 bg-white/[0.06] backdrop-blur-sm" : "border-border bg-transparent";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {/* reset (start over) — top-right of the panel */}
      {canReset && (
        <div className="-mb-2 flex justify-end">
          <button onClick={onReset} aria-label="start over" title="start over" className="flex h-8 w-8 items-center justify-center rounded-full text-base text-muted transition hover:bg-bg-elev hover:text-fg">↺</button>
        </div>
      )}

      {/* the invitation — a big box, the first thing the eye lands on */}
      <div>
        {cold && (
          <div className="mb-2">
            <h1 className="font-display text-[1.6rem] font-medium lowercase leading-[1.15] tracking-tight text-fg">tell lyra your mood,<br />get a playlist.</h1>
            <p className="mt-1.5 text-xs text-muted">three emotions — type one, or tap them on the wheel.</p>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
            placeholder="describe how you feel…"
            aria-label="describe your mood"
            rows={3}
            className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-accent ${inputBase}`}
          />
          <div className="flex items-center gap-2">
            {/* emotion pips — show, don't tell */}
            <div className="flex items-center gap-1.5" aria-label={`${picksCount} of ${maxPicks} emotions`}>
              {Array.from({ length: maxPicks }).map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full transition ${i < picksCount ? "bg-accent" : "bg-bg-elev-2"}`} />
              ))}
              <span className="ml-1 text-[11px] text-muted-2">{picksCount < maxPicks ? `${maxPicks - picksCount} more to play` : "playing"}</span>
            </div>
            <button type="submit" className="ml-auto rounded-xl border border-border px-4 py-1.5 text-sm text-muted transition hover:border-accent hover:text-fg">send</button>
          </div>
        </form>
      </div>

      {/* cold-start: example moods + surprise · playing: the steer pills (lit by mode) */}
      {!playing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => onExample(ex)} className="rounded-full border border-border px-3 py-1 text-[11px] text-muted transition hover:border-accent hover:text-fg">{ex}</button>
            ))}
          </div>
          <button onClick={onSurprise} className="self-start text-xs text-muted transition hover:text-fg">or surprise me</button>
        </div>
      ) : (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-2">
            <span>where to next?</span>
            {building && <span className="text-muted">building…</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => onMode(m.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:border-accent hover:text-fg"}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* narration feed */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.map((m, i) =>
          m.text.trim() ? (
            <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "agent" ? agentBubble : userBubble}`}>{m.text}</div>
          ) : null,
        )}
        {pending && <ThinkingIndicator floating={floating} />}
      </div>

      {/* lyra's read — pinned last */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted-2">
          <span>lyra’s read on you</span>
          <span className="text-muted">{readLabel(comprehension)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-elev-2" role="progressbar" aria-label={`lyra's read on you: ${readLabel(comprehension)}`} aria-valuenow={Math.round(comprehension * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(comprehension * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
