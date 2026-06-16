"use client";

// The agent conversation: thread (messages + path cards) + comprehension bar +
// quick actions + composer. Shared by both layouts:
//  - variant "panel"    → desktop split (bordered card)
//  - variant "floating" → mobile living-background (frosted, over the scrim)

import Image from "next/image";

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode, Trajectory } from "@/lib/types";

export type Msg = { role: "agent" | "user"; text: string };

export default function ConversationPanel({
  variant,
  messages,
  comprehension,
  seed,
  trajectory,
  index,
  isPlaying,
  draft,
  setDraft,
  onSubmit,
  onDeepen,
  onEvolve,
  onSelectTrack,
}: {
  variant: "panel" | "floating";
  messages: Msg[];
  comprehension: number;
  seed: MacroNode | null;
  trajectory: Trajectory | null;
  index: number;
  isPlaying: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  onDeepen: () => void;
  onEvolve: () => void;
  onSelectTrack: (i: number) => void;
}) {
  const steps = trajectory?.steps ?? [];
  const floating = variant === "floating";

  const agentBubble = floating
    ? "bg-white/[0.06] border border-white/10 text-fg/90 backdrop-blur-sm"
    : "bg-bg-elev/70 text-fg/90";
  const userBubble = floating
    ? "ml-auto border border-accent/30 bg-accent/15 text-fg"
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

        {trajectory && (
          <div className="space-y-2 pt-1">
            {steps.map((s, i) => {
              const t = s.selected_track;
              const active = i === index;
              const dom = Object.entries(s.target_distribution.weights).sort(
                (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
              )[0]?.[0] as MacroNode | undefined;
              const cardBg = floating
                ? active
                  ? "border-accent/40 bg-white/[0.08] backdrop-blur-sm"
                  : "border-white/10 bg-white/[0.04] backdrop-blur-sm"
                : active
                  ? "border-accent/40 bg-bg-elev"
                  : "border-border hover:bg-bg-elev/60";
              return (
                <button
                  key={t.track_id}
                  onClick={() => onSelectTrack(i)}
                  className={`flex w-full gap-3 rounded-xl border p-2.5 text-left transition ${cardBg}`}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg-elev-2">
                    {t.artwork_url ? (
                      <Image src={t.artwork_url} alt="" fill sizes="48px" className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted">♪</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dom ? TAXONOMY[dom].color : "var(--muted)" }} />
                      <span className="truncate text-sm font-medium">{t.title}</span>
                      {active && isPlaying && <span className="text-xs text-accent">♪</span>}
                    </div>
                    <div className="truncate text-xs text-muted">{t.artist}</div>
                    <div className="mt-1 text-xs italic text-fg/70">“{s.citable_verse}”</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={`px-4 pt-3 ${floating ? "" : "border-t border-border"}`}>
        <div className="mb-1 flex justify-between text-[11px] text-muted-2">
          <span>how well lyra understands you</span>
          <span>{Math.round(comprehension * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-elev-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(comprehension * 100)}%` }} />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={onDeepen}
            disabled={!seed}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg disabled:opacity-30"
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

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="my-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="describe your mood"
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
