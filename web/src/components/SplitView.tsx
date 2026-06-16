"use client";

// The app: a 50/50 split. Left = the emotional wheel (persistent map, reacts to
// the agent's comprehension). Right = the agent conversation (always present);
// the path lives inside the thread as track cards. Bottom = persistent player.
// Comprehension % is mocked here (rises per message); real value comes from the
// agent's confidence once it's wired.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import EmotionWheel from "./EmotionWheel";
import PlayerBar from "./PlayerBar";
import { TAXONOMY } from "@/lib/taxonomy";
import type {
  MacroNode,
  NodeDistribution,
  Trajectory,
  TrajectoryShape,
} from "@/lib/types";

const ORDER: MacroNode[] = [
  "Tenderness", "Hope", "Joy", "Empowerment",
  "Awe", "Defiance", "Anger", "Anxiety",
  "Melancholia", "Solitude", "Reflection", "Nostalgia",
];

const KEYWORDS: [RegExp, MacroNode][] = [
  [/joy|happy|excited|good|great/, "Joy"],
  [/hope|better|looking up/, "Hope"],
  [/tender|love|warm|soft/, "Tenderness"],
  [/power|strong|confident|unstoppable/, "Empowerment"],
  [/awe|wonder|vast|amazed/, "Awe"],
  [/defian|rebel|bold|angry at the world/, "Defiance"],
  [/anger|angry|mad|furious|rage/, "Anger"],
  [/anx|nervous|worried|stress|restless|on edge/, "Anxiety"],
  [/sad|down|blue|melanchol|cry|low/, "Melancholia"],
  [/lonely|alone|solitud|empty/, "Solitude"],
  [/reflect|think|pensive|quiet/, "Reflection"],
  [/nostalg|miss|memory|past|remember/, "Nostalgia"],
];

const FOLLOWUPS = [
  "tell me more — what's sitting underneath it?",
  "is it heavy and still, or restless?",
  "clear. I can feel where you are now.",
];

function interpret(text: string): { seed: MacroNode; dist: NodeDistribution } {
  const v = text.toLowerCase();
  let seed: MacroNode = "Melancholia";
  for (const [re, m] of KEYWORDS) if (re.test(v)) { seed = m; break; }
  const i = ORDER.indexOf(seed);
  const prev = ORDER[(i + ORDER.length - 1) % ORDER.length];
  const next = ORDER[(i + 1) % ORDER.length];
  return { seed, dist: { weights: { [seed]: 0.6, [prev]: 0.2, [next]: 0.2 } } };
}

async function fetchTrajectory(seed: MacroNode, shape: TrajectoryShape): Promise<Trajectory> {
  const res = await fetch("/api/trajectory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed_mood: seed, shape }),
  });
  return res.json();
}

