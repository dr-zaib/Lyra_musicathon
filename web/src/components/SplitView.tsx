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
  "tell me more — what's underneath it?",
  "is it heavy and still, or restless?",
  "clear — i can feel where you are now.",
];

// safety: distress is never a "mood to soundtrack". keyword stub here; the real
// agent (LLM) owns the robust version + a dedicated tool.
const CRISIS = /(kill myself|killing myself|end my life|end it all|want to die|wanna die|don'?t want to (live|be here|exist)|no reason to live|suicid|self.?harm|hurt myself|harm myself)/i;
const CRISIS_REPLY =
  "i'm really glad you told me — and i'm not going to just hand you a playlist for this. you deserve to talk to someone who can help: please reach out to someone you trust, or a free, confidential helpline in your country (you can find one at findahelpline.com). i'm here.";
const AFFIRM = /^\s*(yes|yeah|yep|yup|exactly|right|correct|that'?s it|true|sure|definitely)\b/i;
// the user signalling they're done describing → go straight to play
const READY = /^\s*(ok(ay)?|that'?s (it|enough|all)|enough|i'?m (good|done|ready|fine|all set|ok)|all set|let'?s go|just play|play( it| something)?|go ahead|done|ready)\s*$/i;

// Moods accumulate across the conversation: a new mood adds its spike (plus a little
// to its neighbours, so a single mood reads as a rhombus) while the earlier ones decay
// but don't vanish — the shape adapts instead of jumping.
function bump(w: Partial<Record<MacroNode, number>>, m: MacroNode, amount: number) {
  const i = ORDER.indexOf(m);
  const prev = ORDER[(i + ORDER.length - 1) % ORDER.length];
  const next = ORDER[(i + 1) % ORDER.length];
  w[m] = (w[m] ?? 0) + amount;
  w[prev] = (w[prev] ?? 0) + amount * 0.25;
  w[next] = (w[next] ?? 0) + amount * 0.25;
}
function accumulate(prev: NodeDistribution | undefined, m: MacroNode): NodeDistribution {
  const w: Partial<Record<MacroNode, number>> = {};
  if (prev) for (const [k, v] of Object.entries(prev.weights)) w[k as MacroNode] = (v ?? 0) * 0.55;
  bump(w, m, 1);
  return { weights: w };
}
function interpretMaybe(text: string): { mood: MacroNode; confident: boolean } | null {
  const v = text.toLowerCase();
  for (const [re, m] of KEYWORDS) if (re.test(v)) return { mood: m, confident: true };
  if (v.trim().split(/\s+/).length <= 2) return null; // too little to read
  return { mood: "Reflection", confident: false };    // a guess, to be confirmed
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

  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoStarted = useRef(false);

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
    setDraft("");

    // safety: never soundtrack distress — respond with care, don't proceed.
    if (CRISIS.test(text)) {
      setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: CRISIS_REPLY }]);
      return;
    }

    // done describing → go straight to play (auto-starts at full understanding)
    if (READY.test(text)) {
      if (seed) {
        setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: "got it — let's play." }]);
        setComprehension(1);
      } else {
        setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: "give me even one word for how you feel — or tap “i can't describe my mood” and i'll lead." }]);
      }
      setTurn((t) => t + 1);
      return;
    }

    // confirming a previous low-confidence guess
    if (seed && AFFIRM.test(text)) {
      setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: "good — i've got you now." }]);
      setComprehension((c) => Math.min(1, c + 0.4));
      setTurn((t) => t + 1);
      return;
    }

    const guess = interpretMaybe(text);
    if (!guess) {
      setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: "i can't quite place that yet — tell me what it feels like, or a moment it brings up." }]);
      return;
    }

    setSeed(guess.mood); setDistribution((prev) => accumulate(prev, guess.mood));
    if (guess.confident) {
      setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: FOLLOWUPS[Math.min(turn, FOLLOWUPS.length - 1)] }]);
      setComprehension((c) => Math.min(1, c + 0.34));
    } else {
      // guide: make the guess explicit and ask, instead of declaring it done
      setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: `it reads to me like ${guess.mood.toLowerCase()} — does that land, or am i off?` }]);
      setComprehension((c) => Math.min(0.5, c + 0.18));
    }
    setTurn((t) => t + 1);
  }, [draft, turn, seed]);

  const startJourney = useCallback(async (shape: TrajectoryShape) => {
    const s = seed ?? "Melancholia";
    setMessages((m) => [...m, { role: "agent", text: shape === "evolve" ? "let's drift somewhere new — follow me." : "let's go deeper into this." }]);
    const traj = await enrichWithAudio(await fetchTrajectory(s, shape));
    setTrajectory(traj); setIndex(0);
  }, [seed]);

  // Full understanding → don't make the user hunt for a button: begin the journey
  // on its own (once). Below 100%, the primary "play" button is always there.
  useEffect(() => {
    if (comprehension >= 1 && seed && !trajectory && !autoStarted.current) {
      autoStarted.current = true;
      const t = setTimeout(() => startJourney("deepen"), 900);
      return () => clearTimeout(t);
    }
  }, [comprehension, seed, trajectory, startJourney]);

  const redirect = useCallback((m: MacroNode) => {
    setSeed(m); setDistribution((prev) => accumulate(prev, m));
    setComprehension((c) => Math.min(1, c + 0.2));
    setMessages((msg) => [...msg, { role: "user", text: `take me toward ${m.toLowerCase()}` }, { role: "agent", text: `${m.toLowerCase()} it is.` }]);
  }, []);

  const reset = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); }
    autoStarted.current = false;
    setMessages([{ role: "agent", text: "describe your mood — in your own words." }]);
    setComprehension(0); setDistribution(undefined); setSeed(null); setTurn(0);
    setTrajectory(null); setIndex(0); setIsPlaying(false); setCurrentTime(0); setDuration(0);
    setDraft("");
  }, []);

  const go = (i: number) => setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  };
  const seek = (t: number) => { const a = audioRef.current; if (a) a.currentTime = t; };

  const convoProps = {
    messages, comprehension, seed, trajectory,
    draft, setDraft, onSubmit: submit, onDeepen: () => startJourney("deepen"),
    onEvolve: () => startJourney("evolve"),
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

      {/* ===== MOBILE: chat-driven; the wheel builds its shape in the background; fixed player ===== */}
      <div className="relative flex h-screen flex-col overflow-hidden md:hidden">
        {(seed || trajectory) && (
          <button
            onClick={reset} aria-label="start over" title="start over"
            className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full text-base text-muted-2 transition hover:bg-white/5 hover:text-fg"
          >
            ↺
          </button>
        )}
        {/* the emotional signature builds itself as the conversation sharpens — not interactive */}
        <div className="pointer-events-none absolute left-1/2 top-[36%] aspect-square w-[150vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-50">
          <div className="lyra-breathe h-full w-full">
            <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape labelsActiveOnly />
          </div>
        </div>
        {/* readability scrim under the chat */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg via-bg/85 to-transparent" />

        {/* chat is the primary surface */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-4">
            <span className="font-display text-xl font-medium lowercase tracking-tight">lyra</span>
          </div>
          <div className="min-h-0 flex-1">
            <ConversationPanel variant="floating" {...convoProps} />
          </div>
        </div>

        {/* fixed, Spotify-like player */}
        {player && <div className="relative z-20 shrink-0">{player}</div>}
      </div>

      {/* ===== DESKTOP: 50/50 split ===== */}
      <div className="hidden h-screen flex-col md:flex">
        <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden px-6 py-5">
          <section className="flex w-1/2 flex-col">
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-display text-2xl font-medium lowercase tracking-tight">lyra</span>
              <span className="text-xs text-muted-2">your emotional map</span>
              {(seed || trajectory) && (
                <button onClick={reset} aria-label="start over" title="start over" className="ml-auto text-base text-muted-2 transition hover:text-fg">↺</button>
              )}
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
