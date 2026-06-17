"use client";

// Playback settings: the known↔new discovery ratio, the skip mode, the lyrics language.
//  - knownNew: fraction of NEW (discovery) vs KNOWN (go-to). Floored ~0.15 by the engine.
//  - skipMode: "scroll" (TikTok-style vertical swipe, default) | "arrows" (classic player).
//  - language: ISO 639-1 code → Musixmatch lyrics_language. Default = the browser's language.

export type PlaybackSettings = { knownNew: number; skipMode: "scroll" | "arrows"; language: string };

// Lyrics languages we surface. ISO 639-1 → Musixmatch `lyrics_language`.
export const LANGS: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
];

// The browser's language, clamped to a supported code (falls back to English).
export function defaultLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  const base = (navigator.language || "en").split("-")[0].toLowerCase();
  return LANGS.some((l) => l.code === base) ? base : "en";
}

export default function Settings({
  settings,
  setSettings,
  onClose,
}: {
  settings: PlaybackSettings;
  setSettings: (s: PlaybackSettings) => void;
  onClose: () => void;
}) {
  const pctNew = Math.round(settings.knownNew * 100);
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-label="settings">
      <button className="absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="close settings" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl border border-border bg-bg-elev p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">settings</span>
          <button onClick={onClose} aria-label="close" className="text-muted-2 transition hover:text-fg">✕</button>
        </div>

        {/* known ↔ new */}
        <div className="mb-5">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>familiar</span>
            <span className="text-fg">{pctNew}% new</span>
            <span>discovery</span>
          </div>
          <input
            type="range" min={0} max={100} value={pctNew}
            onChange={(e) => setSettings({ ...settings, knownNew: Number(e.target.value) / 100 })}
            aria-label="known to new ratio"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
            style={{ background: `linear-gradient(to right, var(--accent) ${pctNew}%, var(--bg-elev-2) ${pctNew}%)` }}
          />
          <p className="mt-1 text-[11px] text-muted-2">how much Lyra leans into songs you don&apos;t know yet.</p>
        </div>

        {/* skip mode */}
        <div>
          <div className="mb-2 text-xs text-muted">skip between tracks</div>
          <div className="flex gap-2">
            {(["scroll", "arrows"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setSettings({ ...settings, skipMode: m })}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs transition ${
                  settings.skipMode === m
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border text-muted hover:text-fg"
                }`}
              >
                {m === "scroll" ? "scroll / swipe" : "← → arrows"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-2">
            {settings.skipMode === "scroll" ? "swipe up for next, down for previous." : "use the player arrows."}
          </p>
        </div>

        {/* lyrics language */}
        <div className="mt-5">
          <div className="mb-2 text-xs text-muted">lyrics language</div>
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setSettings({ ...settings, language: l.code })}
                className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                  settings.language === l.code
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border text-muted hover:text-fg"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-2">which language Lyra picks lyrics in — defaults to your browser&apos;s.</p>
        </div>
      </div>
    </div>
  );
}
