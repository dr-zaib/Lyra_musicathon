"use client";

// Playback settings: the known↔new discovery ratio and the skip mode.
//  - knownNew: fraction of NEW (discovery) vs KNOWN (go-to). Floored ~0.15 by the engine.
//  - skipMode: "scroll" (TikTok-style vertical swipe, default) | "arrows" (classic player).

export type PlaybackSettings = { knownNew: number; skipMode: "scroll" | "arrows" };

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
      </div>
    </div>
  );
}
