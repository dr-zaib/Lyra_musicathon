// Mock conversational agent — the fallback when the real backend is down, so the
// demo never dies. Implements the decided "agent turn" contract: one message in →
// { message, confidence, distribution, shuffle, trajectory? } out. Reproduces intent
// reading, mood accumulation (first mood strongest), confidence, safety + confirm,
// and emits a trajectory when the user is ready (confidence full, a "play" signal, or
// a shape/seed shortcut). Session state is in-memory — dev / single-process only; the
// real backend owns durable session memory.

import { getMockTrajectory } from "./mockData";
import type {
  AgentTurn,
  AgentTurnRequest,
  MacroNode,
  Trajectory,
  TrajectoryShape,
} from "./types";

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

// safety: distress is never a "mood to soundtrack". The real agent owns the robust
// version (system prompt + dedicated tool); this keyword stub just never proceeds.
const CRISIS = /(kill myself|killing myself|end my life|end it all|want to die|wanna die|don'?t want to (live|be here|exist)|no reason to live|suicid|self.?harm|hurt myself|harm myself)/i;
const CRISIS_REPLY =
  "i'm really glad you told me — and i'm not going to just hand you a playlist for this. you deserve to talk to someone who can help: please reach out to someone you trust, or a free, confidential helpline in your country (you can find one at findahelpline.com). i'm here.";
const AFFIRM = /^\s*(yes|yeah|yep|yup|exactly|right|correct|that'?s it|true|sure|definitely)\b/i;
const READY = /^\s*(ok(ay)?|that'?s (it|enough|all)|enough|i'?m (good|done|ready|fine|all set|ok)|all set|let'?s go|just play|play( it| something)?|go ahead|done|ready)\s*$/i;

function interpretMaybe(text: string): { mood: MacroNode; confident: boolean } | null {
  const v = text.toLowerCase();
  for (const [re, m] of KEYWORDS) if (re.test(v)) return { mood: m, confident: true };
  if (v.trim().split(/\s+/).length <= 2) return null; // too little to read
  return { mood: "Reflection", confident: false };    // a guess, to be confirmed
}

type Weights = Partial<Record<MacroNode, number>>;

// First mood mentioned stays the strongest (1), the second weaker (0.62), the third
// weaker still (0.38); earlier ones don't decay. Re-mentioning reinforces.
function accumulate(w0: Weights, m: MacroNode): Weights {
  const w: Weights = { ...w0 };
  if (w[m] != null) w[m] = Math.min(1, (w[m] ?? 0) + 0.15);
  else {
    const rank = Object.keys(w).length;
    w[m] = Math.round(Math.pow(0.62, rank) * 100) / 100;
  }
  return w;
}

type State = { weights: Weights; confidence: number; turn: number };
const SESSIONS = new Map<string, State>();

// Shape the running state into a contract turn. `shuffle` is an INDEPENDENT field
// (the neutral/serendipity remainder), NOT derived from confidence — the real agent
// sets it on its own. Here it's the leftover intent mass: more/stronger moods → less
// serendipity. Invariant kept: sum(distribution.weights) + shuffle === 1.
function toTurn(s: State, message: string, trajectory: Trajectory | null = null): AgentTurn {
  const mass = Object.values(s.weights).reduce((a, b) => a + (b ?? 0), 0); // total intent mass
  const claimed = mass === 0 ? 0 : Math.min(0.9, mass / (mass + 0.5));
  const shuffle = Math.round((1 - claimed) * 100) / 100;
  const scale = mass === 0 ? 0 : claimed / mass;
  const weights: Weights = {};
  for (const [k, v] of Object.entries(s.weights) as [MacroNode, number][]) {
    weights[k] = Math.round((v ?? 0) * scale * 100) / 100;
  }
  return {
    message,
    confidence: Math.round(s.confidence * 100) / 100,
    distribution: { weights },
    shuffle,
    trajectory,
  };
}

export function mockAgentTurn(req: AgentTurnRequest): AgentTurn {
  const sid = req.session_id ?? "default";
  const s: State = SESSIONS.get(sid) ?? { weights: {}, confidence: 0, turn: 0 };

  // click-a-node / play-button shortcut → request a journey now
  if (req.shape || req.seed_mood) {
    if (req.seed_mood) { s.weights = accumulate(s.weights, req.seed_mood); s.confidence = Math.min(1, s.confidence + 0.2); }
    const sh: TrajectoryShape = req.shape ?? "deepen";
    SESSIONS.set(sid, s);
    const msg = sh === "evolve" ? "let's drift somewhere new — follow me." : "let's go deeper into this.";
    return toTurn(s, msg, getMockTrajectory(sh));
  }

  const text = (req.message ?? "").trim();
  if (!text) { SESSIONS.set(sid, s); return toTurn(s, "tell me how you're feeling."); }

  // safety first
  if (CRISIS.test(text)) { SESSIONS.set(sid, s); return toTurn(s, CRISIS_REPLY); }

  // "ok / done / play" → go straight to a journey
  if (READY.test(text)) {
    if (Object.keys(s.weights).length > 0) {
      s.confidence = 1; SESSIONS.set(sid, s);
      return toTurn(s, "got it — let's play.", getMockTrajectory("deepen"));
    }
    SESSIONS.set(sid, s);
    return toTurn(s, "give me even one word for how you feel — or ask me to surprise you.");
  }

  // confirming a low-confidence guess
  if (Object.keys(s.weights).length > 0 && AFFIRM.test(text)) {
    s.confidence = Math.min(1, s.confidence + 0.4); s.turn++;
    const ready = s.confidence >= 1;
    SESSIONS.set(sid, s);
    return toTurn(s, ready ? "good — let's play." : "good — i've got you now.", ready ? getMockTrajectory("deepen") : null);
  }

  const guess = interpretMaybe(text);
  if (!guess) {
    SESSIONS.set(sid, s);
    return toTurn(s, "i can't quite place that yet — tell me what it feels like, or a moment it brings up.");
  }

  s.weights = accumulate(s.weights, guess.mood);
  s.confidence = guess.confident ? Math.min(1, s.confidence + 0.34) : Math.min(0.5, s.confidence + 0.18);
  s.turn++;
  const ready = guess.confident && s.confidence >= 1;
  SESSIONS.set(sid, s);

  const msg = guess.confident
    ? FOLLOWUPS[Math.min(s.turn - 1, FOLLOWUPS.length - 1)]
    : `it reads to me like ${guess.mood.toLowerCase()} — does that land, or am i off?`;
  return toTurn(s, msg, ready ? getMockTrajectory("deepen") : null);
}
