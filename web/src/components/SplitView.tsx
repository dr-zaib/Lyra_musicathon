"use client";

// The app — emotion-buffer model.
//  - You pick up to 3 emotions (wheel clicks) OR type a mood (the agent reads it into
//    the same 3 slots). Emotions are a FIFO of the last 3 presses: pressing the same
//    one twice doubles its weight; a 4th press drops the oldest. The wheel shape is a
//    deterministic function of those picks — it only changes when you change picks.
//  - The playlist starts the moment you reach 3 picks (typing fills all 3 at once).
//  - Changing emotions or the mode (more like this / change mood / raise energy)
//    rebuilds the UPCOMING queue but never touches the current track — it plays out,
//    or you skip it. Mock fallback on every endpoint → the demo never dies.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";

import ConversationPanel, { type Msg } from "./ConversationPanel";
import EmotionWheel from "./EmotionWheel";
import KeyboardMock from "./KeyboardMock";
import LyricBanner from "./LyricBanner";
import PlayerBar from "./PlayerBar";
import PlaylistView from "./PlaylistView";
import Settings, { type PlaybackSettings, defaultLanguage } from "./Settings";
import { hasWebGL } from "@/lib/webgl";
import { TAXONOMY, ALL_NODES } from "@/lib/taxonomy";
import type {
  AgentTurn,
  EntryResponse,
  JourneyRequest,
  MacroNode,
  NodeDistribution,
  TrackCandidate,
  Trajectory,
  TrajectoryShape,
} from "@/lib/types";

// the 3D compass view (r3f) is client-only and behind a flag — keep it out of SSR and out
// of the default bundle so the 2.5D app is untouched when the flag is off.
const CompassScene = dynamic(() => import("./CompassScene"), { ssr: false });

type QueueItem = { track: TrackCandidate; verse: string | null; reason: string | null };

const MAX_PICKS = 3; // the shape holds at most 3 emotions (FIFO of the last 3 presses)

// A tiny silent WAV used to "unlock" the <audio> element on the first user gesture.
// Browser autoplay policies (Chrome/Safari/Firefox, all OSes) block a programmatic
// play() that isn't tied to a user gesture — and the entry track's play() runs only
// AFTER the /entry + /preview fetches, by which point the click's activation has
// expired. Playing this once inside the first gesture marks the element as
// user-activated, so every later play() (entry track, auto-advance) is allowed.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

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

// The wheel shape weights each pick by its position in the buffer (oldest/first = the
// strongest: 1, 0.62, 0.38…), so the order you pick reads as a hierarchy — the first
// mood's spike is the longest. A repeated mood stacks (double-press → bigger spike).
function freqDistribution(picks: MacroNode[]): NodeDistribution | undefined {
  if (!picks.length) return undefined;
  const w: Partial<Record<MacroNode, number>> = {};
  picks.forEach((m, i) => { w[m] = (w[m] ?? 0) + Math.pow(0.62, i); });
  return { weights: w };
}

// Map the agent's weighted read of a typed mood into MAX_PICKS discrete slots
// (largest-remainder), so text and wheel feed the exact same 3-emotion state.
function distributionToPicks(d: NodeDistribution): MacroNode[] {
  const entries = (Object.entries(d.weights) as [MacroNode, number][])
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PICKS);
  if (!entries.length) return [];
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const alloc = entries.map(([m, v]) => ({ m, ideal: (v / total) * MAX_PICKS }));
  const picks: MacroNode[] = [];
  for (const a of alloc) for (let i = 0; i < Math.floor(a.ideal); i++) picks.push(a.m);
  const byRem = [...alloc].sort((a, b) => (b.ideal % 1) - (a.ideal % 1));
  let i = 0;
  while (picks.length < MAX_PICKS && byRem.length) { picks.push(byRem[i % byRem.length].m); i++; }
  return picks.slice(0, MAX_PICKS);
}

