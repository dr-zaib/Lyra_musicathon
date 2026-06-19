"use client";

// The cited lyric line, surfaced at the top (Spotify-style) instead of cramped in the
// player. Shows the current track's richsync verse when playing; otherwise cycles mock
// lines so the transition reads even without real audio. Fades between lines.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const MOCK = [
  "the city hums, the night holds still",
  "we drove until the radio gave out",
  "morning light on an unmade bed",
];

export default function LyricBanner({ verse, mock = true }: { verse: string | null; mock?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (verse || !mock) return; // a real cited verse takes over; with mock off we show nothing
    const id = setInterval(() => setI((n) => (n + 1) % MOCK.length), 4500);
    return () => clearInterval(id);
  }, [verse, mock]);
  const text = verse ?? (mock ? MOCK[i] : null);
  if (!text) return <div className="h-5" />; // hold the line's height so layout doesn't jump
  return (
    <div className="relative h-5 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="absolute inset-0 block truncate text-center font-display text-sm italic text-muted"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