async function enrichWithAudio(traj: Trajectory): Promise<Trajectory> {
  const steps = await Promise.all(
    traj.steps.map(async (s) => {
      const { artist, title } = s.selected_track;
      try {
        const r = await fetch(
          `/api/preview?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
        );
        const d = await r.json();
        return { ...s, selected_track: { ...s.selected_track, preview_url: d.preview_url ?? null, artwork_url: d.artwork_url ?? null } };
      } catch {
        return s;
      }
    }),
  );
  return { ...traj, steps };
}

type Msg = { role: "agent" | "user"; text: string };

export default function SplitView() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "agent", text: "describe your mood — in your own words." },
  ]);
  const [comprehension, setComprehension] = useState(0);
  const [distribution, setDistribution] = useState<NodeDistribution | undefined>(undefined);
  const [seed, setSeed] = useState<MacroNode | null>(null);
  const [turn, setTurn] = useState(0);
  const [draft, setDraft] = useState("");

  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const steps = trajectory?.steps ?? [];
  const currentStep = steps[index] ?? null;

  const currentEmotion = useMemo<MacroNode | null>(() => {
    if (!currentStep) return null;
    const w = currentStep.target_distribution.weights;
    let best: MacroNode | null = null, bw = 0;
    for (const [n, v] of Object.entries(w) as [MacroNode, number][]) if (v > bw) { bw = v; best = n; }
    return best;
  }, [currentStep]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, trajectory]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !trajectory) return;
    const url = steps[index]?.selected_track.preview_url;
    if (!url) { setIsPlaying(false); return; }
    a.src = url; a.load();
    a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [index, trajectory]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const { seed: s, dist } = interpret(text);
    setMessages((m) => [...m, { role: "user", text },
      { role: "agent", text: FOLLOWUPS[Math.min(turn, FOLLOWUPS.length - 1)] }]);
    setSeed(s); setDistribution(dist);
    setComprehension((c) => Math.min(1, c + 0.34)); // mock — real value = agent confidence
    setTurn((t) => t + 1);
    setDraft("");
  }, [draft, turn]);

  const startJourney = useCallback(async (shape: TrajectoryShape) => {
    const s = seed ?? "Melancholia";
    setMessages((m) => [...m, { role: "agent", text: shape === "evolve" ? "let's drift somewhere new — follow me." : "let's go deeper into this." }]);
    const traj = await enrichWithAudio(await fetchTrajectory(s, shape));
    setTrajectory(traj); setIndex(0);
  }, [seed]);

  const redirect = useCallback((m: MacroNode) => {
    const i = ORDER.indexOf(m);
    const prev = ORDER[(i + ORDER.length - 1) % ORDER.length];
    const next = ORDER[(i + 1) % ORDER.length];
    setSeed(m);
    setDistribution({ weights: { [m]: 0.6, [prev]: 0.2, [next]: 0.2 } });
    setComprehension((c) => Math.min(1, c + 0.2));
    setMessages((msg) => [...msg, { role: "user", text: `take me toward ${m.toLowerCase()}` },
      { role: "agent", text: `${m.toLowerCase()} it is.` }]);
  }, []);

  const go = (i: number) => setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  };

  return (
    <div className="relative z-10 flex h-screen flex-col">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { if (index < steps.length - 1) setIndex(index + 1); else setIsPlaying(false); }}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden px-6 py-5">
        {/* LEFT — emotional wheel (map) */}
        <section className="flex w-1/2 flex-col">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="font-display text-2xl font-medium lowercase tracking-tight">lyra</span>
            <span className="text-xs text-muted-2">your emotional map</span>
          </div>
          <div className="flex-1">
            <EmotionWheel
              distribution={distribution?.weights}
              comprehension={comprehension}
              currentEmotion={currentEmotion}
              onSelect={redirect}
            />
          </div>
        </section>

        {/* RIGHT — agent conversation (path lives in the thread) */}
        <section className="flex w-1/2 flex-col rounded-2xl border border-border bg-bg-elev/40">
          <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "agent"
                    ? "bg-bg-elev/70 text-fg/90"
                    : "ml-auto bg-bg-elev-2 text-fg"
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
                  const dom = Object.entries(s.target_distribution.weights).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as MacroNode | undefined;
                  return (
                    <button
                      key={t.track_id}
                      onClick={() => go(i)}
                      className={`flex w-full gap-3 rounded-xl border p-2.5 text-left transition ${
                        active ? "border-accent/40 bg-bg-elev" : "border-border hover:bg-bg-elev/60"
                      }`}
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

          {/* comprehension bar — bottom */}
          <div className="border-t border-border px-4 pt-3">
            <div className="mb-1 flex justify-between text-[11px] text-muted-2">
              <span>how well lyra understands you</span>
              <span>{Math.round(comprehension * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-elev-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.round(comprehension * 100)}%` }}
              />
            </div>

            {/* quick actions */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => startJourney("deepen")}
                disabled={!seed}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg disabled:opacity-30"
              >
                go deeper
              </button>
              <button
                onClick={() => startJourney("evolve")}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
              >
                take me somewhere new
              </button>
            </div>

            {/* composer */}
            <form
              onSubmit={(e) => { e.preventDefault(); submit(); }}
              className="my-3 flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="describe your mood"
                className="h-10 flex-1 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus:border-accent"
              />
              <button type="submit" className="rounded-xl bg-accent px-4 text-sm text-bg transition hover:brightness-110">
                send
              </button>
            </form>
          </div>
        </section>
      </main>

      {trajectory && (
        <PlayerBar
          track={currentStep?.selected_track ?? null}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          hasPrev={index > 0}
          hasNext={index < steps.length - 1}
          onToggle={toggle}
          onPrev={() => go(index - 1)}
          onNext={() => go(index + 1)}
          onSeek={(t) => { const a = audioRef.current; if (a) a.currentTime = t; }}
        />
      )}
    </div>
  );
}
