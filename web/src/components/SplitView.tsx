"use client";

// The app — playback-flow model ("no loading screen, ever").
//  - feeling in → POST /api/entry → the first entry track plays IMMEDIATELY (the ~14s
//    journey generation is hidden behind it). The wheel shows the intent distribution.
//  - skip (scroll/swipe by default, or ← → arrows via settings) walks the entry list;
//    /api/refill tops it up.
//  - pick a shape (deepen/evolve/escalate) → POST /api/journey → queued behind the
//    current track. If you don't pick, it auto-generates near the entry track's end.
//  - the agent narrates each step (transition_reason) into the feed; the cited verse
//    rides in the player. Mock fallback on every endpoint → the demo never dies.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConversationPanel, { type Msg } from "./ConversationPanel";
import EmotionWheel from "./EmotionWheel";
import PlayerBar from "./PlayerBar";
import Settings, { type PlaybackSettings } from "./Settings";
import type {
  EntryResponse,
  JourneyRequest,
  MacroNode,
  NodeDistribution,
  TrackCandidate,
  Trajectory,
  TrajectoryShape,
} from "@/lib/types";

type QueueItem = { track: TrackCandidate; verse: string | null; reason: string | null };

// Musixmatch gives no audio → enrich each track with a 30s preview client-side.
// ISRC-first (Deezer exact match), text fallback — the route handles the strategy.
async function enrichTrack(t: TrackCandidate): Promise<TrackCandidate> {
  try {
    const q = new URLSearchParams({ artist: t.artist, title: t.title });
    if (t.isrc) q.set("isrc", t.isrc);
    const r = await fetch(`/api/preview?${q.toString()}`);
    const d = await r.json();
    return { ...t, preview_url: d.preview_url ?? null, artwork_url: d.artwork_url ?? null };
  } catch {
    return t;
  }
}

function dominantOf(d?: NodeDistribution): MacroNode | null {
  if (!d) return null;
  let best: MacroNode | null = null, bw = -1;
  for (const [k, v] of Object.entries(d.weights) as [MacroNode, number][]) if ((v ?? 0) > bw) { bw = v ?? 0; best = k; }
  return best;
}

