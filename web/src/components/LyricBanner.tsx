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

export default function LyricBanner({ verse, mock = true, big = false }: { verse: string | null; mock?: boolean; big?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (verse || !mock) return; // a real cited verse takes over; with mock off we show nothing
    const id = setInterval(() => setI((n) => (n + 1) % MOCK.length), 4500);
    return () => clearInterval(id);
  }, [verse, mock]);
  const text = verse ?? (mock ? MOCK[i] : null);
  const h = big ? "h-7" : "h-5"; // taller line to fit the larger desktop type
  if (!text) return <div className={h} />; // hold the line's height so layout doesn't jump
  return (
    <div className={`relative overflow-hidden ${h}`}>
      {/* NO mode="wait": the new line must cross-fade IN immediately on skip, not wait for the
          old one to finish leaving (that made the verse lag a beat behind the track / look stuck
          on rapid skips). Both spans are absolute-positioned, so they overlap cleanly. */}
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className={`absolute inset-0 block truncate text-center font-display italic text-muted ${big ? "text-lg" : "text-sm"}`}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