// The 4 emotional REGIONS (3 each, balanced) — arcs of the circumplex by angle, not rigid
// x/y quadrants, so each holds exactly 3. Drive the generation-mode paradigms below.
const REGIONS: MacroNode[][] = [
  ["Melancholia", "Solitude", "Reflection"],   // withdrawn / low energy, negative
  ["Nostalgia", "Tenderness", "Hope"],         // warm / tender, positive low-mid
  ["Joy", "Awe", "Empowerment"],               // uplifted, high energy positive
  ["Defiance", "Anger", "Anxiety"],            // intense / agitated, high energy negative
];
const regionOf = (n: MacroNode) => REGIONS.findIndex((r) => r.includes(n));
const planeDist = (a: MacroNode, b: MacroNode) =>
  Math.hypot(TAXONOMY[a].x - TAXONOMY[b].x, TAXONOMY[a].y - TAXONOMY[b].y);
const nearestBy = (n: MacroNode, pool: MacroNode[]): MacroNode =>
  pool.length ? pool.reduce((best, m) => (planeDist(n, m) < planeDist(n, best) ? m : best), pool[0]) : n;

// evolution: advance each emotion to the NEXT region in a circular walk around the wheel
// (R1→R2→R3→R4→R1, the angular order), nearest node in that region. Repeated evolution thus
// keeps exploring — it tours the whole wheel instead of ping-ponging between two nodes.
const evolveNode = (n: MacroNode) => nearestBy(n, REGIONS[(regionOf(n) + 1) % REGIONS.length]);
// escalation: replace each with the nearest emotion at HIGHER arousal (energy = the y axis);
// if already at the top, keep it.
const escalateNode = (n: MacroNode) => nearestBy(n, ALL_NODES.filter((m) => m.y > TAXONOMY[n].y + 0.02).map((m) => m.name));

// The DESTINATION constellation a mode re-selects the picks into. deepen stays put (start =
// end = same constellation → similar tracks); evolve/escalate move each emotion per the rule.
function destinationPicks(shape: TrajectoryShape, picks: MacroNode[]): MacroNode[] {
  if (shape === "evolve") return picks.map(evolveNode);
  if (shape === "escalate") return picks.map(escalateNode);
  return picks; // deepen
}