export default function SplitView() {
  const sessionId = useRef<string>(crypto.randomUUID());
  const [settings, setSettings] = useState<PlaybackSettings>({ knownNew: 0.5, skipMode: "scroll" });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // intent → wheel
  const [distribution, setDistribution] = useState<NodeDistribution | undefined>(undefined);
  const [comprehension, setComprehension] = useState(0);
  const seed = useMemo(() => dominantOf(distribution), [distribution]);

  // narration feed + composer
  const [messages, setMessages] = useState<Msg[]>([{ role: "agent", text: "describe your mood — in your own words." }]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  // playback queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [shapeChosen, setShapeChosen] = useState(false);
  const playedIsrcs = useRef<string[]>([]);
  const autoGenFired = useRef(false);
  const shownReason = useRef<string | null>(null);

  // audio
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playing = queue.length > 0;
  const current = queue[index] ?? null;
  const currentEmotion = useMemo<MacroNode | null>(() => (current ? dominantOf(current.track.distribution) : null), [current]);

  // play the current track + narrate it into the feed
  /* eslint-disable react-hooks/set-state-in-effect -- syncing the <audio> element + narration */
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    const url = current.track.preview_url;
    if (url) {
      a.src = url; a.load();
      a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      setIsPlaying(false);
    }
    if (current.track.isrc && !playedIsrcs.current.includes(current.track.isrc)) playedIsrcs.current.push(current.track.isrc);
    if (current.reason && shownReason.current !== current.reason) {
      shownReason.current = current.reason;
      setMessages((m) => [...m, { role: "agent", text: current.reason! }]);
    }
  }, [index, queue]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // feeling in → entry track plays immediately
  const startEntry = useCallback(async (message?: string) => {
    setPending(true); setShapeChosen(false); autoGenFired.current = false; shownReason.current = null;
    if (message) setMessages((m) => [...m, { role: "user", text: message }]);
    let data: EntryResponse;
    try {
      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId.current, known_new: settings.knownNew }),
      });
      if (!res.ok) throw new Error(`entry ${res.status}`);
      data = await res.json();
    } catch {
      setPending(false);
      setMessages((m) => [...m, { role: "agent", text: "i lost you for a second — say that again?" }]);
      return;
    }
    setComprehension(data.confidence); setDistribution(data.distribution);
    const cands = data.entry_candidates ?? [];
    if (!cands.length) { setPending(false); return; }
    playedIsrcs.current = [];
    const first = await enrichTrack(cands[0]);
    setQueue([{ track: first, verse: null, reason: null }]);
    setIndex(0); setPending(false);
    // enrich the rest behind the scenes
    Promise.all(cands.slice(1).map(enrichTrack)).then((rest) =>
      setQueue((q) => [...q, ...rest.map((t) => ({ track: t, verse: null, reason: null }))]),
    );
  }, [settings.knownNew]);

  const refill = useCallback(async () => {
    try {
      const remaining = queue.slice(index).map((q) => q.track);
      const res = await fetch("/api/refill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remaining, exclude_isrcs: playedIsrcs.current, known_new: settings.knownNew, session_id: sessionId.current }),
      });
      const more: TrackCandidate[] = await res.json();
      const enriched = await Promise.all(more.map(enrichTrack));
      setQueue((q) => [...q, ...enriched.map((t) => ({ track: t, verse: null, reason: null }))]);
    } catch {
      // best-effort
    }
  }, [queue, index, settings.knownNew]);

  // pick a shape → journey queued behind the current track (entry track = its head)
  const chooseShape = useCallback(async (shape: TrajectoryShape) => {
    if (!seed) return;
    setShapeChosen(true);
    let traj: Trajectory;
    try {
      const body: JourneyRequest = { seed_mood: seed, shape, exclude_isrcs: playedIsrcs.current, known_new: settings.knownNew, session_id: sessionId.current };
      const res = await fetch("/api/journey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`journey ${res.status}`);
      traj = await res.json();
    } catch {
      return;
    }
    const items: QueueItem[] = await Promise.all(
      traj.steps.map(async (s) => ({ track: await enrichTrack(s.selected_track), verse: s.citable_verse ?? null, reason: s.transition_reason ?? null })),
    );
    setQueue((q) => {
      const head = q.slice(0, index + 1);
      const curId = q[index]?.track.track_id;
      return [...head, ...items.filter((it) => it.track.track_id !== curId)];
    });
  }, [seed, index, settings.knownNew]);

  const next = useCallback(() => {
    setIndex((i) => {
      const ni = Math.min(queue.length - 1, i + 1);
      if (!shapeChosen && queue.length - ni <= 2) refill();
      return ni;
    });
  }, [queue.length, shapeChosen, refill]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  };
  const seek = (t: number) => { const a = audioRef.current; if (a) a.currentTime = t; };

  const onTimeUpdate = (t: number) => {
    setCurrentTime(t);
    // hide the ~14s: if no shape chosen, auto-generate before the entry track ends
    if (!shapeChosen && !autoGenFired.current && playing && duration > 0 && duration - t <= 8) {
      autoGenFired.current = true;
      chooseShape("deepen");
    }
  };

  const reset = useCallback(() => {
    const a = audioRef.current; if (a) { a.pause(); a.removeAttribute("src"); }
    sessionId.current = crypto.randomUUID();
    playedIsrcs.current = []; autoGenFired.current = false; shownReason.current = null;
    setMessages([{ role: "agent", text: "describe your mood — in your own words." }]);
    setComprehension(0); setDistribution(undefined); setPending(false);
    setQueue([]); setIndex(0); setShapeChosen(false);
    setIsPlaying(false); setCurrentTime(0); setDuration(0); setDraft("");
  }, []);

  // skip via vertical scroll / swipe (default mode)
  const wheelAcc = useRef(0);
  const touchY = useRef<number | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    if (settings.skipMode !== "scroll" || !playing) return;
    wheelAcc.current += e.deltaY;
    if (wheelAcc.current > 120) { wheelAcc.current = 0; next(); }
    else if (wheelAcc.current < -120) { wheelAcc.current = 0; prev(); }
  };
  const onTouchStart = (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (settings.skipMode !== "scroll" || !playing || touchY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (dy < -50) next(); else if (dy > 50) prev();
    touchY.current = null;
  };

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    startEntry(text);
  }, [draft, startEntry]);

  const convoProps = {
    messages, comprehension, playing, pending,
    draft, setDraft, onSubmit: submit,
    onSurprise: () => startEntry(),
    onDeepen: () => chooseShape("deepen"),
    onEvolve: () => chooseShape("evolve"),
    onEscalate: () => chooseShape("escalate"),
  };
  const player = playing ? (
    <PlayerBar
      track={current?.track ?? null}
      verse={current?.verse ?? null}
      isPlaying={isPlaying} currentTime={currentTime} duration={duration}
      hasPrev={index > 0} hasNext={index < queue.length - 1}
      onToggle={toggle} onPrev={prev} onNext={next} onSeek={seek}
    />
  ) : null;

  const controls = (canReset: boolean) => (
    <div className="flex items-center gap-1">
      <button onClick={() => setSettingsOpen(true)} aria-label="settings" title="settings" className="text-base text-muted-2 transition hover:text-fg">⚙</button>
      {canReset && (
        <button onClick={reset} aria-label="start over" title="start over" className="text-base text-muted-2 transition hover:text-fg">↺</button>
      )}
    </div>
  );

  return (
    <div className="relative z-10">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { if (index < queue.length - 1) next(); else setIsPlaying(false); }}
      />

      {settingsOpen && <Settings settings={settings} setSettings={setSettings} onClose={() => setSettingsOpen(false)} />}

      {/* ===== MOBILE ===== */}
      <div className="relative flex h-screen flex-col overflow-hidden md:hidden">
        <div className="absolute right-3 top-3 z-30">{controls(playing || comprehension > 0)}</div>
        {/* the wheel builds its shape in the background — also the scroll/swipe skip surface */}
        <div
          className="pointer-events-auto absolute left-1/2 top-[36%] aspect-square w-[150vw] max-w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-50"
          onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        >
          <div className="lyra-breathe h-full w-full">
            <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg via-bg/85 to-transparent" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="flex items-baseline gap-2 px-4 pt-4">
            <span className="font-display text-xl font-medium lowercase tracking-tight">lyra</span>
            <span className="text-[11px] text-muted-2">the lyrics layer for your player</span>
          </div>
          <div className="min-h-0 flex-1">
            <ConversationPanel variant="floating" {...convoProps} />
          </div>
        </div>

        {player && <div className="relative z-20 shrink-0">{player}</div>}
      </div>

      {/* ===== DESKTOP ===== */}
      <div className="hidden h-screen flex-col md:flex">
        <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden px-6 py-5">
          <section className="flex w-1/2 flex-col" onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-display text-2xl font-medium lowercase tracking-tight">lyra</span>
              <span className="text-xs text-muted-2">the lyrics layer for your player</span>
              <div className="ml-auto">{controls(playing || comprehension > 0)}</div>
            </div>
            <div className="flex-1">
              <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape onSelect={(m) => startEntry(`take me toward ${m.toLowerCase()}`)} />
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
