"use client";

// The app, responsive.
//  - Mobile (base): living background — the wheel is a big, dimmed, breathing
//    backdrop; the conversation floats over a bottom scrim. Tap the top to bring
//    the wheel forward as an interactive map; tap the chat to return.
//  - Desktop (md:+): the 50/50 split — wheel left, agent right.
// Same state/audio for both. Comprehension % is mocked (rises per message);
// real value = the agent's confidence once wired.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConversationPanel, { type Msg } from "./ConversationPanel";
import EmotionWheel from "./EmotionWheel";
import PlayerBar from "./PlayerBar";
import type { MacroNode, NodeDistribution, Trajectory, TrajectoryShape } from "@/lib/types";

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
  [/defian|rebel|bold/, "Defiance"],
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

function distFor(m: MacroNode): NodeDistribution {
  const i = ORDER.indexOf(m);
  const prev = ORDER[(i + ORDER.length - 1) % ORDER.length];
  const next = ORDER[(i + 1) % ORDER.length];
  return { weights: { [m]: 0.6, [prev]: 0.2, [next]: 0.2 } };
}
function interpret(text: string): MacroNode {
  const v = text.toLowerCase();
  for (const [re, m] of KEYWORDS) if (re.test(v)) return m;
  return "Melancholia";
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
        const r = await fetch(`/api/preview?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        const d = await r.json();
        return { ...s, selected_track: { ...s.selected_track, preview_url: d.preview_url ?? null, artwork_url: d.artwork_url ?? null } };
      } catch {
        return s;
      }
    }),
  );
  return { ...traj, steps };
}

export default function SplitView() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "agent", text: "describe your mood — in your own words." }]);
  const [comprehension, setComprehension] = useState(0);
  const [distribution, setDistribution] = useState<NodeDistribution | undefined>(undefined);
  const [seed, setSeed] = useState<MacroNode | null>(null);
  const [turn, setTurn] = useState(0);
  const [draft, setDraft] = useState("");
  const [wheelFocus, setWheelFocus] = useState(false);

  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const steps = trajectory?.steps ?? [];
  const currentStep = steps[index] ?? null;

  const currentEmotion = useMemo<MacroNode | null>(() => {
    if (!currentStep) return null;
    let best: MacroNode | null = null, bw = 0;
    for (const [n, v] of Object.entries(currentStep.target_distribution.weights) as [MacroNode, number][]) if (v > bw) { bw = v; best = n; }
    return best;
  }, [currentStep]);

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
    const s = interpret(text);
    setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: FOLLOWUPS[Math.min(turn, FOLLOWUPS.length - 1)] }]);
    setSeed(s); setDistribution(distFor(s));
    setComprehension((c) => Math.min(1, c + 0.34));
    setTurn((t) => t + 1);
    setDraft("");
  }, [draft, turn]);

  const startJourney = useCallback(async (shape: TrajectoryShape) => {
    const s = seed ?? "Melancholia";
    setMessages((m) => [...m, { role: "agent", text: shape === "evolve" ? "let's drift somewhere new — follow me." : "let's go deeper into this." }]);
    const traj = await enrichWithAudio(await fetchTrajectory(s, shape));
    setTrajectory(traj); setIndex(0); setWheelFocus(false);
  }, [seed]);

  const redirect = useCallback((m: MacroNode) => {
    setSeed(m); setDistribution(distFor(m));
    setComprehension((c) => Math.min(1, c + 0.2));
    setWheelFocus(false);
    setMessages((msg) => [...msg, { role: "user", text: `take me toward ${m.toLowerCase()}` }, { role: "agent", text: `${m.toLowerCase()} it is.` }]);
  }, []);

  const go = (i: number) => setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  };
  const seek = (t: number) => { const a = audioRef.current; if (a) a.currentTime = t; };

  const convoProps = {
    messages, comprehension, seed, trajectory, index, isPlaying,
    draft, setDraft, onSubmit: submit, onDeepen: () => startJourney("deepen"),
    onEvolve: () => startJourney("evolve"), onSelectTrack: go,
  };
  const player = trajectory ? (
    <PlayerBar
      track={currentStep?.selected_track ?? null}
      isPlaying={isPlaying} currentTime={currentTime} duration={duration}
      hasPrev={index > 0} hasNext={index < steps.length - 1}
      onToggle={toggle} onPrev={() => go(index - 1)} onNext={() => go(index + 1)} onSeek={seek}
    />
  ) : null;

  return (
    <div className="relative z-10">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { if (index < steps.length - 1) setIndex(index + 1); else setIsPlaying(false); }}
      />

      {/* ===== MOBILE: living background ===== */}
      <div className="relative h-screen overflow-hidden md:hidden">
        <div className={`absolute left-1/2 top-[42%] aspect-square w-[150vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 ${wheelFocus ? "pointer-events-auto opacity-95" : "pointer-events-none opacity-30"}`}>
          <div className="lyra-breathe h-full w-full">
            <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} onSelect={wheelFocus ? redirect : undefined} />
          </div>
        </div>

        {!wheelFocus ? (
          <button onClick={() => setWheelFocus(true)} className="absolute inset-x-0 top-0 z-10 h-[30%] pt-5 text-center text-[11px] uppercase tracking-[0.15em] text-muted-2">
            tap the map
          </button>
        ) : (
          <button onClick={() => setWheelFocus(false)} className="absolute right-4 top-4 z-20 rounded-full border border-border bg-bg/50 px-3 py-1 text-xs text-fg backdrop-blur">
            close map
          </button>
        )}

        <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-bg via-bg/70 to-transparent transition-opacity duration-500 ${wheelFocus ? "opacity-0" : "opacity-100"}`} />

        <div className={`absolute inset-x-0 bottom-0 z-10 flex max-h-[82vh] flex-col transition-opacity duration-500 ${wheelFocus ? "pointer-events-none opacity-10" : "opacity-100"}`}>
          <div className="min-h-0 flex-1">
            <ConversationPanel variant="floating" {...convoProps} />
          </div>
          {player}
        </div>
      </div>

      {/* ===== DESKTOP: 50/50 split ===== */}
      <div className="hidden h-screen flex-col md:flex">
        <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden px-6 py-5">
          <section className="flex w-1/2 flex-col">
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-display text-2xl font-medium lowercase tracking-tight">lyra</span>
              <span className="text-xs text-muted-2">your emotional map</span>
            </div>
            <div className="flex-1">
              <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} onSelect={redirect} />
            </div>
          </section>
          <section className="flex w-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-bg-elev/40">
            <ConversationPanel variant="panel" {...convoProps} />
          </section>
        </main>
        {player}
      </div>
    </div>
  );
}