export default function SplitView() {
  const sessionId = useRef<string>(crypto.randomUUID());
  const [settings, setSettings] = useState<PlaybackSettings>(() => ({ knownNew: 0.5, skipMode: "scroll", language: defaultLanguage() }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [compassMode, setCompassMode] = useState(false); // 3D compass is the default view; ?view=2d falls back to the 2.5D wheel
  const [viewResolved, setViewResolved] = useState(false); // gate the left viz until the mode is known (no 2.5D flash)
  const [isMobile, setIsMobile] = useState(false); // < md: drives WHICH compass canvas mounts (only one runs at a time)
  const [webglOK, setWebglOK] = useState(true); // optimistic; corrected on mount → falls back to the 2.5D wheel if false
  const [composing, setComposing] = useState(false); // mobile: the input is focused (keyboard up) → lift the box above the keyboard
  const [keyboardH, setKeyboardH] = useState(290); // keyboard reserve: the REAL height when measurable, else a ~290px mock rectangle (preview / no visualViewport)

  // emotions → wheel (FIFO buffer of the last 3 presses). The shape derives from this.
  const [picks, setPicks] = useState<MacroNode[]>([]);
  const picksRef = useRef<MacroNode[]>([]);
  const distribution = useMemo(() => freqDistribution(picks), [picks]);
  const comprehension = Math.min(1, picks.length / MAX_PICKS); // 0 → 3 picks (drives the pips + read bar)

  // chosen mode (steer) — a persistent toggle, lit so you see where you are
  const [mode, setMode] = useState<TrajectoryShape>("deepen");
  const modeRef = useRef<TrajectoryShape>("deepen");

  // narration feed + composer
  const [messages, setMessages] = useState<Msg[]>([]); // empty: the cold hero is the prompt, the feed fills with real turns
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [showSkipHint, setShowSkipHint] = useState(false);
  const skipHintDone = useRef(false);

  // playback queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const playedIsrcs = useRef<string[]>([]);
  const autoGenFired = useRef(false);
  const shownReason = useRef<string | null>(null);

  // audio
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioPrimed = useRef(false);
  const loadedUrl = useRef<string | null>(null); // the preview currently loaded into <audio>

  // Unlock audio on the first user gesture (see SILENT_WAV): play a silent clip while
  // we still have the gesture's activation, so the entry track — whose play() lands a
  // couple of network awaits later — is allowed to start on its own (no "press next").
  const primeAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a || audioPrimed.current) return;
    audioPrimed.current = true;
    try {
      a.muted = true;
      a.src = SILENT_WAV;
      const p = a.play();
      const done = () => { a.pause(); a.currentTime = 0; a.muted = false; a.removeAttribute("src"); };
      if (p && typeof p.then === "function") p.then(done).catch(() => { a.muted = false; });
      else done();
    } catch { a.muted = false; }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prime = () => primeAudio();
    // `once` removes each listener after it fires; cover pointer, touch and keyboard.
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("touchstart", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("touchstart", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [primeAudio]);

  const playing = queue.length > 0;
  const playingRef = useRef(false);
  const current = queue[index] ?? null;
  const currentEmotion = useMemo<MacroNode | null>(() => (current ? dominantOf(current.track.distribution) : null), [current]);

  // ambient mood aura: the room glows toward the dominant emotion as picks accumulate
  // (invisible at rest, warm when engaged). Colour from the picks, fallback to the
  // current track's mood, then a soft violet.
  const moodMacro = useMemo<MacroNode | null>(() => dominantOf(distribution) ?? currentEmotion, [distribution, currentEmotion]);
  const moodColor = moodMacro ? TAXONOMY[moodMacro].color : "#5a4d8a";
  // the compass needle points to the last emotion in the current constellation. Picking 3
  // emotions leaves it on the 3rd; choosing a mode re-selects the constellation (evolve/
  // escalate) so the dial naturally lands on the new destination, deep dive leaves it put.
  const lastPick = picks.length ? picks[picks.length - 1] : null;
  const compassHeading = lastPick;
  const compassColor = compassHeading ? TAXONOMY[compassHeading].color : moodColor;
  // the 3D compass is the default; fall back to the 2.5D wheel when it's off (?view=2d) or
  // the device has no WebGL. The mobile/desktop blocks each gate their own canvas on isMobile
  // so only the visible one ever mounts.
  const useCompass = compassMode && webglOK;

  // subtle pointer parallax on the ambient aura (a fixed layer → zero layout impact): the
  // background glow drifts opposite the cursor, so it reads as depth behind the wheel.
  const auraRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        if (auraRef.current) auraRef.current.style.transform = `translate3d(${(-nx * 28).toFixed(1)}px, ${(-ny * 28).toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  // keep refs in sync so the imperative triggers below read fresh values
  useEffect(() => { queueRef.current = queue; playingRef.current = queue.length > 0; }, [queue]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { picksRef.current = picks; }, [picks]);

  // dev/demo: ?picks=Anger,Hope,Reflection seeds the wheel SHAPE only (no playback / no
  // network) so any wheel state can be captured deterministically for screenshots + the
  // 90s video. Inert without the param.
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot mount seed from the URL */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("picks");
    if (!p) return;
    const seed = p.split(",").map((s) => s.trim()).filter(Boolean) as MacroNode[];
    if (seed.length) { picksRef.current = seed.slice(0, MAX_PICKS); setPicks(seed.slice(0, MAX_PICKS)); }
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      setCompassMode(v !== "2d" && v !== "wheel"); // 3D compass is the DEFAULT; ?view=2d forces the 2.5D wheel (WebGL fallback)
      setWebglOK(hasWebGL()); // no WebGL → 2.5D wheel everywhere
    }
    setViewResolved(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // track the md breakpoint so only the visible layout's compass canvas mounts (a hidden r3f
  // canvas would keep running its frame loop). Tailwind md = 768px → mobile is < 768.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // mobile keyboard: measure its height from the visual viewport (innerHeight − visible height)
  // so the mock-keyboard reserve matches the REAL keyboard on a device; keep the ~290px mock
  // default when nothing is up (so the composing layout is right in preview too).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const kb = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardH(kb > 120 ? kb : 290);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => { vv.removeEventListener("resize", onResize); vv.removeEventListener("scroll", onResize); };
  }, []);

  // dev/demo: ?compose=1 forces the composing (keyboard-up) layout so it can be screenshotted
  // without a real keyboard. Inert otherwise.
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot dev hook from the URL */
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compose") === "1") setComposing(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // load + play ONLY the current track. A tail rebuild (mode/pick change, refill,
  // auto-gen) replaces the queue array but keeps the current item — so we reload the
  // <audio> only when the current track's preview actually changes, never on a mere
  // queue-array change. This is what keeps the player from restarting/interrupting
  // when you switch mode or add a 4th emotion (only the upcoming queue should change).
  /* eslint-disable react-hooks/set-state-in-effect -- syncing the <audio> element */
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    const url = current.track.preview_url ?? null;
    if (url === loadedUrl.current) return; // same track still playing → don't touch it
    loadedUrl.current = url;
    if (url) {
      a.src = url; a.load();
      a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      a.removeAttribute("src"); setIsPlaying(false);
    }
    if (current.track.isrc && !playedIsrcs.current.includes(current.track.isrc)) playedIsrcs.current.push(current.track.isrc);
  }, [index, queue]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // first commit → entry track plays immediately (the journey hides behind it)
  const startPlayback = useCallback(async (forPicks: MacroNode[], message?: string) => {
    setPending(true); autoGenFired.current = false; shownReason.current = null;
    modeRef.current = "deepen"; setMode("deepen");
    const seedDist = freqDistribution(forPicks);
    const seedMood = dominantOf(seedDist);
    let data: EntryResponse;
    try {
      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, seed_mood: seedMood, seed_distribution: seedDist, session_id: sessionId.current, known_new: settings.knownNew, language: settings.language }),
      });
      if (!res.ok) throw new Error(`entry ${res.status}`);
      data = await res.json();
    } catch {
      setPending(false);
      setMessages((m) => [...m, { role: "agent", text: "i lost you for a second — say that again?" }]);
      return;
    }
    const cands = data.entry_candidates ?? [];
    if (!cands.length) { setPending(false); return; }
    playedIsrcs.current = [];
    const first = await enrichTrack(cands[0]);
    setQueue([{ track: first, verse: null, reason: null }]);
    setIndex(0); setPending(false);
    if (settings.skipMode === "scroll" && !skipHintDone.current) {
      skipHintDone.current = true; setShowSkipHint(true);
      setTimeout(() => setShowSkipHint(false), 4500);
    }
    Promise.all(cands.slice(1).map(enrichTrack)).then((rest) =>
      setQueue((q) => [...q, ...rest.map((t) => ({ track: t, verse: null, reason: null }))]),
    );
  }, [settings.knownNew, settings.language, settings.skipMode]);

  // dev/demo: ?picks=…&play=1 also kicks off playback (mock fallback) so the PLAYING
  // layout (player bar visible) can be captured for screenshots + the video. Inert otherwise.
  const seededPlay = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot dev/demo playback trigger from the URL */
  useEffect(() => {
    if (typeof window === "undefined" || seededPlay.current) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("play") !== "1") return;
    const p = sp.get("picks");
    const seed = (p ? p.split(",").map((s) => s.trim()).filter(Boolean) : []) as MacroNode[];
    seededPlay.current = true;
    startPlayback(seed.slice(0, MAX_PICKS));
  }, [startPlayback]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refill = useCallback(async () => {
    try {
      const remaining = queueRef.current.slice(indexRef.current).map((q) => q.track);
      const res = await fetch("/api/refill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remaining, exclude_isrcs: playedIsrcs.current, known_new: settings.knownNew, language: settings.language, session_id: sessionId.current }),
      });
      const more: TrackCandidate[] = await res.json();
      const enriched = await Promise.all(more.map(enrichTrack));
      setQueue((q) => [...q, ...enriched.map((t) => ({ track: t, verse: null, reason: null }))]);
    } catch {
      // best-effort
    }
  }, [settings.knownNew, settings.language]);

  // rebuild the UPCOMING queue (new mood/mode) WITHOUT touching the current track.
  // It plays out (or the user skips); the new-mood tracks queue behind it. Progressive.
  // The journey travels from `forPicks` (where you are) to `endPicks` (the destination
  // constellation: same for deep dive, a re-selected one for evolve/escalate).
  const rebuildTail = useCallback(async (forPicks: MacroNode[], shape: TrajectoryShape, endPicks: MacroNode[]) => {
    const seedDist = freqDistribution(forPicks);
    const seedMood = dominantOf(seedDist);
    if (!seedMood) return;
    let traj: Trajectory;
    try {
      const body: JourneyRequest = { seed_mood: seedMood, seed_distribution: seedDist, end_distribution: freqDistribution(endPicks), shape, exclude_isrcs: playedIsrcs.current, known_new: settings.knownNew, language: settings.language, session_id: sessionId.current };
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
    const at = indexRef.current;
    const curId = queueRef.current[at]?.track.track_id;
    const steps = traj.steps.filter((s) => s.selected_track.track_id !== curId);
    if (!steps.length) return;
    const first = steps[0];
    const firstItem: QueueItem = { track: await enrichTrack(first.selected_track), verse: first.citable_verse ?? null, reason: first.transition_reason ?? null };
    setQueue((q) => [...q.slice(0, at + 1), firstItem]); // keep [0..current], replace the tail
    if (steps.length > 1) {
      Promise.all(
        steps.slice(1).map(async (s) => ({ track: await enrichTrack(s.selected_track), verse: s.citable_verse ?? null, reason: s.transition_reason ?? null })),
      ).then((rest) => setQueue((q) => [...q, ...rest]));
    }
  }, [settings.knownNew, settings.language]);

  // a change to the emotion buffer: start (first time we hit 3) or rebuild the tail.
  // Choosing emotions resets the mode to deep dive on those emotions (start = end = picks).
  const onPicksChanged = useCallback((next: MacroNode[]) => {
    if (next.length < MAX_PICKS) return; // not ready yet — just shaping the wheel
    modeRef.current = "deepen"; setMode("deepen");
    if (!playingRef.current) startPlayback(next);
    else rebuildTail(next, "deepen", next);
  }, [startPlayback, rebuildTail]);

  // click an emotion node → push to the FIFO buffer (max 3; same mood twice = 2×)
  const pickEmotion = useCallback((m: MacroNode) => {
    const next = [...picksRef.current, m];
    if (next.length > MAX_PICKS) next.shift();
    picksRef.current = next; setPicks(next);
    onPicksChanged(next);
  }, [onPicksChanged]);

  // type a mood → the agent reads it into the same 3 slots, then start/rebuild
  const submitText = useCallback(async (text: string) => {
    setPending(true);
    setMessages((m) => [...m, { role: "user", text }]);
    let turn: AgentTurn;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId.current, language: settings.language }),
      });
      if (!res.ok) throw new Error(`agent ${res.status}`);
      turn = await res.json();
    } catch {
      setPending(false);
      setMessages((m) => [...m, { role: "agent", text: "i lost you for a second — say that again?" }]);
      return;
    }
    if (turn.message?.trim()) setMessages((m) => [...m, { role: "agent", text: turn.message }]);
    const next = distributionToPicks(turn.distribution);
    setPending(false);
    if (!next.length) return; // couldn't read a mood — leave it to the user to add more
    picksRef.current = next; setPicks(next);
    modeRef.current = "deepen"; setMode("deepen"); // typed emotions → deep dive on them
    if (!playingRef.current) startPlayback(next, text); else rebuildTail(next, "deepen", next);
  }, [settings.language, startPlayback, rebuildTail]);

  // surprise me → start from pure serendipity (no picks)
  const surprise = useCallback(() => { startPlayback([]); }, [startPlayback]);

  // steer: pick a mode → light it, RE-SELECT the emotions per the mode's paradigm (the
  // constellation morphs), and rebuild the tail as a journey from the current constellation
  // to the new one. deep dive leaves the constellation put (start = end → similar tracks).
  const chooseMode = useCallback((shape: TrajectoryShape) => {
    modeRef.current = shape; setMode(shape);
    if (!playingRef.current) return;
    autoGenFired.current = true; // an explicit choice → auto-gen must not override it
    const from = picksRef.current;
    const dest = destinationPicks(shape, from);
    rebuildTail(from, shape, dest);
    if (shape !== "deepen") { picksRef.current = dest; setPicks(dest); } // re-select the constellation to the destination
  }, [rebuildTail]);

  const next = useCallback(() => {
    setShowSkipHint(false);
    setIndex((i) => {
      const ni = Math.min(queueRef.current.length - 1, i + 1);
      if (queueRef.current.length - ni <= 2) refill();
      return ni;
    });
  }, [refill]);
  const prev = useCallback(() => { setShowSkipHint(false); setIndex((i) => Math.max(0, i - 1)); }, []);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  };
  const seek = (t: number) => { const a = audioRef.current; if (a) a.currentTime = t; };

  // Build the narrated journey shortly after playback starts — INDEPENDENT of audio playback,
  // so the cited verses are ready even if autoplay is blocked (the audio-time trigger below is
  // a backup). Skips surprise mode (no picks → no seed → nothing to build).
  useEffect(() => {
    if (!playing || autoGenFired.current || !picksRef.current.length) return;
    autoGenFired.current = true;
    const id = setTimeout(() => rebuildTail(picksRef.current, "deepen", picksRef.current), 1000);
    return () => clearTimeout(id);
  }, [playing, rebuildTail]);

  const onTimeUpdate = (t: number) => {
    setCurrentTime(t);
    // backup trigger: if the effect above somehow didn't fire, build the journey once audio runs
    if (!autoGenFired.current && playingRef.current && t >= 1.5) {
      autoGenFired.current = true;
      // build the narrated journey EARLY (not at the entry's end) so cited verses are ready
      // almost immediately — one skip past the entry track lands on a real cited line.
      rebuildTail(picksRef.current, "deepen", picksRef.current); // default journey: deep dive on the mood
    }
  };

  const reset = useCallback(() => {
    const a = audioRef.current; if (a) { a.pause(); a.removeAttribute("src"); }
    loadedUrl.current = null;
    sessionId.current = crypto.randomUUID();
    playedIsrcs.current = []; autoGenFired.current = false; shownReason.current = null; skipHintDone.current = false;
    picksRef.current = []; modeRef.current = "deepen";
    setMessages([]);
    setPicks([]); setMode("deepen"); setPending(false); setShowSkipHint(false);
    setQueue([]); setIndex(0); setPlaylistOpen(false);
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
    submitText(text);
  }, [draft, submitText]);

  const convoProps = {
    messages, comprehension,
    playing, pending, mode,
    draft, setDraft, onSubmit: submit,
    onExample: (text: string) => submitText(text),
    onSurprise: surprise,
    onMode: chooseMode,
    onReset: reset,
    canReset: playing || picks.length > 0,
    composing,
    onComposingChange: setComposing,
  };

  const player = playing ? (
    <PlayerBar
      track={current?.track ?? null}
      isPlaying={isPlaying} currentTime={currentTime} duration={duration}
      hasPrev={index > 0} hasNext={index < queue.length - 1}
      onToggle={toggle} onPrev={prev} onNext={next} onSeek={seek}
      onOpenPlaylist={() => setPlaylistOpen(true)}
    />
  ) : null;

  // pick progress — split in two on mobile: the DOTS sit under the wheel as a "loading" of the
  // 3 slots (empty dots pulse in a wave; filled = solid accent), while the STATUS TEXT moves up
  // top by the wordmark (Alberto's layout). Desktop still shows them stacked together (pips).
  const pipsDots = (
    <div className="flex justify-center gap-2">
      {Array.from({ length: MAX_PICKS }).map((_, i) => {
        const filled = i < picks.length;
        return <span key={i} className={`h-2.5 w-2.5 rounded-full ${filled ? "bg-accent" : "bg-bg-elev-2 lyra-pip-load"}`} style={filled ? undefined : { animationDelay: `${i * 0.18}s` }} />;
      })}
    </div>
  );
  const pickStatusText = picks.length === 0 ? "tap 3 · or just the same one" : picks.length < MAX_PICKS ? `tap ${MAX_PICKS - picks.length} more to play` : "playing";
  const pips = (
    <div className="flex flex-col items-center gap-2">
      {pipsDots}
      <span className="text-sm text-muted-2">{pickStatusText}</span>
    </div>
  );

  const settingsBtn = (
    <button onClick={() => setSettingsOpen(true)} aria-label="settings" title="settings" className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-muted transition hover:bg-bg-elev hover:text-fg">⚙</button>
  );

  // a dimmed player skeleton shown (desktop) before anything plays — so the reserved bottom
  // strip reads as "the player appears here", not empty wasted space (Spotify-style idle bar).
  const playerPlaceholder = (
    <div aria-hidden className="border-t border-border bg-bg-elev/35 backdrop-blur-sm">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4">
        <div className="flex items-center gap-3 opacity-50">
          <span className="h-14 w-14 shrink-0 rounded-md bg-bg-elev-2" />
          <div className="space-y-1.5">
            <span className="block h-2.5 w-28 rounded-full bg-bg-elev-2" />
            <span className="block h-2 w-20 rounded-full bg-bg-elev-2" />
          </div>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-base text-muted-2 opacity-50">▶</span>
        <span />
      </div>
    </div>
  );

  return (
    <div className="relative z-10">
      {/* ambient mood aura — a fixed room glow that blooms in the dominant emotion's
          colour as you engage; invisible at rest. Sits behind everything (z-0). */}
      <div
        ref={auraRef}
        aria-hidden
        className="lyra-aura pointer-events-none fixed -inset-16 z-0"
        style={{
          background: `radial-gradient(70% 55% at 50% 42%, ${moodColor}, transparent 68%)`,
          opacity: Math.round(comprehension * 22) / 100,
          willChange: "transform",
        }}
      />
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { if (!queue.length) return; if (index < queue.length - 1) next(); else setIsPlaying(false); }}
      />

      {settingsOpen && <Settings settings={settings} setSettings={setSettings} onClose={() => setSettingsOpen(false)} />}
      {playlistOpen && playing && (
        <PlaylistView items={queue} index={index} onJump={(i) => { setIndex(i); setPlaylistOpen(false); }} onClose={() => setPlaylistOpen(false)} />
      )}

      {/* ===== MOBILE — compass-first, a clean flex column (no absolute panel → no clipping).
              header · compass hero · pips · conversation · player. Height tracks the visual
              viewport so the input rides above the keyboard. While composing (keyboard up) the
              hero takes the room and everything but the wheel + input is stripped away. ===== */}
      <div className="relative flex h-[100dvh] flex-col overflow-hidden md:hidden">
        {/* header — wordmark + the two guidance lines (accent: they explain the app). This whole
            top block (header + wheel + dots) stays PUT; only the area below it reacts to the
            keyboard. Padding pulls the wordmark/settings off the screen edges (+ notch). */}
        <header className="relative z-30 shrink-0 px-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <span className="font-display text-2xl font-medium lowercase leading-none tracking-tight">lyra<span className="text-accent">.</span></span>
            {settingsBtn}
          </div>
          <div className="mt-2.5 min-h-5 space-y-1.5 text-center">
            {playing ? (
              <LyricBanner verse={current?.verse ?? null} mock={false} />
            ) : (
              <>
                {/* the welcome title fades UP and out once you start (a pick) — a soft exit, not a pop */}
                <AnimatePresence>
                  {picks.length === 0 && (
                    <motion.p
                      key="title"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="font-display text-[17px] lowercase leading-tight text-accent"
                    >
                      tell lyra your mood, get a playlist.
                    </motion.p>
                  )}
                </AnimatePresence>
                <p className="text-[13px] font-medium text-accent/75">{pickStatusText}</p>
                {/* the 3 slots sit right under the guidance text (the dots ARE "tap 3"); empty
                    ones pulse like a loader until all three are filled */}
                <div className="pt-0.5">{pipsDots}</div>
              </>
            )}
          </div>
        </header>

        {/* the wheel — FIXED size, identical in every state, so the top never jumps or resizes
            (and never enlarges when the keyboard opens). Also the swipe/scroll skip surface. */}
        <div
          className={`relative z-10 shrink-0 transition-[height] duration-500 ${playing ? "h-[46vh]" : "h-[42vh]"}`}
          onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        >
          {!viewResolved ? null : useCompass && isMobile ? (
            <CompassScene portrait dominant={compassHeading} moodColor={compassColor} comprehension={comprehension} trail={picks} onSelect={pickEmotion} />
          ) : (
            <div className="absolute left-1/2 top-1/2 aspect-square w-[118vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2">
              <div className="lyra-breathe h-full w-full">
                <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape onSelect={pickEmotion} />
              </div>
            </div>
          )}
        </div>

        {/* below the wheel: cold → conversation fills the rest; composing → the input lifts into
            the saved middle space and a MOCK iOS KEYBOARD (real height when measurable) takes the
            bottom. Only this lower region moves — the wheel/header above stay put. */}
        {composing ? (
          <>
            <div className="min-h-0 flex-1" />
            <div className="relative z-10 shrink-0"><ConversationPanel variant="floating" {...convoProps} /></div>
            <div className="shrink-0" style={{ height: keyboardH }}><KeyboardMock /></div>
          </>
        ) : (
          <div className="relative z-10 min-h-0 flex-1"><ConversationPanel variant="floating" {...convoProps} /></div>
        )}

        {showSkipHint && !composing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
            <span className="animate-fade-up rounded-full border border-white/10 bg-bg-elev/80 px-3 py-1.5 text-[11px] text-muted backdrop-blur-sm">
              swipe up for the next ↑
            </span>
          </div>
        )}
        {player && !composing && <div className="relative z-20 shrink-0">{player}</div>}
      </div>

      {/* ===== DESKTOP ===== */}
      <div className="relative hidden h-screen flex-col md:flex">
        {/* page header — title on the left, settings pinned top-right of the whole page */}
        <header className="flex shrink-0 items-baseline gap-3 pl-7 pr-16 pt-5">
          <span className="font-display text-2xl font-medium lowercase tracking-tight">lyra<span className="text-accent">.</span></span>
          <div className="ml-auto">{settingsBtn}</div>
        </header>
        {/* main RESERVES the player's strip at the bottom at all times (pb-[104px]), so its
            content area is a constant height — the wheel is sized by that area and never
            resizes when the player appears/disappears. The player is an absolute overlay
            that sits over the reserved strip (so it never pushes or covers content). */}
        <main className="flex w-full flex-1 items-stretch gap-6 overflow-hidden pl-7 pr-16 pb-[104px] pt-2">
          {/* LEFT — the wheel. Sized ONLY by the column height (max-h below): it does NOT
              depend on the margins, panel width, or the player. To resize it, change ONE
              number → max-h-[…]. The pips get their own row beneath it (clear of the ring). */}
          <section className="flex flex-1 flex-col" onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {/* the cited lyric, above the wheel */}
            <div className="flex shrink-0 justify-center px-6 pt-1"><div className="w-full max-w-[440px]"><LyricBanner verse={current?.verse ?? null} mock={false} /></div></div>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {!viewResolved ? null : useCompass && !isMobile ? (
                <div className="h-full w-full"><CompassScene dominant={compassHeading} moodColor={compassColor} comprehension={comprehension} trail={picks} onSelect={pickEmotion} /></div>
              ) : (
                <div className="relative aspect-square h-full max-h-[900px]">
                  <EmotionWheel distribution={distribution?.weights} comprehension={comprehension} currentEmotion={currentEmotion} shape big onSelect={pickEmotion} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 justify-center pt-3 pb-1">{pips}</div>
          </section>
          {/* RIGHT — the chat panel. Fixed width, independent of the wheel. To resize it,
              change ONE number → w-[…]. */}
          <section className="mb-2 mt-2 flex w-[440px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg-elev/40">
            <ConversationPanel variant="panel" {...convoProps} />
          </section>
        </main>
        {/* bottom strip — the real player when playing, a dimmed skeleton otherwise */}
        {player
          ? <div className="absolute inset-x-0 bottom-0 z-30">{player}</div>
          : <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">{playerPlaceholder}</div>}
      </div>
    </div>
  );
}
