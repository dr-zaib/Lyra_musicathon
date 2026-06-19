"use client";

// The agent panel. Logical stack, top → bottom:
//   reset · narration feed (fills the top) · the input bar (composer + steer) lifted to
//   ~33% from the bottom on desktop · "lyra's read" pinned as the very last element.
// Shared by both layouts: "panel" (desktop card) / "floating" (mobile over the scrim).

import { useEffect, useState } from "react";
import { motion } from "motion/react";

import type { TrajectoryShape } from "@/lib/types";

// shared smooth entrance — fade + a small slide up, no bounce
const ENTER = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: "easeOut" as const } };

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

const THINKING = ["reading the feeling…", "walking the catalog…", "citing the line…"];
function ThinkingIndicator({ floating }: { floating: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % THINKING.length), 2500);
    return () => clearInterval(id);
  }, []);
  const bubble = floating ? "border border-white/10 bg-white/[0.07] backdrop-blur-sm" : "bg-bg-elev/70";
  return (
    <motion.div {...ENTER} className={`flex max-w-[80%] items-center gap-2 rounded-xl px-3 py-2.5 ${bubble}`} role="status" aria-live="polite" aria-label="lyra is thinking">
      <span className="flex gap-1"><span className="lyra-typing-dot" /><span className="lyra-typing-dot" /><span className="lyra-typing-dot" /></span>
      <span className="text-xs text-muted">{THINKING[i]}</span>
    </motion.div>
  );
}

export default function ConversationPanel({
  variant,
  messages,
  comprehension,
  playing,
  pending,
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
  comprehension: number;
  playing: boolean;
  pending: boolean;
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
  const cold = !playing && messages.length === 0;

  const agentBubble = floating ? "bg-white/[0.07] border border-white/10 text-fg/90 backdrop-blur-sm" : "bg-bg-elev/70 text-fg/90";
  const userBubble = floating ? "ml-auto border border-accent/25 bg-accent/15 text-fg backdrop-blur-sm" : "ml-auto bg-bg-elev-2 text-fg";
  const inputBase = floating ? "border-white/15 bg-white/[0.06] backdrop-blur-sm" : "border-border bg-transparent";

  return (
    <div className="flex h-full min-h-0 flex-col p-4 pb-5">
      {/* reset (start over) — top-right */}
      {canReset && (
        <div className="flex justify-end">
          <button onClick={onReset} aria-label="start over" title="start over" className="flex h-8 w-8 items-center justify-center rounded-full text-base text-muted transition hover:bg-bg-elev hover:text-fg">↺</button>
        </div>
      )}

      {/* narration feed — fills the top */}
      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
        {cold ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}
            className={`flex h-full flex-col text-center ${floating ? "justify-start pt-[19vh]" : "justify-start pt-[7vh]"}`}
          >
            <h1 className="font-display text-[1.7rem] font-medium lowercase leading-[1.15] tracking-tight text-fg">tell lyra your mood,<br />get a playlist.</h1>
            <p className="mx-auto mt-2 max-w-[20rem] text-sm text-muted">{floating ? "three emotions — just tell me how you feel." : "three emotions — type them, or tap them on the wheel."}</p>
          </motion.div>
        ) : (
          messages.map((m, i) =>
            m.text.trim() ? (
              <motion.div key={i} {...ENTER} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "agent" ? agentBubble : userBubble}`}>{m.text}</motion.div>
            ) : null,
          )
        )}
        {pending && <ThinkingIndicator floating={floating} />}
      </div>

      {/* the input bar — the big "describe" box + the steer. A hairline rule sets it apart
          from the chat above (clear "this is the conversation / these are the controls"). */}
      <div className="shrink-0 space-y-2 border-t border-border pt-3">
        {/* cold: example moods + surprise · playing: the steer pills (lit by mode) */}
        {!playing ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => onExample(ex)} className="rounded-full border border-border px-3 py-1.5 text-[13px] text-muted transition hover:border-accent hover:text-fg">{ex}</button>
              ))}
            </div>
            <button onClick={onSurprise} className="block w-full text-center text-sm text-muted transition hover:text-fg">surprise me</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <button key={m.key} onClick={() => onMode(m.key)} aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:border-accent hover:text-fg"}`}>
                  {m.label}
                </button>
              );
            })}
          </div>
        )}

        {/* describe your mood — send lives inside, bottom-right (shorter on mobile, tall on desktop) */}
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
            placeholder="describe how you feel…"
            aria-label="describe your mood"
            rows={3}
            className={`min-h-[92px] w-full resize-none rounded-xl border px-3 pb-11 pt-2.5 text-sm leading-relaxed outline-none focus:border-accent md:min-h-[150px] ${inputBase}`}
          />
          <button type="submit" className="absolute bottom-3 right-2 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-bg transition hover:brightness-110">send</button>
        </form>
      </div>

      {/* lyra's read — the very last element */}
      <div className="shrink-0 pt-3">
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
