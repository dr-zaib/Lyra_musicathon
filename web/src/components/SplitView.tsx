"use client";

// The app, responsive.
//  - Mobile (base): the wheel is a non-interactive background that builds its
//    "emotional signature"; the conversation is the surface; the player is fixed.
//  - Desktop (md:+): the 50/50 split — wheel left, agent right.
// One conversational seam: every user action is an "agent turn" (POST /api/agent →
// { message, confidence, distribution, shuffle, trajectory }). The route proxies the
// real backend and falls back to a local mock agent, so the demo never dies.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConversationPanel, { type Msg } from "./ConversationPanel";
import EmotionWheel from "./EmotionWheel";
import PlayerBar from "./PlayerBar";
import type { AgentTurn, AgentTurnRequest, MacroNode, NodeDistribution, Trajectory, TrajectoryShape } from "@/lib/types";

// Musixmatch gives no audio → enrich each track with an iTunes 30s preview client-side.
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
  const [draft, setDraft] = useState("");

  const [pending, setPending] = useState(false);
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionId = useRef<string>(crypto.randomUUID());

  const steps = trajectory?.steps ?? [];
  const currentStep = steps[index] ?? null;
  const canStart = !!distribution && Object.keys(distribution.weights).length > 0;

  const currentEmotion = useMemo<MacroNode | null>(() => {
    if (!currentStep) return null;
    let best: MacroNode | null = null, bw = 0;
    for (const [n, v] of Object.entries(currentStep.target_distribution.weights) as [MacroNode, number][]) if (v > bw) { bw = v; best = n; }
    return best;
  }, [currentStep]);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing the <audio> element (an external system) */
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !trajectory) return;
    const url = steps[index]?.selected_track.preview_url;
    if (!url) { setIsPlaying(false); return; }
    a.src = url; a.load();
    a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [index, trajectory]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // One conversational turn → the agent. Renders the reply, drives the wheel
  // (distribution) + comprehension (confidence), and starts the journey if the agent
  // decided to emit one.
  const sendTurn = useCallback(async (req: Omit<AgentTurnRequest, "session_id">, userText?: string) => {
    if (userText) setMessages((m) => [...m, { role: "user", text: userText }]);
    setPending(true);
    let turn: AgentTurn;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...req, session_id: sessionId.current }),
      });
      if (!res.ok) throw new Error(`agent ${res.status}`);
      turn = await res.json();
    } catch {
      setPending(false);
      setMessages((m) => [...m, { role: "agent", text: "i lost you for a second — say that again?" }]);
      return;
    }
    setPending(false);
    setMessages((m) => [...m, { role: "agent", text: turn.message }]);
    setComprehension(turn.confidence);
    setDistribution(turn.distribution);
    if (turn.trajectory) {
      const traj = await enrichWithAudio(turn.trajectory);
      setTrajectory(traj); setIndex(0);
    }
  }, []);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    sendTurn({ message: text }, text);
  }, [draft, sendTurn]);

  const startJourney = useCallback((shape: TrajectoryShape) => { sendTurn({ shape }); }, [sendTurn]);
  const redirect = useCallback((m: MacroNode) => { sendTurn({ seed_mood: m }, `take me toward ${m.toLowerCase()}`); }, [sendTurn]);

  const reset = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); }
    sessionId.current = crypto.randomUUID();
    setMessages([{ role: "agent", text: "describe your mood — in your own words." }]);
    setComprehension(0); setDistribution(undefined); setPending(false);
    setTrajectory(null); setIndex(0); setIsPlaying(false); setCurrentTime(0); setDuration(0); setDraft("");
  }, []);

  const go = (i: number) => setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  };
  const seek = (t: number) => { const a = audioRef.current; if (a) a.currentTime = t; };

  const convoProps = {
    messages, comprehension, canStart, trajectory, pending,
    draft, setDraft, onSubmit: submit, onDeepen: () => startJourney("deepen"),
    onEvolve: () => startJourney("evolve"), onEscalate: () => startJourney("escalate"),
  };
  const player = trajectory ? (
    <PlayerBar
      track={currentStep?.selected_track ?? null}
      verse={currentStep?.citable_verse ?? null}
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
        {(canStart || trajectory) && (
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
            <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape />
          </div>
        </div>
        {/* readability scrim under the chat */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg via-bg/85 to-transparent" />

        {/* chat is the primary surface */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="flex items-baseline gap-2 px-4 pt-4">
            <span className="font-display text-xl font-medium lowercase tracking-tight">lyra</span>
            <span className="text-[11px] text-muted-2">the lyrics layer for your player</span>
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
              <span className="text-xs text-muted-2">the lyrics layer for your player</span>
              {(canStart || trajectory) && (
                <button onClick={reset} aria-label="start over" title="start over" className="ml-auto text-base text-muted-2 transition hover:text-fg">↺</button>
              )}
            </div>
            <div className="flex-1">
              <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape onSelect={redirect} />
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
